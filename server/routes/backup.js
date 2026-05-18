const express = require('express');
const router = express.Router();

// 获取备份状态
router.get('/status', (req, res) => {
  res.json({ message: '备份功能开发中' });
});

module.exports = router;
