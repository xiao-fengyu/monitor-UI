const express = require('express');
const router = express.Router();
const { runBackup, getRepoInfo, getBackupHistory, getBackupSize, BACKUP_BRANCH } = require('../utils/backup');

/**
 * GET /api/backup/status
 * 获取备份状态和信息
 */
router.get('/status', async (req, res) => {
  try {
    const [repoInfo, history, size] = await Promise.all([
      getRepoInfo(),
      getBackupHistory(5),
      getBackupSize(),
    ]);
    res.json({
      success: true,
      data: {
        repo: repoInfo,
        recentBackups: history,
        size,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/run
 * 执行一次备份
 */
router.post('/run', async (req, res) => {
  try {
    const result = await runBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/history
 * 获取备份历史
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await getBackupHistory(limit);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/config
 * 获取备份配置
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      backupBranch: BACKUP_BRANCH,
      description: '备份分支包含完整项目代码、依赖和构建产物，用于零配置部署',
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
