# 🖥️ OpenClaw 监控面板 (monitor-UI)

> 为 OpenClaw 多 Agent 系统打造的中文监控面板：日志聚合 · 监控告警 · 自动化备份

## 📊 项目状态

| 模块 | 状态 | 进度 |
|------|------|------|
| 📝 日志聚合 | ✅ 完成 | 100% — 前端面板 + 后端 API |
| 🚨 监控告警 | ✅ 完成 | 100% — 前端面板 + 后端 API |
| 💾 备份管理 | ✅ 完成 | 100% — 前端面板 + 后端 API |

**当前阶段**: ✅ 全部完成

---

## ✨ 功能概览

### ⚙️ 系统设置
- AI 模型配置（支持任意 OpenAI 兼容 API）
- Base URL / API Key / Model 自定义
- 一键测试连接
- 启用/关闭开关
- 未启用时自动回退到系统默认配置

### 📝 日志聚合
- 实时采集 systemd 日志（journalctl）
- **OpenClaw Gateway 内部应用日志**（读取 /tmp/openclaw/ 日志文件，与 `openclaw logs` 一致）
- 表单式搜索界面：服务名 + 级别多选 + 时间范围 + 关键词
- 支持预设时间范围和自定义日期时间范围选择器
- 级别多选过滤（ERROR / CRIT / WARNING / INFO / DEBUG）
- 搜索结果关键词高亮显示
- 中文解释可展开查看，减少表格视觉噪音
- **AI 翻译**：无规则匹配的日志可点击按钮进行 AI 中文翻译
- **AI 日志诊断**：自动分析日志，输出健康状态、问题清单、趋势判断、修复建议
- **AI 模型可配置**：支持在「系统设置」中自定义翻译/诊断用的 AI 模型（OpenAI 兼容 API）
- 自动刷新功能（可选 30s / 60s / 5min）
- 日志概览统计（按级别、按服务）

### 🚨 监控告警
- 服务存活监控（openclaw-gateway、searxng、nginx、docker 等 10 个关键服务）
- 系统资源监控（内存、磁盘、CPU 负载、运行时间）
- 内存/磁盘使用趋势图（ECharts 折线图）
- 实时告警检测（5 条规则：网关停止、搜索停止、内存>80%、磁盘>80%、负载>5）
- 告警级别：🔴 严重 / 🟡 警告

### 💾 备份管理
- Git 双分支策略（main 源码 + backup 完整部署包）
- 手动一键备份（含 node_modules 和 dist）
- 备份历史查看（时间、哈希、类型）
- 一键部署说明（含复制按钮）
- 零配置跨服务器部署

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

### 生产部署
```bash
# 克隆完整备份（含依赖）
git clone -b backup https://github.com/xiao-fengyu/monitor-UI.git

# 启动后端
cd monitor-UI && node server/index.js &

# 前端在 dist/ 目录，用 Nginx 指向即可
```

## 📖 文档

- [项目计划书](./PLAN.md)
- [日志含义大全](./docs/LOG_DICTIONARY.md)
- [告警指南](./docs/ALERT_GUIDE.md)
- [备份指南](./docs/BACKUP_GUIDE.md)

---

## 📋 最近变更

| 日期 | 变更内容 | 提交 |
|------|---------|------|
| 2026-05-19 | 🤖 新增 AI 模型前端可配置（/api/ai-config + 系统设置页面）| - |
| 2026-05-19 | 🤖 新增 AI 日志智能诊断面板（/api/logs/analyze + LogAnalysis 组件）| 3b0e24a |
| 2026-05-19 | 🐛 修复 openclaw-gateway 日志采集不全（改读 /tmp/openclaw/ 日志文件）| 305cf90 |
| 2026-05-19 | 🗑️ 去掉日志趋势图 + 新增 AI 翻译功能 | 81a2436 |
| 2026-05-19 | 🔧 日志面板全面优化 — 表单式搜索、级别过滤、自定义时间、关键词高亮、展开行、自动刷新 | a7f46d7 |
| 2026-05-19 | 修复 monitor-ops skill 注册问题 | a76dcfd |
| 2026-05-18 | 🎉 Phase 1-7 全部完成，v1.0.0 发布 | - |
| 2026-05-18 | Phase 6 备份面板增强 — 一键复制部署命令 | 0d854c6 |
| 2026-05-18 | Phase 5 监控面板增强 — 实时告警、内存/磁盘趋势图 | 3425280 |
| 2026-05-18 | Phase 4 日志趋势图 — ECharts 堆叠柱状图 | 061bd09 |
| 2026-05-18 | Phase 4 前端页面 — 三大面板 API 全接入 | ca84db6 |

---

## ⚠️ 约束

1. 先做计划书再干事
2. 严格按计划书执行
3. 禁止未经授权重启网关
4. 每次任务后更新 README.md

---

## 🏗️ 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| **前端** | React 18 + Vite 5 | 轻量快速，热更新开发 |
| **UI 组件** | Ant Design 5.x | 中文生态最好 |
| **图表** | ECharts + echarts-for-react | 百度出品，日志可视化强 |
| **路由** | React Router v6 | 声明式路由 |
| **后端** | Node.js + Express | 读取 systemd 日志、服务状态 |
| **日志采集** | journalctl | 无需额外日志系统 |
| **备份机制** | Git 双分支 | main 源码 + backup 完整部署 |

---

*最后更新：2026-05-19 12:26*
