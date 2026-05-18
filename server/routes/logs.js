const express = require('express');
const router = express.Router();

// 获取日志列表
router.get('/', (req, res) => {
  res.json({ logs: [], message: '日志采集功能开发中' });
});

module.exports = router;
