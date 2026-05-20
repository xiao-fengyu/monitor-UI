# 📦 生产部署指南

> 新服务器克隆此仓库后，按步骤部署。

## 前置条件

- Node.js >= 18（推荐 v22 LTS）
- npm >= 9
- systemd（用于后端进程管理）
- Nginx（用于前端静态文件和 API 反向代理）

## 部署步骤

### 1. 克隆仓库

```bash
git clone https://github.com/xiao-fengyu/monitor-UI.git
cd monitor-UI
```

### 2. 安装依赖 + 构建

```bash
# 安装所有依赖（包括构建工具）
npm install

# 构建前端生产包（生成 dist/）
npm run build
```

> 如需最小化生产依赖，可额外执行 `npm prune --production`。

### 3. 配置 AI 模型（可选，不配置则 AI 功能降级运行）

```bash
cp server/config/ai-model.json.example server/config/ai-model.json
# 编辑 server/config/ai-model.json，填入你的 API Key
```

### 4. 创建 systemd 服务

```bash
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
```

> 注意：把 `/path/to/monitor-UI` 替换为实际路径。

### 5. 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable monitor-ui
sudo systemctl start monitor-ui

# 验证
curl http://localhost:3100/api/health
```

### 6. Nginx 反向代理

```bash
# 复制示例配置
cp docs/nginx-example.conf /etc/nginx/conf.d/monitor-ui.conf

# 编辑配置，修改 server_name 和 dist/ 路径
sudo vi /etc/nginx/conf.d/monitor-ui.conf

# 测试并重载
sudo nginx -t && sudo nginx -s reload
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

## 更新部署

```bash
cd /path/to/monitor-UI
git pull
npm install        # 更新依赖
npm run build      # 重新构建前端
sudo systemctl restart monitor-ui
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

### Q: npm install 报错
- 确认 Node.js 版本 >= 18：`node -v`
- 清除缓存重试：`npm cache clean --force && npm install`
