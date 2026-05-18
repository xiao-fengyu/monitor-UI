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
