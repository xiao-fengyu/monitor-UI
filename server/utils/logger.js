const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const execAsync = promisify(exec);

const isWindows = os.platform() === 'win32';

/**
 * 去除字符串中的 ANSI 转义码
 */
function stripAnsi(str) {
  if (str == null) return '';
  const s = typeof str === 'string' ? str : String(str);
  // 真正的 ESC 控制符: \x1b[...
  let cleaned = s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  // 字面 ANSI 码: [93m [39m [1m [22m [2m [90m 等（无 ESC 前缀）
  cleaned = cleaned.replace(/\[[0-9;]*[mGKHJ]/g, (match) => {
    // 只去掉确实是 ANSI 的，避免误删正常方括号内容
    // ANSI SGR 码范围: 0-109
    const code = match.slice(1, -1);
    if (/^\d+$/.test(code) && parseInt(code) <= 109) return '';
    return match; // 保留非 ANSI 的方括号内容
  });
  return cleaned;
}

const AI_CONFIG_PATH = path.join(__dirname, '../config/ai-model.json');

/**
 * 获取 OpenClaw 配置文件路径
 * 尝试多个可能的位置
 */
function getOpenclawConfigPath() {
  const candidates = [
    // Windows 常见位置
    path.join(os.homedir(), '.openclaw', 'openclaw.json'),              // C:\Users\...\
    'C:\\Users\\Administrator\\.openclaw\\openclaw.json',
    'D:\\.openclaw\\openclaw.json',
    // Linux 位置
    '/root/.openclaw/openclaw.json',
    '/home/*/.openclaw/openclaw.json',
  ];
  for (const p of candidates) {
    if (p.includes('*')) continue; // skip globs for now
    if (fs.existsSync(p)) return p;
  }
  // fallback
  return candidates[0];
}

/**
 * 获取 AI 模型配置
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
    const configPath = getOpenclawConfigPath();
    if (fs.existsSync(configPath)) {
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
    }
  } catch {
    // ignore
  }

  return null;
}

// 重点关注的关键服务（Windows 服务名）
const KEY_SERVICES = isWindows ? [
  'openclaw-gateway',
  'SearXNG',
  'Docker Desktop',
  'sshd',
  'Redis',
  'nginx',
  'TaskScheduler',
  'NlaSvc',          // 网络连接
] : [
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

// Windows 事件日志级别映射
const EVENTLOG_LEVEL_MAP = {
  'Error': 'err',
  'Warning': 'warning',
  'Information': 'info',
  'Critical': 'crit',
  'Verbose': 'debug',
};

/**
 * 获取 OpenClaw Gateway 日志
 * Windows: 从 %TEMP%\openclaw\ 或 %APPDATA% 读取日志文件
 */
async function fetchGatewayLogs(options = {}) {
  const { priority = '', since = '1 hour ago', lines = 200, grep = '' } = options;
  const priorityList = priority ? priority.split(',').map(p => p.trim()).filter(Boolean) : [];

  try {
    // Windows: 尝试多个日志目录
    const logDirs = [
      path.join(os.tmpdir(), 'openclaw'),           // %TEMP%\openclaw
      path.join(os.homedir(), '.openclaw', 'logs'),  // ~/.openclaw/logs
      'C:\\ProgramData\\openclaw\\logs',
      'D:\\openclaw\\logs',
    ];

    let logFile = null;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    for (const dir of logDirs) {
      if (!fs.existsSync(dir)) continue;
      const todayFile = path.join(dir, `openclaw-${today}.log`);
      const yesterdayFile = path.join(dir, `openclaw-${yesterday}.log`);
      if (fs.existsSync(todayFile)) { logFile = todayFile; break; }
      if (fs.existsSync(yesterdayFile)) { logFile = yesterdayFile; break; }
      // 取最新的 .log 文件
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.log')).sort().reverse();
        if (files.length > 0) { logFile = path.join(dir, files[0]); break; }
      } catch { /* ignore */ }
    }

    if (!logFile || !fs.existsSync(logFile)) {
      console.error('[logger] gateway log file not found in any of:', logDirs);
      return [];
    }
    console.log('[logger] gateway log file found:', logFile);

    console.log('[logger] reading gateway log from:', logFile);

    // 计算时间截断点
    let cutoffTime = null;
    try {
      if (since.includes('ago') || since.includes('hour') || since.includes('min') || since.includes('day')) {
        // 手动解析相对时间
        const match = since.match(/(\d+)\s*(hour|hr|minute|min|day)s?\s*ago/i);
        if (match) {
          const val = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          let ms = 0;
          if (unit.startsWith('hour')) ms = val * 3600000;
          else if (unit.startsWith('minute') || unit === 'min') ms = val * 60000;
          else if (unit.startsWith('day')) ms = val * 86400000;
          cutoffTime = Date.now() - ms;
        }
      } else {
        cutoffTime = new Date(since).getTime();
      }
    } catch { /* ignore */ }

    // 读文件末尾 — 直接用 fs 读取，避免 exec maxBuffer 溢出
    const readBytes = Math.min(lines * 2000, 1024 * 1024); // 最多读 1MB
    let stdout;
    if (isWindows) {
      const stats = fs.statSync(logFile);
      const start = Math.max(0, stats.size - readBytes);
      const fd = fs.openSync(logFile, 'r');
      const buffer = Buffer.alloc(stats.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      stdout = buffer.toString('utf8');
    } else {
      ({ stdout } = await execAsync(`tail -c ${readBytes} "${logFile}" 2>/dev/null`));
    }

    const rawLines = stdout.trim().split('\n').filter(Boolean);
    const logs = rawLines
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);

    // 时间过滤
    let filtered = logs;
    if (cutoffTime) {
      filtered = filtered.filter(log => {
        const t = new Date(log.time).getTime();
        return t >= cutoffTime;
      });
    }

    // 关键词过滤 — 搜索 message + unit + _meta.name
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = filtered.filter(log => {
        const msg = (log.message || '').toLowerCase();
        const unit = (log._meta?.name || '').toLowerCase();
        const level = (log._meta?.logLevelName || '').toLowerCase();
        return msg.includes(lowerGrep) || unit.includes(lowerGrep) || level.includes(lowerGrep);
      });
    }

    // 级别过滤
    if (priorityList.length > 0) {
      filtered = filtered.filter(log => {
        const levelName = (log._meta?.logLevelName || log.level || 'info').toLowerCase();
        const mapped = levelName === 'warn' ? 'warning' : levelName === 'err' || levelName === 'error' ? 'err' : levelName;
        return priorityList.includes(mapped);
      });
    }

    const recent = filtered.slice(-lines).reverse();
    return recent.map(log => {
      const levelName = (log._meta?.logLevelName || log.level || 'info').toLowerCase();
      const mappedLevel = levelName === 'warn' ? 'warning' : levelName === 'err' || levelName === 'error' ? 'err' : levelName;

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
        unit,
        message: stripAnsi(log.message || log['1'] || ''),
        hostname: log.hostname || os.hostname(),
      };
    });
  } catch (err) {
    console.error('[logger] gateway log read error:', err.message);
    return [];
  }
}

/**
 * 读取 Windows 事件日志
 * 替代 journalctl
 */
async function fetchWindowsEventLogs(options = {}) {
  const { unit = '', priority = '', since = '1 hour ago', lines = 200, grep = '' } = options;

  try {
    // 计算时间窗口
    let startTime;
    const match = since.match(/(\d+)\s*(hour|hr|minute|min|day)s?\s*ago/i);
    if (match) {
      const val = parseInt(match[1]);
      const u = match[2].toLowerCase();
      let ms = 0;
      if (u.startsWith('hour')) ms = val * 3600000;
      else if (u.startsWith('minute') || u === 'min') ms = val * 60000;
      else if (u.startsWith('day')) ms = val * 86400000;
      startTime = new Date(Date.now() - ms);
    } else {
      startTime = new Date(since);
    }

    const afterStr = startTime.toISOString();

    // 用 PowerShell 读取事件日志
    // 如果指定了 unit，尝试映射到 Windows 事件日志名称
    let logName = 'Application';
    if (unit) {
      const unitLower = unit.toLowerCase();
      if (unitLower.includes('openclaw')) logName = 'Application'; // openclaw 写在 Application 里
      else if (unitLower.includes('system')) logName = 'System';
      else if (unitLower.includes('security')) logName = 'Security';
    }

    const psCmd = `
      $after = [datetime]'${afterStr}';
      $logs = Get-WinEvent -LogName '${logName}' -MaxEvents ${lines} -ErrorAction SilentlyContinue | Where-Object { $_.TimeCreated -ge $after };
      $logs | ForEach-Object {
        $entry = @{
          TimeCreated = $_.TimeCreated.ToString('o');
          Level = $_.LevelDisplayName;
          ProviderName = $_.ProviderName;
          Message = $_.Message;
          Id = $_.Id;
        };
        $entry | ConvertTo-Json -Compress;
      }
    `.replace(/\s+/g, ' ').trim();

    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCmd}"`, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const rawLines = stdout.trim().split('\n').filter(Boolean);
    const logs = rawLines
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);

    // 级别过滤
    const priorityList = priority ? priority.split(',').map(p => p.trim()).filter(Boolean) : [];
    let filtered = logs;

    // 关键词过滤
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = filtered.filter(log =>
        (log.Message || '').toLowerCase().includes(lowerGrep)
      );
    }

    // 级别过滤
    if (priorityList.length > 0) {
      filtered = filtered.filter(log => {
        const winLevel = EVENTLOG_LEVEL_MAP[log.Level] || 'info';
        return priorityList.includes(winLevel);
      });
    }

    return filtered.slice(-lines).reverse().map(log => ({
      timestamp: log.TimeCreated || new Date().toISOString(),
      level: EVENTLOG_LEVEL_MAP[log.Level] || 'info',
      unit: log.ProviderName || unit || logName,
      message: stripAnsi(log.Message || ''),
      hostname: os.hostname(),
    }));
  } catch (err) {
    console.error('[logger] Windows event log error:', err.message);
    return [];
  }
}

/**
 * 读取系统日志（跨平台）
 * Linux: journalctl
 * Windows: Get-WinEvent (Application log) + OpenClaw gateway log files
 */
async function fetchJournalLogs(options = {}) {
  const { unit = '', priority = '', since = '1 hour ago', lines = 200, grep = '' } = options;

  // openclaw-gateway 专用日志文件
  if (unit === 'openclaw-gateway') {
    return fetchGatewayLogs({ priority, since, lines, grep });
  }

  if (isWindows) {
    // unit 为空时：合并 OpenClaw gateway 日志 + Windows 事件日志
    if (!unit) {
      try {
        const [gatewayLogs, eventLogs] = await Promise.all([
          fetchGatewayLogs({ priority, since, lines: Math.ceil(lines / 2), grep }),
          fetchWindowsEventLogs({ unit: '', priority, since, lines: Math.ceil(lines / 2), grep }),
        ]);
        const merged = [...gatewayLogs, ...eventLogs]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, lines);
        return merged;
      } catch {
        // 如果合并失败，至少返回 gateway 日志
        return fetchGatewayLogs({ priority, since, lines, grep });
      }
    }
    return fetchWindowsEventLogs({ unit, priority, since, lines, grep });
  }

  // Linux: journalctl
  const priorityList = priority ? priority.split(',').map(p => p.trim()).filter(Boolean) : [];

  let cmd = `journalctl --no-pager --output=json --lines=${lines} --since="${since}"`;
  if (unit) cmd += ` -u ${unit}`;

  try {
    const { stdout } = await execAsync(cmd);
    const rawLines = stdout.trim().split('\n').filter(Boolean);
    const logs = rawLines
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);

    let filtered = logs;
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = logs.filter(log => {
        const msg = log.MESSAGE != null ? String(log.MESSAGE).toLowerCase() : '';
        return msg.includes(lowerGrep);
      });
    }

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
      message: stripAnsi(log.MESSAGE || ''),
      hostname: log._HOSTNAME || '',
    }));
  } catch (err) {
    console.error('[logger] log fetch error:', err.message);
    return [];
  }
}

/**
 * 获取所有关键服务的最新日志
 */
async function fetchKeyServiceLogs(lines = 50) {
  const allLogs = [];
  for (const service of KEY_SERVICES) {
    try {
      const logs = await fetchJournalLogs({ unit: service, lines, since: '1 hour ago' });
      allLogs.push(...logs);
    } catch { /* skip */ }
  }
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return allLogs;
}

/**
 * 获取系统整体日志概览
 */
async function getLogOverview(since = '1 hour ago') {
  const counts = { emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0 };
  const logs = await fetchJournalLogs({ lines: 500, since });

  logs.forEach(log => {
    if (counts[log.level] !== undefined) counts[log.level]++;
  });

  return {
    total: logs.length,
    byLevel: counts,
    errorCount: counts.emerg + counts.alert + counts.crit + counts.err,
  };
}

/**
 * 调用 AI 模型 API
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
 * 翻译单条日志消息
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
 */
async function analyzeLogs(options = {}) {
  const { unit = '', since = '1 hour ago', lines = 200 } = options;

  try {
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

    const levelCounts = { emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0 };
    const serviceLogs = {};

    logs.forEach(log => {
      const lvl = (log.level || 'info').toLowerCase();
      if (levelCounts[lvl] !== undefined) levelCounts[lvl]++;
      const svc = log.unit || 'unknown';
      if (!serviceLogs[svc]) serviceLogs[svc] = [];
      serviceLogs[svc].push(log);
    });

    const errorLogs = logs.filter(l => ['emerg', 'alert', 'crit', 'err'].includes((l.level || '').toLowerCase()));
    const warningLogs = logs.filter(l => (l.level || '').toLowerCase() === 'warning');

    const keyMessages = [...errorLogs, ...warningLogs]
      .slice(0, 50)
      .map(l => `  [${l.level?.toUpperCase()}] [${l.unit}] ${l.message}`)
      .join('\n');

    const serviceStatus = Object.entries(serviceLogs).map(([name, svcLogs]) => {
      const errs = svcLogs.filter(l => ['emerg', 'alert', 'crit', 'err'].includes((l.level || '').toLowerCase())).length;
      return { name, total: svcLogs.length, errors: errs };
    });

    const config = getAIModelConfig();
    if (!config) {
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
3. recommendations 要具体可操作
4. trend.direction 只能选 worsening/stable/improving 之一`;

    let content;
    try {
      content = await callAI({
        config,
        messages: [{ role: 'user', content: prompt.substring(0, 6000) }],
        maxTokens: 2000,
        temperature: 0.3,
      });
    } catch { content = ''; }

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

/**
 * 单条日志锚点诊断
 */
async function diagnoseLogEntry(options = {}) {
  const { targetLog, contextLines = 30, contextWindowSeconds = 60, sameService = true } = options;

  if (!targetLog || !targetLog.message) {
    throw new Error('缺少目标日志参数');
  }

  const config = getAIModelConfig();
  if (!config) {
    return {
      target: { ...targetLog, explanation: '[请先在设置中配置 AI 模型]' },
      context: { before: [], after: [], totalContextLines: 0 },
      diagnosis: {
        errorType: 'unknown',
        explanation: '未配置 AI 模型，无法分析',
        isRootCause: null,
        rootCauseAnalysis: '请先在系统设置中配置 AI 模型',
        evidenceChain: [],
        severity: 'unknown',
        recommendations: ['在系统设置 → AI 模型配置中添加有效的 API 配置'],
      },
    };
  }

  try {
    let cutoffBefore = null;
    let cutoffAfter = null;
    try {
      const ts = new Date(targetLog.timestamp).getTime();
      if (ts > 0) {
        cutoffBefore = new Date(ts - contextWindowSeconds * 1000).toISOString();
        cutoffAfter = new Date(ts + contextWindowSeconds * 1000).toISOString();
      }
    } catch { /* ignore */ }

    const fetchOpts = {
      unit: sameService ? (targetLog.unit || '') : '',
      since: cutoffBefore || '1 hour ago',
      lines: contextLines * 3,
      priority: '',
    };

    let contextLogs = [];
    try { contextLogs = await fetchJournalLogs(fetchOpts); } catch { /* ignore */ }

    contextLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let anchorIndex = -1;
    const anchorMsg = targetLog.message.substring(0, 50).toLowerCase();
    const anchorTime = new Date(targetLog.timestamp).getTime();

    for (let i = 0; i < contextLogs.length; i++) {
      const log = contextLogs[i];
      const logTime = new Date(log.timestamp).getTime();
      const timeDiff = Math.abs(logTime - anchorTime);
      const msgMatch = log.message.substring(0, 50).toLowerCase().includes(anchorMsg) || anchorMsg.includes(log.message.substring(0, 30).toLowerCase());
      if (timeDiff < 2000 && msgMatch) {
        anchorIndex = i;
        break;
      }
    }

    if (anchorIndex === -1 && cutoffBefore) {
      for (let i = 0; i < contextLogs.length; i++) {
        const logTime = new Date(contextLogs[i].timestamp).getTime();
        if (logTime >= anchorTime - 1000) {
          anchorIndex = i;
          break;
        }
      }
    }

    const beforeStart = Math.max(0, anchorIndex - contextLines);
    const beforeLogs = contextLogs.slice(beforeStart, anchorIndex);
    const afterEnd = Math.min(contextLogs.length, anchorIndex + contextLines + 1);
    const afterLogs = anchorIndex >= 0
      ? contextLogs.slice(anchorIndex + 1, afterEnd)
      : contextLogs.slice(0, contextLines);

    const formatLogLine = (log, isTarget = false) => {
      const prefix = isTarget ? '>>> ' : '    ';
      const levelTag = `[${(log.level || 'info').toUpperCase()}]`;
      const timeStr = log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '?';
      return `${prefix}${timeStr} ${levelTag.padEnd(8)} [${log.unit || 'unknown'}] ${log.message}`;
    };

    const contextText = [
      (beforeLogs.map(l => formatLogLine(l)).join('\n')) || '    （无前置上下文）',
      formatLogLine(targetLog, true),
      (afterLogs.map(l => formatLogLine(l)).join('\n')) || '    （无后置上下文）',
    ].join('\n');

    const prompt = `你是一位资深运维工程师。现在有一条报错日志，以及它的上下文日志。
请精准诊断这条报错。

【目标日志（锚点）】
[${targetLog.level?.toUpperCase() || 'UNKNOWN'}] [${targetLog.unit || 'unknown'}] ${targetLog.timestamp || ''}
${targetLog.message}

【上下文日志（时间线，>>> 标记的是目标日志）】
${contextText}

请分析：
1. 目标日志的字面含义
2. 上下文里有哪些关键信号？
3. 这条报错是根因还是结果？
4. 证据链
5. 修复建议

严格按以下 JSON 格式回复：
{
  "errorType": "错误类型",
  "explanation": "中文解释",
  "isRootCause": true,
  "rootCauseAnalysis": "根因分析",
  "evidenceChain": [{"type": "upstream", "timestamp": "...", "message": "...", "description": "..."}],
  "severity": "low|medium|high|critical",
  "recommendations": ["建议1", "建议2"]
}`;

    let content;
    try {
      content = await callAI({
        config,
        messages: [{ role: 'user', content: prompt.substring(0, 8000) }],
        maxTokens: 2000,
        temperature: 0.3,
      });
    } catch { content = ''; }

    if (!content) {
      return {
        target: { ...targetLog, explanation: 'AI 调用失败' },
        context: { before: beforeLogs, after: afterLogs, totalContextLines: beforeLogs.length + afterLogs.length },
        diagnosis: {
          errorType: 'unknown',
          explanation: 'AI 模型调用失败',
          isRootCause: null,
          rootCauseAnalysis: '',
          evidenceChain: [],
          severity: 'unknown',
          recommendations: ['检查 AI 模型配置'],
        },
      };
    }

    let diagnosis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) diagnosis = JSON.parse(jsonMatch[0]);
      else throw new Error('No JSON found');
    } catch {
      diagnosis = {
        errorType: 'unknown',
        explanation: content.substring(0, 500),
        isRootCause: null,
        rootCauseAnalysis: '',
        evidenceChain: [],
        severity: 'unknown',
        recommendations: [],
      };
    }

    return {
      target: { ...targetLog, explanation: diagnosis.explanation || '' },
      context: { before: beforeLogs, after: afterLogs, totalContextLines: beforeLogs.length + afterLogs.length },
      diagnosis: {
        errorType: diagnosis.errorType || 'unknown',
        explanation: diagnosis.explanation || '',
        isRootCause: diagnosis.isRootCause,
        rootCauseAnalysis: diagnosis.rootCauseAnalysis || '',
        evidenceChain: Array.isArray(diagnosis.evidenceChain) ? diagnosis.evidenceChain : [],
        severity: diagnosis.severity || 'unknown',
        recommendations: Array.isArray(diagnosis.recommendations) ? diagnosis.recommendations : [],
      },
    };
  } catch (err) {
    console.error('[logger] diagnoseLogEntry error:', err.message);
    return {
      target: { ...targetLog },
      context: { before: [], after: [], totalContextLines: 0 },
      diagnosis: {
        errorType: 'error',
        explanation: '诊断出错: ' + err.message,
        isRootCause: null,
        rootCauseAnalysis: '',
        evidenceChain: [],
        severity: 'unknown',
        recommendations: [],
      },
    };
  }
}

module.exports = {
  fetchJournalLogs,
  fetchGatewayLogs,
  analyzeLogs,
  diagnoseLogEntry,
  fetchKeyServiceLogs,
  getLogOverview,
  translateLogMessage,
  KEY_SERVICES,
  isWindows,
};
