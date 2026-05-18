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

// 根路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'monitor-ui',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`[monitor-ui] 后端服务已启动: http://localhost:${PORT}`);
});
