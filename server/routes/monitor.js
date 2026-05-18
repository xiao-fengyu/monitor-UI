const express = require('express');
const router = express.Router();

// 获取监控状态
router.get('/status', (req, res) => {
  res.json({ services: {}, message: '监控功能开发中' });
});

module.exports = router;
