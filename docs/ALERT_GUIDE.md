# 🚨 告警指南

> 本文档解释了监控面板中的所有告警规则、触发条件和应对措施。

## 告警级别

| 级别 | 颜色 | 说明 |
|------|------|------|
| 🔴 严重 | 红色 | 核心服务不可用，需立即处理 |
| 🟡 警告 | 橙色 | 资源接近阈值，建议关注 |

---

## 告警规则详情

### 1. OpenClaw 网关停止 🔴

| 项目 | 详情 |
|------|------|
| 监控对象 | `openclaw-gateway` 服务 |
| 触发条件 | `systemctl is-active` 返回 `inactive` |
| 影响 | 所有 Agent 无法工作，API 调用中断 |
| 处理步骤 | 1. `systemctl status openclaw-gateway` 查看状态<br>2. `journalctl -u openclaw-gateway -n 50` 查看最近日志<br>3. 确认原因后重启：`openclaw gateway restart` |

### 2. SearXNG 搜索服务停止 🔴

| 项目 | 详情 |
|------|------|
| 监控对象 | `searxng` 服务 |
| 触发条件 | `systemctl is-active` 返回 `inactive` |
| 影响 | 联网搜索功能不可用，Agent 无法搜索外部信息 |
| 处理步骤 | 1. `systemctl status searxng`<br>2. `journalctl -u searxng -n 50`<br>3. `systemctl restart searxng` |

### 3. 内存使用率过高 🟡

| 项目 | 详情 |
|------|------|
| 阈值 | 超过 80% |
| 影响 | 可能导致 OOM Kill，服务崩溃 |
| 处理步骤 | 1. `free -m` 查看内存分布<br>2. `top` 找出内存占用最高的进程<br>3. 清理不需要的进程或扩容 |

### 4. 磁盘使用率过高 🟡

| 项目 | 详情 |
|------|------|
| 阈值 | 超过 80% |
| 影响 | 可能导致日志无法写入、Docker 无法拉取镜像 |
| 处理步骤 | 1. `df -h` 查看磁盘使用<br>2. `du -sh /var/log/*` 查看日志大小<br>3. `docker system prune` 清理 Docker<br>4. 清理无用文件 |

### 5. 系统负载过高 🟡

| 项目 | 详情 |
|------|------|
| 阈值 | 1 分钟负载 > 5 |
| 影响 | 系统响应变慢，API 调用延迟增加 |
| 处理步骤 | 1. `top` 查看 CPU 占用<br>2. 找出异常进程<br>3. 必要时 `kill` 占用过高的进程 |

---

## 告警通知

- **UI 告警条**：告警发生时，监控面板顶部会显示红色/橙色横幅
- **刷新间隔**：监控数据每 30 秒自动刷新一次
- **手动刷新**：点击右上角刷新按钮可立即获取最新状态

---

## 自定义告警规则

如果需要调整告警阈值，可以修改以下文件：

```
src/components/MonitorPanel/MonitorPanel.jsx
```

找到 `ALERT_RULES` 数组，修改相应的 `check` 函数：

```javascript
const ALERT_RULES = [
  // 例如：将内存阈值从 80% 改为 85%
  {
    key: 'memory',
    check: (res) => res?.memory && (res.memory.used / res.memory.total > 0.85),
    level: 'warning',
    msg: '内存使用率超过 85%',
  },
  // ...
]
```

---

*最后更新：2026-05-18*
