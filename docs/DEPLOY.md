# 📦 生产部署指南

> 新服务器克隆此仓库后，按步骤部署。

## 前置条件

- Node.js >= 18（推荐 v22 LTS）
- npm >= 9
- systemd（用于后端进程管理）
- Nginx（用于前端静态文件和 API 反向代理）

## 快速部署

### 方式一：完整备份分支部署（推荐，无需安装依赖）

```bash
# 1. 克隆 backup 分支（包含 node_modules 和 dist/）
git clone -b backup https://github.com/xiao-fengyu/monitor-UI.git
cd monitor-UI

# 2. 配置 AI 模型（可选，不配置则 AI 功能降级运行）
cp server/config/ai-model.json.example server/config/ai-model.json
# 编辑 server/config/ai-model.json，填入你的 API Key

# 3. 创建 systemd 服务
sudo tee /etc/systemd/system/monitor-ui.service << 'EOF'
[Unit]
Description=Monitor UI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/monitor-UI
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 4. 启动
sudo systemctl daemon-reload
sudo systemctl enable monitor-ui
sudo systemctl start monitor-ui

# 5. 验证
curl http://localhost:3100/api/health
```

### 方式二：源码部署（需 npm install）

```bash
git clone https://github.com/xiao-fengyu/monitor-UI.git
cd monitor-UI
npm install --production
npm run build   # 构建前端 dist/
# 后续步骤同方式一的 2-5
```

### Nginx 配置

```bash
# 复制示例配置
cp docs/nginx-example.conf /etc/nginx/conf.d/monitor-ui.conf

# 编辑配置，修改 server_name 和 dist/ 路径
sudo vi /etc/nginx/conf.d/monitor-ui.conf

# 测试并重载
sudo nginx -t
sudo nginx -s reload
```

## 配置 AI 模型

AI 翻译和诊断功能需要配置 OpenAI 兼容的 API。

1. 复制模板：`cp server/config/ai-model.json.example server/config/ai-model.json`
2. 编辑 `server/config/ai-model.json`：

```json
{
  "provider": "你的服务商名称",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-你的密钥",
  "model": "gpt-4o",
  "enabled": true
}
```

> 支持的 API：任何兼容 OpenAI `/chat/completions` 接口的服务。

## 防火墙

```bash
# 开放 HTTP 端口（如果用了 Nginx）
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --reload
```

## 常见问题

### Q: 页面空白 / 404
检查 Nginx `try_files` 配置是否正确指向 SPA 回退。

### Q: AI 功能不工作
1. 检查 `server/config/ai-model.json` 是否存在且 `enabled: true`
2. 检查后端日志：`journalctl -u monitor-ui -f`
3. 确认 API Key 有效且网络可达

### Q: 日志采集为空
确认 systemd journal 有数据：`journalctl -u openclaw-gateway --since "1 hour ago"`
