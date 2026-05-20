const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3100;

app.use(cors());
app.use(express.json());

// 静态文件服务（生产环境提供 dist/）
app.use(express.static(path.join(__dirname, '../dist')));

// 路由占位（后续逐步实现）
const logRoutes = require('./routes/logs');
const monitorRoutes = require('./routes/monitor');
const backupRoutes = require('./routes/backup');

app.use('/api/logs', logRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/backup', backupRoutes);

// AI 模型配置路由
const aiConfigRoutes = require('./routes/ai-config');
app.use('/api/ai-config', aiConfigRoutes);

// 根路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'monitor-ui',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// SPA fallback（仅当 dist/index.html 存在时）
app.get('*', (req, res) => {
  const distPath = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.json({ message: '前端未构建，请访问 /api/* 路由' });
  }
});

app.listen(PORT, () => {
  console.log(`[monitor-ui] 后端服务已启动: http://localhost:${PORT}`);
});
