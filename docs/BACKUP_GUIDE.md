# 💾 备份指南

> 本文档解释了监控面板中的备份机制、使用方法和一键部署流程。

## 备份机制概述

### 双分支策略

本项目采用 **双分支策略** 来兼顾开发和部署：

| 分支 | 用途 | 包含内容 |
|------|------|---------|
| `main` | 源码开发 | 源代码、配置文件、文档 |
| `backup` | 完整备份 | main 全部内容 + `node_modules` + `dist/` |

### 为什么需要 backup 分支？

- **零配置部署**：新服务器只需 `git clone` 即可运行，无需 `npm install` 和 `npm run build`
- **离线可用**：包含所有依赖，即使 npm 仓库不可用也能正常运行
- **快速恢复**：服务器故障后，几分钟内即可恢复完整服务

---

## 备份操作

### 手动备份

1. 在监控面板中进入「备份管理」页面
2. 点击「立即备份」按钮
3. 确认后即可在备份历史中查看记录

### 自动备份

> 后续版本将支持定时自动备份，当前版本仅支持手动触发

### 备份内容

每次备份会包含：
- ✅ 全部源代码（`src/`, `server/`, `docs/` 等）
- ✅ `package.json` 和依赖配置
- ✅ `node_modules/`（所有 npm 依赖包）
- ✅ `dist/`（前端构建产物）

---

## 一键部署流程

### 前提条件

- 目标服务器已安装 Node.js 和 Git
- 能访问 GitHub（`github.com`）

### 部署步骤

```bash
# 1. 克隆 backup 分支（包含全部依赖和构建产物）
git clone -b backup https://github.com/xiao-fengyu/monitor-UI.git

# 2. 进入项目目录
cd monitor-UI

# 3. 启动后端服务（Express，端口 3100）
node server/index.js &

# 4. 前端已在 dist/ 目录下，可通过 Nginx 或直接访问
# Nginx 配置示例：
# server {
#     listen 80;
#     location / {
#         root /path/to/monitor-UI/dist;
#         try_files $uri $uri/ /index.html;
#     }
#     location /api {
#         proxy_pass http://localhost:3100;
#     }
# }
```

---

## 备份历史管理

### 查看历史

在「备份管理」页面可以查看所有备份记录，包括：
- 提交哈希（SHA）
- 备份时间
- 备份类型（自动/手动）

### 回滚到指定备份

如果需要回滚到某个备份版本：

```bash
# 1. 切换到 backup 分支
git checkout backup

# 2. 找到目标提交
git log --oneline

# 3. 回退到该提交
git reset --hard <commit-hash>

# 4. 重启服务
node server/index.js &
```

---

## 注意事项

- **备份分支大小**：包含 `node_modules` 后仓库会变大（约 100-200MB），请确保网络稳定
- **频率建议**：建议在每次重大更新后手动备份一次
- **安全提醒**：`backup` 分支包含完整的依赖树，如果仓库是公开的，需注意依赖中是否包含敏感信息

---

*最后更新：2026-05-18*
