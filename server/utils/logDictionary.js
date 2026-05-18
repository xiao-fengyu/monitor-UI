/**
 * 日志字典 — 将系统日志模式映射为中文解释
 * 用于前端向普通用户展示可读的日志含义
 */

const LOG_PATTERNS = [
  // === SSH / 安全 ===
  {
    pattern: /Failed password for (.+?) from (.+?) port/,
    category: '安全',
    level: 'warning',
    template: (m) => {
      const [, user, ip] = m.match(/Failed password for (.+?) from (.+?) port/);
      return `SSH 登录失败：用户「${user}」从 IP ${ip} 尝试登录，密码错误`;
    },
  },
  {
    pattern: /Accepted password for (.+?) from (.+?) port/,
    category: '安全',
    level: 'info',
    template: (m) => {
      const [, user, ip] = m.match(/Accepted password for (.+?) from (.+?) port/);
      return `SSH 登录成功：用户「${user}」从 IP ${ip} 成功登录`;
    },
  },
  {
    pattern: /Received disconnect from (.+?) port/,
    category: '安全',
    level: 'info',
    template: (m) => {
      const [, ip] = m.match(/Received disconnect from (.+?) port/);
      return `SSH 断开连接：IP ${ip} 主动断开连接`;
    },
  },
  {
    pattern: /pam_unix\(sshd:auth\): authentication failure/,
    category: '安全',
    level: 'warning',
    template: () => 'SSH 认证失败：PAM 模块拒绝了认证请求，通常是密码错误或用户不存在',
  },
  {
    pattern: /Invalid user (.+?) from/,
    category: '安全',
    level: 'warning',
    template: (m) => {
      const [, user] = m.match(/Invalid user (.+?) from/);
      return `无效用户名：有人尝试使用不存在的用户「${user}」登录`;
    },
  },

  // === Cron 定时任务 ===
  {
    pattern: /pam_unix\(cron:session\): session (opened|closed) for user/,
    category: '定时任务',
    level: 'info',
    template: (m) => {
      const action = m.includes('opened') ? '开始执行' : '执行完毕';
      return `Cron 定时任务：${action}（系统正常行为，无需关注）`;
    },
  },
  {
    pattern: /\(root\) CMD/,
    category: '定时任务',
    level: 'info',
    template: () => 'Cron 定时任务执行中：root 用户的定时任务正在运行',
  },

  // === Systemd 服务 ===
  {
    pattern: /Started .* Service/,
    category: '服务',
    level: 'info',
    template: (m) => {
      const match = m.match(/Started (.+?)\./);
      const name = match ? match[1] : '某服务';
      return `服务启动：${name} 已成功启动`;
    },
  },
  {
    pattern: /Stopping .* Service/,
    category: '服务',
    level: 'info',
    template: (m) => {
      const match = m.match(/Stopping (.+?)\./);
      const name = match ? match[1] : '某服务';
      return `服务停止：${name} 正在关闭`;
    },
  },
  {
    pattern: /Stopped .* Service/,
    category: '服务',
    level: 'info',
    template: (m) => {
      const match = m.match(/Stopped (.+?)\./);
      const name = match ? match[1] : '某服务';
      return `服务已停止：${name} 已关闭`;
    },
  },

  // === Docker ===
  {
    pattern: /docker.*started/,
    category: 'Docker',
    level: 'info',
    template: () => 'Docker 服务已启动',
  },
  {
    pattern: /container.*died/,
    category: 'Docker',
    level: 'warning',
    template: () => 'Docker 容器已停止运行',
  },

  // === 网络 ===
  {
    pattern: /link up|link down/,
    category: '网络',
    level: 'info',
    template: (m) => `网络接口状态变更：${m.includes('up') ? '已连接' : '已断开'}`,
  },
  {
    pattern: /DHCP/,
    category: '网络',
    level: 'info',
    template: () => 'DHCP 网络配置更新：正在获取或更新 IP 地址',
  },

  // === 磁盘 / 存储 ===
  {
    pattern: /I\/O error/,
    category: '磁盘',
    level: 'err',
    template: () => '磁盘 I/O 错误：读写磁盘时发生错误，需立即检查硬件状态',
  },
  {
    pattern: /No space left on device/,
    category: '磁盘',
    level: 'err',
    template: () => '磁盘空间不足：设备已满，需要清理空间',
  },

  // === OpenClaw 相关 ===
  {
    pattern: /openclaw.*gateway.*start/i,
    category: 'OpenClaw',
    level: 'info',
    template: () => 'OpenClaw 网关已启动',
  },
  {
    pattern: /openclaw.*restart/i,
    category: 'OpenClaw',
    level: 'info',
    template: () => 'OpenClaw 网关正在重启',
  },
  {
    pattern: /429.*Too Many Requests/i,
    category: 'OpenClaw',
    level: 'warning',
    template: () => 'API 限流：请求频率过高，被服务端限流（429）',
  },
];

/**
 * 解析单条日志消息，返回中文解释
 * @param {string} message - 原始日志消息
 * @returns {Object|null} 匹配结果 { category, level, explanation }
 */
function parseLogMessage(message) {
  if (!message) return null;

  for (const rule of LOG_PATTERNS) {
    if (rule.pattern.test(message)) {
      return {
        category: rule.category,
        level: rule.level,
        explanation: rule.template(message),
        matched: true,
      };
    }
  }

  return null;
}

/**
 * 批量解析日志
 */
function parseLogs(logs) {
  return logs.map(log => {
    const parsed = parseLogMessage(log.message || log.MESSAGE || '');
    return {
      ...log,
      parsed: parsed || {
        category: '其他',
        level: log.level || 'info',
        explanation: log.message || log.MESSAGE || '',
        matched: false,
      },
    };
  });
}

module.exports = {
  LOG_PATTERNS,
  parseLogMessage,
  parseLogs,
};
