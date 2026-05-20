# 📋 计划书：AI 日志诊断——单条报错锚点 + 上下文关联分析

> 创建日期：2026-05-20
> 状态：待审批
> 相关文件：`LogPanel.jsx`, `LogAnalysis.jsx`, `server/routes/logs.js`, `server/utils/logger.js`, `server/utils/logDictionary.js`

---

## 一、现状问题

当前 AI 日志诊断（`LogAnalysis` 组件 + `/api/logs/analyze` 接口）存在以下问题：

| 问题 | 表现 |
|------|------|
| **全文摘要式分析** | 把一段时间内所有日志丢给 AI，让它泛泛总结，没有针对性 |
| **无法聚焦单条报错** | 用户在日志列表里看到一条 ERROR，没法直接"针对这条"让 AI 分析 |
| **无上下文关联** | AI 拿到的只是错误日志的列表，缺少时间线上下文、同一 traceId 链路等 |
| **无法判断根因 vs 结果** | AI 只能描述表面问题，无法结合上下文推断"这条错是根因还是结果" |
| **无证据链** | 输出结果不带"依据了哪些上下文日志"，空口判断 |

---

## 二、目标

实现"点击某一条日志 → AI 以这条日志为中心，自动拉取上下文 → 输出精准诊断报告"的能力。

### 核心体验

1. 用户在日志列表里看到一条报错日志，点击"诊断"按钮
2. 系统自动以这条日志为**锚点**，抓取前后时间窗口 + 同服务/同 traceId 的上下文
3. AI 分析后输出：
   - 这条错误的含义
   - 上下文里的关键信号
   - 最可能的根因（含证据链）
   - 修复建议

---

## 三、技术设计

### 3.1 新增后端 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/logs/diagnose` | POST | 单条日志锚点诊断 + 上下文分析 |

**请求参数：**

```json
{
  "targetLog": {
    "timestamp": "2026-05-20T09:10:12.000Z",
    "level": "err",
    "unit": "openclaw-gateway",
    "message": "RedisTimeoutException: command timed out",
    "hostname": "server01"
  },
  "contextLines": 30,          // 锚点前后各取 N 行
  "contextWindowSeconds": 60,  // 时间窗口：锚点前后各 N 秒
  "sameService": true           // 是否拉取同服务上下文
}
```

**响应结构：**

```json
{
  "success": true,
  "data": {
    "target": {
      "timestamp": "...",
      "level": "err",
      "unit": "...",
      "message": "...",
      "explanation": "AI 对这条日志的中文解释"
    },
    "context": {
      "before": [...],  // 上下文前 N 条
      "after": [...],   // 上下文后 N 条
      "totalContextLines": 60
    },
    "diagnosis": {
      "errorType": "RedisTimeoutException",
      "isRootCause": false,
      "rootCauseAnalysis": "这条 Redis 超时不是根因，而是上游 DB 慢查询导致连接池耗尽的后果",
      "evidenceChain": [
        { "type": "upstream", "timestamp": "...", "message": "...", "description": "上游 3 秒前发生数据库慢查询" },
        { "type": "symptom", "timestamp": "...", "message": "...", "description": "连接池使用率已达 100%" }
      ],
      "severity": "high",
      "recommendations": ["排查 DB 慢查询", "增加连接池上限", "添加 Redis 超时告警"]
    }
  }
}
```

### 3.2 后端实现（`server/utils/logger.js`）

新增函数 `diagnoseLogEntry(options)`:

```javascript
async function diagnoseLogEntry(options) {
  // 1. 接收锚点日志（targetLog）
  // 2. 抓取上下文：
  //    a. 同服务、同时间窗口（±contextWindowSeconds）的日志
  //    b. 锚点前后各 contextLines 条日志
  // 3. 去重合并，按时间排序
  // 4. 构建 AI prompt（带明确角色、输入结构、输出 JSON schema）
  // 5. 调用 AI 模型 API
  // 6. 解析返回结果
}
```

**AI Prompt 设计：**

```
你是一位资深运维工程师。现在有一条报错日志，以及它的上下文日志。
请精准诊断这条报错。

【目标日志（锚点）】
[级别] [服务] [时间] 消息内容

【上下文日志（时间线）】
[时间] [级别] [服务] 消息
...（按时间排序，目标日志用 >>> 标记）...

请分析：
1. 目标日志的字面含义（中文）
2. 上下文里有哪些关键信号？
3. 这条报错是根因还是结果？为什么？
4. 证据链：列出支持你判断的上下文日志
5. 修复建议（具体可执行）

严格按以下 JSON 格式回复：
{
  "errorType": "错误类型",
  "explanation": "中文解释",
  "isRootCause": true/false,
  "rootCauseAnalysis": "根因分析（如果是结果，请说明真正的根因可能是什么）",
  "evidenceChain": [
    {"type": "upstream|downstream|correlation", "timestamp": "...", "message": "...", "description": "..."}
  ],
  "severity": "low|medium|high|critical",
  "recommendations": ["建议1", "建议2"]
}
```

### 3.3 前端改动

#### A. `server/routes/logs.js` — 新增路由

```javascript
const { diagnoseLogEntry } = require('../utils/logger');

router.post('/diagnose', async (req, res) => {
  try {
    const result = await diagnoseLogEntry(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

#### B. `src/services/api.js` — 新增 API 方法

```javascript
logsAPI.diagnose = (params) => api.post('/logs/diagnose', params).then(r => r.data);
```

#### C. `LogPanel.jsx` — 日志列表增加"诊断"按钮

在日志表格每行增加一个操作列（或集成到展开行），包含"诊断"按钮：

```jsx
{
  title: '操作',
  key: 'action',
  width: 80,
  render: (_, record) => (
    <Button
      type="link" size="small"
      onClick={() => handleDiagnose(record)}
      style={{ padding: 0 }}
    >
      🔍 诊断
    </Button>
  ),
}
```

#### D. 新增 `LogDiagnoseModal.jsx` 组件

一个模态框组件，点击"诊断"后弹出：

- 顶部：目标日志详情（时间、级别、服务、消息）
- 中间：AI 诊断结果（加载中时显示 Spin）
  - 错误类型 + 中文解释
  - 根因判断（是/否根因 + 分析）
  - 证据链列表
  - 严重度标签
  - 修复建议
- 底部：可展开查看完整上下文日志（折叠面板）
- 右上角：重新诊断按钮

#### E. `src/services/api.js` — 更新

新增 `logsAPI.diagnose` 方法。

---

## 四、执行步骤

| 步骤 | 任务 | 涉及文件 | 预估 |
|------|------|---------|------|
| **1** | 后端：新增 `diagnoseLogEntry()` 函数 | `server/utils/logger.js` | 上下文抓取 + prompt 构建 |
| **2** | 后端：新增 `/api/logs/diagnose` 路由 | `server/routes/logs.js` | 简单路由注册 |
| **3** | 前端：新增 `logsAPI.diagnose` | `src/services/api.js` | 一行 |
| **4** | 前端：日志表格新增"诊断"按钮列 | `src/components/LogPanel/LogPanel.jsx` | 表格列 + 点击处理 |
| **5** | 前端：新增 `LogDiagnoseModal` 组件 | `src/components/LogPanel/LogDiagnoseModal.jsx` | 完整模态框 UI |
| **6** | 测试 & 联调 | 全部 | 手动验证 |
| **7** | 更新 README.md | `README.md` | 记录变更 |
| **8** | git commit & push | - | 强制同步 |

---

## 五、验收标准

1. ✅ 日志列表每行都有"诊断"按钮
2. ✅ 点击后弹出模态框，显示 AI 分析结果
3. ✅ AI 结果包含：错误解释、根因判断、证据链、修复建议
4. ✅ 证据链引用了具体的上下文日志
5. ✅ 可展开查看完整上下文日志
6. ✅ 支持重新诊断
7. ✅ AI 调用失败时显示友好错误提示

---

## 六、风险与对策

| 风险 | 对策 |
|------|------|
| AI 返回格式不符合 JSON schema | 后端加 try-catch 解析，失败时返回降级结构 |
| 上下文日志太多导致 prompt 超长 | 限制上下文最大行数（默认前后各 30 行，可配置）|
| AI 调用超时 | 设置 30s 超时，前端显示超时提示 |
| openclaw-gateway 日志时间戳格式不一致 | 后端统一时间解析逻辑 |

---

## 七、不涉及的范围

- 不改现有的 LogAnalysis（全文诊断）组件，保留原功能
- 不改后端 AI 模型配置逻辑
- 不改 journalctl 日志采集逻辑
- 不做自动 traceId 关联（V2 阶段再做）
