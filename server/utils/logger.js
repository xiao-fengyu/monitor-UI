const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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
 * 读取 journalctl 日志
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

  let cmd = `journalctl --no-pager --output=json --lines=${lines} --since="${since}"`;

  if (unit) {
    cmd += ` -u ${unit}`;
  }

  if (priority) {
    cmd += ` -p ${priority}`;
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

    // 关键词过滤（在 JS 层做，避免 journalctl grep 兼容问题）
    let filtered = logs;
    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = logs.filter(log =>
        (log.MESSAGE || '').toLowerCase().includes(lowerGrep)
      );
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

module.exports = {
  fetchJournalLogs,
  fetchKeyServiceLogs,
  getLogOverview,
  KEY_SERVICES,
};
