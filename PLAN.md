# 计划书：OpenClaw 监控面板 (monitor-UI)

## 📋 项目信息

- **本地路径**: `/data/monitor-UI`
- **GitHub 仓库**: `https://github.com/xiao-fengyu/monitor-UI`
- **用户**: xiao-fengyu
- **创建日期**: 2026-05-18

---

## 一、核心需求

### 三个核心模块

| 模块 | 内容 |
|------|------|
| **1. 日志聚合** | 采集 openclaw-gateway + searxng 日志，中文展示，附带含义解释 |
| **2. 监控告警** | 服务存活、错误频率、模型可用性、A2A 任务、磁盘内存，异常即告警 |
| **3. 备份管理** | 定时 git push 配置与数据到 GitHub，可查看历史与手动触发 |

### 用户要求

1. 监控指标由 AI 自行设计
2. 日志聚合必须包括网关日志（journalctl -u openclaw-gateway）
3. UI 界面**全中文**
4. 提供说明文档，解释每条日志的含义（用户看不懂原始日志）
5. 先做初稿提交到 GitHub，每次修改都 commit

---

## 二、技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| **前端** | React + Vite | 轻量快速，热更新开发效率高 |
| **UI 组件** | Ant Design 5.x | 中文支持最好，组件丰富，开箱即用 |
| **图表** | Apache ECharts | 百度出品，中文生态好，日志可视化能力强 |
| **状态管理** | Zustand | 轻量简洁，比 Redux 学习成本低 |
| **后端代理** | Node.js + Express | 读取本地 systemd 日志、服务状态，提供 REST API |
| **日志采集** | journalctl + Node.js child_process | 无需额外日志系统，直接读系统日志 |
| **告警引擎** | Node.js 定时任务 + 规则匹配 | 轻量，无需引入 Prometheus 等重量级方案 |
| **备份机制** | simple-git (npm 包) | 在 Node.js 内执行 git add/commit/push |
| **部署** | 前端静态文件 + 后端 Node 服务 | 本地运行，无需外部服务器 |

---

## 三、项目结构

```
/data/monitor-UI/
├── package.json                    # 根包管理
├── README.md                       # 项目说明（每次任务后更新）
├── PLAN.md                         # 本计划书
├── .openclaw/
│   └── skills/monitor-ops/
│       └── SKILL.md                # 任务约束 skill
├── server/                         # Node.js 后端
│   ├── index.js                    # Express 服务入口 (端口 3100)
│   ├── routes/
│   │   ├── logs.js                 # 日志采集与查询 API
│   │   ├── monitor.js              # 监控状态与告警 API
│   │   └── backup.js               # 备份操作 API
│   └── utils/
│       ├── logParser.js            # 日志解析 & 中文解释引擎
│       ├── logDictionary.js        # 日志含义词典
│       ├── alertRules.js           # 告警规则定义
│       └── backup.js               # Git 备份逻辑
├── src/                            # React 前端
│   ├── main.jsx
│   ├── App.jsx                     # 路由与主布局
│   ├── store/                      # Zustand 状态管理
│   │   ├── useLogStore.js
│   │   ├── useMonitorStore.js
│   │   └── useBackupStore.js
│   ├── api/                        # API 调用封装
│   │   ├── logs.js
│   │   ├── monitor.js
│   │   └── backup.js
│   ├── components/
│   │   ├── Layout/                 # 主布局
│   │   │   ├── SideMenu.jsx        # 左侧菜单
│   │   │   └── TopAlert.jsx        # 顶部告警条
│   │   ├── LogPanel/               # 日志聚合模块
│   │   │   ├── LogList.jsx         # 日志列表（分页 + 虚拟滚动）
│   │   │   ├── LogFilter.jsx       # 筛选器（级别/时间/来源/关键词）
│   │   │   ├── LogTrendChart.jsx   # 日志趋势图
│   │   │   ├── LogExplanation.jsx  # 日志含义说明弹窗
│   │   │   └── GatewayLog.jsx      # 网关日志专区
│   │   ├── MonitorPanel/           # 监控告警模块
│   │   │   ├── ServiceStatus.jsx   # 服务存活卡片
│   │   │   ├── AlertList.jsx       # 告警列表
│   │   │   ├── AlertRules.jsx      # 告警规则配置
│   │   │   └── MetricChart.jsx     # 指标趋势图
│   │   └── BackupPanel/            # 备份管理模块
│   │       ├── BackupStatus.jsx    # 备份状态卡片
│   │       ├── BackupConfig.jsx    # 备份配置（定时开关、间隔）
│   │       └── BackupHistory.jsx   # 备份历史列表
│   └── styles/
│       └── global.css
├── docs/                           # 说明文档
│   ├── LOG_DICTIONARY.md           # 日志含义大全
│   ├── ALERT_GUIDE.md              # 告警含义与处理建议
│   └── BACKUP_GUIDE.md             # 备份使用指南
└── dist/                           # 前端构建产物
```

---

## 四、功能详细设计

### 4.1 日志聚合模块

#### 数据来源
- `journalctl -u openclaw-gateway -n 500 --no-pager` — 网关日志
- `journalctl -u searxng -n 500 --no-pager` — SearXNG 日志
- `journalctl -u openclaw-gateway --since "1 hour ago"` — 时间段查询

#### 日志处理流程
```
原始日志 → 正则解析(时间/级别/来源/消息) → 查字典(中文解释) → 分类 → 前端展示
```

#### 日志级别颜色
| 级别 | 颜色 | 说明 |
|------|------|------|
| ERROR | 🔴 红色 | 系统故障，需要关注 |
| WARN | 🟡 黄色 | 潜在问题，建议查看 |
| INFO | 🔵 蓝色 | 正常运行信息 |
| DEBUG | ⚪ 灰色 | 调试信息 |

#### 日志含义词典（示例）
| 日志关键词 | 中文解释 |
|-----------|---------|
| `429` | 模型调用频率受限（被限流），稍后自动恢复 |
| `TimeoutError` | 请求超时，可能是网络拥堵或对方服务响应慢 |
| `fetch failed` | 网络连接失败，检查网络或目标服务是否运行 |
| `filterRelevant failed` | 记忆相关性筛选失败，通常因为模型不可用 |
| `fallback to empty` | 没有可用候选结果，返回空数据 |
| `A2A task timeout` | Agent 间协作任务超时，对方模型可能卡住了 |
| `WebSocket disconnected` | 长连接断开，通常是网络波动或服务重启 |

#### 界面功能
- 实时日志滚动（可选开启/关闭）
- 按时间/级别/来源筛选
- 关键词搜索
- 点击日志弹出含义解释
- ECharts 趋势图（按时间统计各级别日志数量）

---

### 4.2 监控告警模块

#### 监控指标设计

| 监控项 | 采集方式 | 正常状态 | 告警阈值 | 严重级别 |
|--------|---------|---------|---------|---------|
| **openclaw-gateway 存活** | `systemctl is-active` | active | inactive | 🔴 严重 |
| **searxng 存活** | `systemctl is-active` | active | inactive | 🔴 严重 |
| **网关 ERROR 频率** | 5分钟内 ERROR 日志数 | < 5 条/5min | ≥ 5 条/5min | 🟡 警告 |
| **模型调用失败率** | 最近20次 API 调用 | < 10% | ≥ 50% | 🟡 警告 |
| **A2A 堆积任务** | 失败/超时任务数 | 0 | ≥ 3 | 🟡 警告 |
| **磁盘使用率** | `df -h /data` | < 80% | ≥ 85% | 🔴 严重 |
| **内存使用率** | `free -m` | < 80% | ≥ 90% | 🔴 严重 |
| **CPU 使用率** | `top -bn1` | < 70% | ≥ 95% | 🟡 警告 |
| **日志文件大小** | `du -sh /var/log/journal` | < 500MB | ≥ 1GB | 🟡 警告 |

#### 告警处理
- 告警发生时：UI 顶部红色横幅 + 声音提示（可关闭）
- 告警恢复时：自动标记为"已恢复"，记录持续时长
- 告警历史：保留最近 100 条，支持筛选

#### 界面功能
- 服务状态卡片（绿色/红色指示灯）
- 当前活跃告警列表
- 告警历史时间线
- 指标趋势图（最近 1 小时/24 小时）
- 告警规则配置（开关、阈值调整）

---

### 4.3 备份管理模块

#### 备份目标
**可移植性备份** — 备份内容需保证：在其他服务器上从 GitHub 拉取后，无需额外操作即可直接运行。

#### 备份内容（monitor-UI 项目全量）
| 项目 | 路径 | 说明 |
|------|------|------|
| 源码 | `/data/monitor-UI/src/` | React 前端源码 |
| 后端代码 | `/data/monitor-UI/server/` | Node.js 后端代码 |
| 依赖 | `/data/monitor-UI/node_modules/` | 所有 npm 依赖包 |
| 构建产物 | `/data/monitor-UI/dist/` | 前端编译后的文件 |
| 配置文件 | `/data/monitor-UI/package.json` 等 | 项目配置、环境变量 |
| 文档 | `/data/monitor-UI/docs/` | 说明文档 |

> 注意：`node_modules/` 和 `dist/` 通常被 `.gitignore` 排除，但为了可移植性，备份脚本会**强制包含**这些目录。Git 仓库中可放在独立分支（如 `backup` 分支）或使用 tar 附件方式存储。

#### 备份方式
- 通过 `simple-git` npm 包执行 git 操作
- 每次备份：`git add → git commit (带时间戳) → git push`
- 推送到 `https://github.com/xiao-fengyu/monitor-UI` 仓库
- 使用独立分支 `backup` 存储包含 node_modules/dist 的完整备份
- 主分支 `main` 保持干净的源码（标准 .gitignore）

#### 移植流程（其他服务器使用）
```bash
# 1. 克隆 backup 分支（包含全部依赖和构建产物）
git clone -b backup https://github.com/xiao-fengyu/monitor-UI.git

# 2. 启动后端
cd monitor-UI
node server/index.js &

# 3. 前端已构建完成，可直接访问或使用 nginx 指向 dist/
# 或直接: npm run serve
```

#### 界面功能
- 备份状态卡片（上次备份时间、下次计划时间、状态、备份大小）
- 备份配置面板（开关定时备份、设置间隔、手动触发、分支选择）
- 备份历史列表（时间、提交信息、变更文件数、备份大小）
- 手动备份按钮
- 移植指南说明（一键复制克隆命令）

---

## 五、开发迭代计划

### Phase 1：项目初始化（第 1 步）
- [x] 创建项目目录结构
- [x] 初始化 package.json（前端 + 后端）
- [x] 安装依赖
- [x] 创建 Vite + React 基础模板
- [x] 创建 Express 后端基础
- [x] 前后端联调测试
- [x] README.md 初始化
- [x] 提交到 GitHub：`feat: init project scaffold`

### Phase 2：后端 API 开发（第 2 步）
- [x] 日志采集 API（读取 journalctl）
- [x] 日志解析与字典匹配
- [x] 服务状态检查 API
- [x] 监控指标采集 API
- [x] Git 备份操作 API
- [x] 提交到 GitHub：`feat: add backend APIs`

### Phase 3：前端基础布局（第 3 步）
- [x] 主布局（侧边栏 + 顶部 + 内容区）
- [x] 路由配置（三个模块页面）
- [x] 顶部告警条组件
- [x] 提交到 GitHub：`feat: add frontend layout`

### Phase 4：日志聚合面板（第 4 步）
- [x] 日志列表组件
- [x] 筛选器组件
- [x] 日志趋势图（ECharts）
- [x] 日志含义说明（自动匹配中文解释）
- [x] 网关日志专区
- [x] 提交到 GitHub：`feat: log panel`

### Phase 5：监控告警面板（第 5 步）
- [x] 服务状态卡片
- [x] 告警列表组件
- [x] 指标趋势图（内存/磁盘 ECharts 趋势）
- [x] 告警规则配置
- [x] 提交到 GitHub：`feat: monitor panel`

### Phase 6：备份管理面板（第 6 步）
- [x] 备份状态组件
- [x] 备份配置组件
- [x] 备份历史列表
- [x] 一键部署说明
- [x] 提交到 GitHub：`feat: backup panel`

### Phase 7：文档与完善（第 7 步）
- [x] 日志含义文档 (LOG_DICTIONARY.md)
- [x] 告警指南文档 (ALERT_GUIDE.md)
- [x] 备份指南文档 (BACKUP_GUIDE.md)
- [x] 全局样式优化
- [x] 联调测试
- [x] 提交到 GitHub：`docs: complete documentation`

### Phase 8：上线与优化（第 8 步）
- [ ] 性能优化
- [ ] 错误边界处理
- [ ] README.md 完善
- [ ] 提交到 GitHub：`release: v1.0.0`

---

## 六、验收标准

- [x] 三个模块（日志聚合、监控告警、备份管理）全部可用
- [x] UI 全中文，无英文界面元素
- [x] 日志有含义解释，普通用户可理解
- [x] 告警规则可配置
- [x] 备份可手动触发 + 定时自动执行
- [x] 每次功能变更都提交到 GitHub
- [x] 未经用户授权绝不重启网关
- [x] 项目 README.md 持续更新

---

## 七、约束条件

1. 先做计划书再干事 ✅（本文件）
2. 严格按照本计划书执行，不得擅自变更
3. 禁止任意重启网关除非得到用户明确授权
4. 每次任务后维护项目目录 README.md

---

*最后更新：2026-05-18 15:29*
