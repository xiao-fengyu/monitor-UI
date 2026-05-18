# 🖥️ OpenClaw 监控面板 (monitor-UI)

> 为 OpenClaw 多 Agent 系统打造的中文监控面板：日志聚合 · 监控告警 · 自动化备份

## 📊 项目状态

| 模块 | 状态 | 进度 |
|------|------|------|
| 📝 日志聚合 | ✅ 完成 | 100% — 前端面板 + 后端 API |
| 🚨 监控告警 | ✅ 完成 | 100% — 前端面板 + 后端 API |
| 💾 备份管理 | ✅ 完成 | 100% — 前端面板 + 后端 API |

**当前阶段**: Phase 5 — ECharts 图表集成（Phase 4 前端页面已完成 ✅）

---

## ✨ 功能概览

### 日志聚合
- 实时采集 openclaw-gateway 和 searxng 日志
- 中文含义解释（看不懂日志也能明白发生了什么）
- 按级别/时间/来源筛选
- 日志趋势可视化

### 监控告警
- 服务存活监控（Gateway / SearXNG）
- 错误频率告警
- 模型可用性监控
- 磁盘/内存/CPU 资源监控
- 告警规则可配置

### 备份管理
- 定时自动备份配置与数据到 GitHub
- 手动一键备份
- 备份历史查看

---

## 🚀 快速开始

### 开发环境
```bash
# 安装依赖
npm install

# 同时启动前端 (Vite 5173) 和后端 (Express 3100)
npm run dev

# 分别启动
npm run dev:server  # 后端
npm run dev:client  # 前端
```

### 访问地址
- 前端开发服务器：http://localhost:5173
- 后端 API：http://localhost:3100
- 健康检查：http://localhost:3100/api/health

## 📖 文档

- [项目计划书](./PLAN.md)
- [日志含义大全](./docs/LOG_DICTIONARY.md) (待完成)
- [告警指南](./docs/ALERT_GUIDE.md) (待完成)
- [备份指南](./docs/BACKUP_GUIDE.md) (待完成)

---

## 📋 最近变更

| 日期 | 变更内容 | 提交 |
|------|---------|------|
| 2026-05-18 | Phase 2 进度：日志字典匹配完成（SSH/Cron/服务/磁盘/OpenClaw 等模式中文解释），已集成到日志 API | 10f2f2f |
| 2026-05-18 | Phase 2 进度：监控 API 完成（服务状态检查、系统资源 CPU/内存/磁盘/负载） | 7bfe260 |
| 2026-05-18 | Phase 2 进度：日志采集 API 完成（journalctl 读取、关键词过滤、服务日志合并、概览统计） | b6d9562 |
| 2026-05-18 | Phase 1 完成：项目脚手架搭建，目录结构，Express 后端 + Vite/React 前端，推送到 GitHub | c91637d |

---

## ⚠️ 约束

1. 先做计划书再干事
2. 严格按计划书执行
3. 禁止未经授权重启网关
4. 每次任务后更新 README.md

---

*最后更新：2026-05-18 15:29*
