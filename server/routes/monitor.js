const express = require('express');
const router = express.Router();
const { checkServiceStatus, checkAllServices, getSystemResources, WATCHED_SERVICES } = require('../utils/services');

/**
 * GET /api/monitor/status
 * 获取所有关键服务状态
 */
router.get('/status', async (req, res) => {
  try {
    const services = await checkAllServices();
    const activeCount = services.filter(s => s.active).length;

    res.json({
      success: true,
      data: {
        services,
        summary: {
          total: services.length,
          active: activeCount,
          inactive: services.length - activeCount,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/monitor/status/:unit
 * 获取单个服务状态
 */
router.get('/status/:unit', async (req, res) => {
  try {
    const { unit } = req.params;
    const status = await checkServiceStatus(unit);
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/monitor/resources
 * 获取系统资源概览（CPU、内存、磁盘、负载）
 */
router.get('/resources', async (req, res) => {
  try {
    const resources = await getSystemResources();
    res.json({
      success: true,
      data: resources,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/monitor/services
 * 获取受监控服务列表
 */
router.get('/services', (req, res) => {
  res.json({
    success: true,
    data: WATCHED_SERVICES,
  });
});

module.exports = router;
