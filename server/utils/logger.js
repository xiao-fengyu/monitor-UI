const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

const AI_CONFIG_PATH = path.join(__dirname, '../config/ai-model.json');

/**
 * 获取 AI 模型配置
 * 优先读取用户自定义配置，否则回退到 openclaw.json
 */
function getAIModelConfig() {
  // 1. 尝试读取用户自定义配置
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      const userConfig = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
      if (userConfig.enabled && userConfig.baseUrl && userConfig.apiKey && userConfig.model) {
        const url = new URL(userConfig.baseUrl);
        return {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname.replace(/\/$/, '') + '/chat/completions',
          protocol: url.protocol,
          apiKey: userConfig.apiKey,
          model: userConfig.model,
          source: 'user-config',
        };
      }
    }
  } catch (err) {
    console.warn('[logger] Failed to read user AI config:', err.message);
  }

  // 2. 回退到 openclaw.json
  try {
    const configPath = '/root/.openclaw/openclaw.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const provider = config.models?.providers?.openclawroot;
    if (provider && provider.apiKey && provider.baseUrl) {
      const url = new URL(provider.baseUrl);
      return {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname.replace(/\/$/, '') + '/chat/completions',
        protocol: url.protocol,
        apiKey: provider.apiKey,
        model: provider.models?.[0]?.id || 'gpt-4o-mini',
        source: 'openclaw-fallback',
      };
    }
  } catch {
    // ignore
  }

  return null;
}

// 重点关注的关键服务
const KEY_SERVICES = [
  'openclaw-gateway',
  'searxng',
  'memos-control-ui',
  'sshd',
  'docker',
  'nginx',
  'cron',
  'redis-server',
];

// 日志级别映射
const LEVEL_MAP = {
  '0': 'emerg',
  '1': 'alert',
  '2': 'crit',
  '3': 'err',
  '4': 'warning',
  '5': 'notice',
  '6': 'info',
  '7': 'debug',
};

/**
 * 读取 OpenClaw Gateway 日志文件
 * 路径：/tmp/openclaw/openclaw-YYYY-MM-DD.log（JSONL 格式）
 * 包含 journalctl 无法捕获的 Gateway 内部应用日志
 */
async function fetchGatewayLogs(options = {}) {
  const {
    priority = '',
    since = '1 hour ago',
    lines = 200,
    grep = '',
  } = options;

  const priorityList = priority ? priority.split(',').map(p => p.trim()).filter(Boolean) : [];

  try {
    // 确定日志文件：优先当天，回退昨天
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let logFile = `/tmp/openclaw/openclaw-${today}.log`;
    let fallbackFile = `/tmp/openclaw/openclaw-${yesterday}.log`;

    if (!fs.existsSync(logFile)) {
      logFile = fallbackFile;
    }

    if (!fs.existsSync(logFile)) {
      console.error('[logger] gateway log file not found:', logFile);
      return [];
    }

    // 计算时间截断点
    let cutoffTime = null;
    try {
      if (since.includes('ago') || since.includes('hour') || since.includes('min') || since.includes('day')) {
        const { stdout } = await execAsync(`date -d "${since}" +%s 2>/dev/null`);
        cutoffTime = parseInt(stdout.trim()) * 1000;
      } else {
        cutoffTime = new Date(since).getTime();
      }
    } catch { /* ignore */ }

    // 读文件末尾足够多的行
    const readBytes = Math.min(lines * 2000, 500000); // 估计每行约 2KB
    const { stdout } = await execAsync(`tail -c ${readBytes} "${logFile}" 2>/dev/null`);

    const rawLines = stdout.trim().split('\n').filter(Boolean);
    const logs = rawLines
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    // 时间过滤
    let filtered = logs;
    if (cutoffTime) {
      filtered = filtered.filter(log => {
        const t = new Date(log.time).getTime();
        return t >= cutoffTime;
      });
    }

    // 关键词过滤
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = filtered.filter(log =>
        (log.message || '').toLowerCase().includes(lowerGrep)
      );
    }

    // 级别过滤
    if (priorityList.length > 0) {
      filtered = filtered.filter(log => {
        const levelName = (log._meta?.logLevelName || log.level || 'info').toLowerCase();
        // 映射：WARN -> warning, ERR -> err, ERROR -> err
        const mapped = levelName === 'warn' ? 'warning' : levelName === 'err' || levelName === 'error' ? 'err' : levelName;
        return priorityList.includes(mapped);
      });
    }

    // 取最后 N 条并按时间倒序
    const recent = filtered.slice(-lines).reverse();

    return recent.map(log => {
      const levelName = (log._meta?.logLevelName || log.level || 'info').toLowerCase();
      const mappedLevel = levelName === 'warn' ? 'warning' : levelName === 'err' || levelName === 'error' ? 'err' : levelName;

      // 提取子系统名
      let unit = 'openclaw-gateway';
      if (log._meta?.name) {
        try {
          const nameObj = JSON.parse(log._meta.name);
          if (nameObj.plugin) unit = `plugin:${nameObj.plugin}`;
          else if (nameObj.subsystem) unit = `subsystem:${nameObj.subsystem}`;
        } catch {
          unit = log._meta.name;
        }
      }

      return {
        timestamp: log.time || new Date().toISOString(),
        level: mappedLevel,
        unit: unit,
        message: log.message || '',
        hostname: log.hostname || '',
      };
    });
  } catch (err) {
    console.error('[logger] gateway log read error:', err.message);
    return [];
  }
}

/**
 * 读取 journalctl 日志（非 openclaw-gateway 服务）
 * @param {Object} options
 * @param {string} options.unit - systemd 单元名（可选）
 * @param {string} options.priority - 日志级别过滤器（可选）
 * @param {string} options.since - 起始时间（如 '1 hour ago', '2026-05-18'）
 * @param {number} options.lines - 最大行数（默认 200）
 * @param {string} options.grep - 关键词过滤（可选）
 * @returns {Promise<Array>} 日志条目数组
 */
async function fetchJournalLogs(options = {}) {
  const {
    unit = '',
    priority = '',
    since = '1 hour ago',
    lines = 200,
    grep = '',
  } = options;

  // openclaw-gateway 使用专用日志文件读取
  if (unit === 'openclaw-gateway') {
    return fetchGatewayLogs({ priority, since, lines, grep });
  }

  // 多选级别：不在 journalctl -p 过滤（不支持列表），改为 JS 层过滤
  const priorityList = priority ? priority.split(',').map(p => p.trim()).filter(Boolean) : [];

  let cmd = `journalctl --no-pager --output=json --lines=${lines} --since="${since}"`;

  if (unit) {
    cmd += ` -u ${unit}`;
  }

  try {
    const { stdout } = await execAsync(cmd);
    const rawLines = stdout.trim().split('\n').filter(Boolean);
    const logs = rawLines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // 关键词过滤
    let filtered = logs;
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = logs.filter(log =>
        (log.MESSAGE || '').toLowerCase().includes(lowerGrep)
      );
    }

    // 级别过滤（多选支持）
    if (priorityList.length > 0) {
      filtered = filtered.filter(log => {
        const level = LEVEL_MAP[log.PRIORITY] || 'info';
        return priorityList.includes(level);
      });
    }

    return filtered.map(log => ({
      timestamp: log.__REALTIME_TIMESTAMP
        ? new Date(parseInt(log.__REALTIME_TIMESTAMP) / 1000).toISOString()
        : new Date().toISOString(),
      level: LEVEL_MAP[log.PRIORITY] || 'info',
      unit: log._SYSTEMD_UNIT || 'unknown',
      message: log.MESSAGE || '',
      hostname: log._HOSTNAME || '',
    }));
  } catch (err) {
    console.error('[logger] journalctl error:', err.message);
    return [];
  }
}

/**
 * 获取所有关键服务的最新日志（合并）
 * @param {number} lines - 每个服务的最大行数
 * @returns {Promise<Array>}
 */
async function fetchKeyServiceLogs(lines = 50) {
  const allLogs = [];
  for (const service of KEY_SERVICES) {
    try {
      const logs = await fetchJournalLogs({ unit: service, lines, since: '1 hour ago' });
      allLogs.push(...logs);
    } catch {
      // 服务可能不存在，跳过
    }
  }
  // 按时间排序
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return allLogs;
}

/**
 * 获取系统整体日志概览（最近 N 条各优先级数量）
 */
async function getLogOverview(since = '1 hour ago') {
  const counts = { emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0 };
  const logs = await fetchJournalLogs({ lines: 500, since });

  logs.forEach(log => {
    if (counts[log.level] !== undefined) {
      counts[log.level]++;
    }
  });

  return {
    total: logs.length,
    byLevel: counts,
    errorCount: counts.emerg + counts.alert + counts.crit + counts.err,
  };
}

/**
 * 调用 AI 模型 API（通用）
 */
function callAI({ config, messages, maxTokens = 500, temperature = 0.3 }) {
  const https = config.protocol === 'https:' ? require('https') : require('http');
  const payload = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: config.hostname,
      port: config.port,
      path: config.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content || '');
        } catch {
          resolve('');
        }
      });
    });
    req.on('error', () => resolve(''));
    req.write(payload);
    req.end();
  });
}

/**
 * 翻译单条日志消息为中文
 * 使用可配置的 AI 模型 API
 */
async function translateLogMessage(text) {
  if (!text || text.length < 5) return text;

  const config = getAIModelConfig();
  if (!config) return '[翻译] 请先在设置中配置 AI 模型';

  try {
    const content = await callAI({
      config,
      messages: [
        { role: 'system', content: 'You are a helpful translator. Translate the given log message into concise Chinese. Only output the translation, no explanations.' },
        { role: 'user', content: text.substring(0, 2000) }
      ],
      maxTokens: 300,
      temperature: 0.3,
    });
    return content || text;
  } catch {
    return text;
  }
}

/**
 * 分析日志并生成智能诊断报告
 * 使用本地 LLM 对日志进行结构化分析
 */
async function analyzeLogs(options = {}) {
  const {
    unit = '',
    since = '1 hour ago',
    lines = 200,
  } = options;

  try {
    // 获取日志（自动路由：openclaw-gateway 走文件，其他走 journalctl）
    const logs = await fetchJournalLogs({ unit, since, lines, priority: '' });

    if (!logs || logs.length === 0) {
      return {
        health: 'normal',
        summary: '所选时间范围内无日志记录',
        issues: [],
        recommendations: [],
        trend: { direction: 'stable', description: '无数据' },
        normalServices: [],
      };
    }

    // 统计数据
    const levelCounts = { emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0 };
    const serviceLogs = {};

    logs.forEach(log => {
      const lvl = (log.level || 'info').toLowerCase();
      if (levelCounts[lvl] !== undefined) levelCounts[lvl]++;

      const svc = log.unit || 'unknown';
      if (!serviceLogs[svc]) serviceLogs[svc] = [];
      serviceLogs[svc].push(log);
    });

    // 构建分析摘要
    const errorLogs = logs.filter(l => ['emerg', 'alert', 'crit', 'err'].includes((l.level || '').toLowerCase()));
    const warningLogs = logs.filter(l => (l.level || '').toLowerCase() === 'warning');

    // 提取关键消息（错误 + 警告，去重前 50 条）
    const keyMessages = [...errorLogs, ...warningLogs]
      .slice(0, 50)
      .map(l => `  [${l.level?.toUpperCase()}] [${l.unit}] ${l.message}`)
      .join('\n');

    // 统计各服务状态
    const serviceStatus = Object.entries(serviceLogs).map(([name, svcLogs]) => {
      const errs = svcLogs.filter(l => ['emerg', 'alert', 'crit', 'err'].includes((l.level || '').toLowerCase())).length;
      return { name, total: svcLogs.length, errors: errs };
    });

    // 读取 AI 模型配置
    const config = getAIModelConfig();
    if (!config) {
      // 降级：返回基础统计
      return {
        health: levelCounts.err + levelCounts.crit + levelCounts.alert + levelCounts.emerg > 0 ? 'error' : levelCounts.warning > 0 ? 'warning' : 'normal',
        summary: `共 ${logs.length} 条日志，错误 ${levelCounts.err + levelCounts.crit + levelCounts.alert + levelCounts.emerg} 条，警告 ${levelCounts.warning} 条。请先在设置中配置 AI 模型。`,
        issues: errorLogs.slice(0, 10).map(l => ({
          service: l.unit,
          description: l.message?.substring(0, 200),
          level: l.level,
        })),
        recommendations: [],
        trend: { direction: 'unknown', description: '未配置 AI 模型' },
        normalServices: serviceStatus.filter(s => s.errors === 0).map(s => s.name),
      };
    }

    const prompt = `你是一位资深的系统运维工程师。请分析以下系统日志并生成结构化诊断报告。

【统计信息】
- 总日志条数：${logs.length}
- ERROR 及以上级别：${levelCounts.err + levelCounts.crit + levelCounts.alert + levelCounts.emerg} 条
- WARNING：${levelCounts.warning} 条
- INFO：${levelCounts.info} 条

【各服务状态】
${serviceStatus.map(s => `- ${s.name}: ${s.total} 条日志, ${s.errors} 条错误`).join('\n')}

【关键日志（错误+警告）】
${keyMessages || '（无错误/警告日志）'}

请严格按以下 JSON 格式回复（不要加任何多余文字）：
{
  "health": "normal|warning|error|critical",
  "summary": "一句话总结整体状况（中文，50字以内）",
  "issues": [
    {
      "service": "服务名",
      "description": "问题描述（中文）",
      "level": "critical|warning|info",
      "pattern": "是否重复出现及频率"
    }
  ],
  "recommendations": ["具体可执行的修复建议1", "建议2"],
  "trend": {
    "direction": "worsening|stable|improving",
    "description": "趋势描述（中文）"
  },
  "normalServices": ["运行正常的服务名列表"]
}

注意：
1. health 只能选 normal/warning/error/critical 之一
2. issues 按严重程度排序，最多 8 个
3. recommendations 要具体可操作，不要说"请检查"这种废话
4. trend.direction 只能选 worsening/stable/improving 之一`;

    // 调用 AI 进行分析
    let content;
    try {
      content = await callAI({
        config,
        messages: [{ role: 'user', content: prompt.substring(0, 6000) }],
        maxTokens: 2000,
        temperature: 0.3,
      });
    } catch (err) {
      content = '';
    }

    // 解析 AI 返回结果
    if (!content) {
      return {
        health: levelCounts.err + levelCounts.crit > 0 ? 'error' : levelCounts.warning > 0 ? 'warning' : 'normal',
        summary: `共 ${logs.length} 条日志，错误 ${levelCounts.err + levelCounts.crit + levelCounts.alert + levelCounts.emerg} 条，警告 ${levelCounts.warning} 条。`,
        issues: errorLogs.slice(0, 5).map(l => ({ service: l.unit, description: l.message?.substring(0, 200), level: 'warning' })),
        recommendations: [],
        trend: { direction: 'unknown', description: 'AI 调用失败' },
        normalServices: serviceStatus.filter(s => s.errors === 0).map(s => s.name),
      };
    }

    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      analysis = {
        health: levelCounts.err > 0 ? 'error' : levelCounts.warning > 0 ? 'warning' : 'normal',
        summary: content.substring(0, 200),
        issues: [],
        recommendations: [],
        trend: { direction: 'unknown', description: '' },
        normalServices: [],
      };
    }

    return analysis;
  } catch (err) {
    console.error('[logger] analyzeLogs error:', err.message);
    return { health: 'unknown', summary: '分析出错: ' + err.message, issues: [], recommendations: [], trend: {}, normalServices: [] };
  }
}

module.exports = {
  fetchJournalLogs,
  fetchGatewayLogs,
  analyzeLogs,
  fetchKeyServiceLogs,
  getLogOverview,
  translateLogMessage,
  KEY_SERVICES,
};
