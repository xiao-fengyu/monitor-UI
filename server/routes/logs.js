const express = require('express');
const router = express.Router();
const { fetchJournalLogs, fetchKeyServiceLogs, getLogOverview, KEY_SERVICES } = require('../utils/logger');
const { parseLogs } = require('../utils/logDictionary');

/**
 * GET /api/logs
 * 查询系统日志
 * 
 * 参数:
 *   unit     - systemd 服务名（如 openclaw-gateway）
 *   priority - 日志级别（0-7 或 emerg/alert/crit/err/warning/notice/info/debug）
 *   since    - 起始时间（如 "1 hour ago", "2026-05-18"）
 *   lines    - 最大行数（默认 200）
 *   grep     - 关键词过滤
 *   all      - 获取所有关键服务日志（true/false）
 *   overview - 获取日志概览（true/false）
 */
router.get('/', async (req, res) => {
  try {
    const { unit, priority, since, lines, grep, all, overview } = req.query;

    // 获取概览统计
    if (overview === 'true') {
      const data = await getLogOverview(since || '1 hour ago');
      return res.json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    // 获取所有关键服务日志
    if (all === 'true') {
      const logs = await fetchKeyServiceLogs(parseInt(lines) || 50);
      const parsedLogs = parseLogs(logs);
      return res.json({
        success: true,
        data: {
          logs: parsedLogs,
          total: parsedLogs.length,
          services: KEY_SERVICES,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // 普通查询
    const logs = await fetchJournalLogs({
      unit: unit || '',
      priority: priority || '',
      since: since || '1 hour ago',
      lines: parseInt(lines) || 200,
      grep: grep || '',
    });

    // 解析日志，附加中文解释
    const parsedLogs = parseLogs(logs);

    res.json({
      success: true,
      data: {
        logs: parsedLogs,
        total: parsedLogs.length,
        unit: unit || '(全部)',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[logs] error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/logs/trend
 * 获取日志趋势数据（按时间+级别聚合）
 * 
 * 参数:
 *   since - 起始时间（如 "6 hours ago"）
 */
router.get('/trend', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const since = req.query.since || '6 hours ago';

    // 获取所有日志，输出 JSON 格式
    const { stdout } = await execAsync(
      `journalctl --since "${since}" --output=json -q 2>/dev/null | head -5000`
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    const entries = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // 按小时聚合
    const hourlyData = {};
    entries.forEach(entry => {
      const ts = entry.__REALTIME_TIMESTAMP;
      if (!ts) return;
      const date = new Date(parseInt(ts) / 1000);
      const hourKey = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const priority = parseInt(entry.PRIORITY) || 6;

      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = { emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0 };
      }

      const levelMap = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
      const level = levelMap[priority] || 'info';
      hourlyData[hourKey][level]++;
    });

    // 排序并格式化
    const sortedHours = Object.keys(hourlyData).sort();
    const trendData = sortedHours.map(hour => ({
      time: hour,
      ...hourlyData[hour],
    }));

    res.json({
      success: true,
      data: trendData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logs/services
 * 获取所有关键服务列表
 */
router.get('/services', (req, res) => {
  res.json({
    success: true,
    data: KEY_SERVICES,
  });
});

module.exports = router;
