# 💾 备份指南

> 本文档解释了监控面板中的备份机制、使用方法和部署流程。

## 备份机制概述

### 双分支策略

本项目采用 **双分支策略** 来兼顾开发和部署：

| 分支 | 用途 | 包含内容 |
|------|------|---------|
| `main` | 源码开发 | 源代码、配置文件、文档、dist/ |
| `backup` | 同步分支 | 与 main 保持一致（保持向后兼容） |

> ⚠️ **2026-05-20 变更**：backup 分支不再包含 `node_modules`。原因是原生编译的二进制文件无法跨机器（不同 Node.js 版本/OS/CPU 架构）运行，且 3 万多个文件使 clone 速度极慢。现在统一使用 `npm install` 安装依赖。

---

## 部署方式

### 标准部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/xiao-fengyu/monitor-UI.git
cd monitor-UI

# 2. 安装依赖 + 构建前端
npm install && npm run build

# 3. 启动后端
node server/index.js &

# 4. 前端在 dist/ 目录，用 Nginx 指向即可
```

### 完整部署指南

详见 [`docs/DEPLOY.md`](./DEPLOY.md)，包含：
- systemd 服务配置
- Nginx 反向代理配置（含示例文件 `nginx-example.conf`）
- AI 模型配置
- 防火墙设置
- 更新部署步骤

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
- ✅ `dist/`（前端构建产物）
- ❌ ~~`node_modules/`~~（已移除，改为部署时 `npm install`）

---

## 回滚到指定版本

如果需要回滚到某个历史版本：

```bash
# 1. 查看历史提交
git log --oneline

# 2. 回退到该提交
git reset --hard <commit-hash>

# 3. 重新安装依赖 + 构建（如有依赖变更）
npm install && npm run build

# 4. 重启服务
node server/index.js &
```

---

## 注意事项

- **仓库大小**：移除 node_modules 后仓库约 5MB，clone 速度秒级
- **频率建议**：建议在每次重大更新后执行一次备份/提交
- **依赖一致性**：使用 `package-lock.json` 确保不同服务器安装相同版本的依赖

---

*最后更新：2026-05-20*
