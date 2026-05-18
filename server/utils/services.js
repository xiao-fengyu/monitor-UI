const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 需要监控的关键服务
const WATCHED_SERVICES = [
  'openclaw-gateway',
  'searxng',
  'memos-control-ui',
  'sshd',
  'docker',
  'containerd',
  'cron',
  'nginx',
  'redis-server',
  'networking',
];

/**
 * 检查单个 systemd 服务状态
 */
async function checkServiceStatus(unit) {
  try {
    // 检查是否活跃
    const { stdout: statusOut } = await execAsync(
      `systemctl is-active ${unit} 2>/dev/null || echo "unknown"`
    );
    const isActive = statusOut.trim() === 'active';

    // 获取详细信息
    const { stdout: showOut } = await execAsync(
      `systemctl show ${unit} --property=MainPID,MemoryCurrent,CPUUsageNSec,ActiveEnterTimestamp 2>/dev/null`
    );

    const info = {};
    showOut.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        info[key.trim()] = rest.join('=').trim();
      }
    });

    // 内存（字节 → MB）
    const memBytes = parseInt(info.MemoryCurrent) || 0;
    const memoryMB = memBytes > 0 ? (memBytes / 1024 / 1024).toFixed(1) : null;

    // CPU 时间（纳秒 → 秒）
    const cpuNs = parseInt(info.CPUUsageNSec) || 0;
    const cpuSec = cpuNs > 0 ? (cpuNs / 1e9).toFixed(2) : null;

    return {
      unit,
      active: isActive,
      status: statusOut.trim(),
      pid: parseInt(info.MainPID) || 0,
      memoryMB,
      cpuSec,
      lastStart: info.ActiveEnterTimestamp || null,
    };
  } catch (err) {
    return {
      unit,
      active: false,
      status: 'not-found',
      pid: 0,
      memoryMB: null,
      cpuSec: null,
      lastStart: null,
    };
  }
}

/**
 * 检查所有受监控服务的状态
 */
async function checkAllServices() {
  const results = [];
  for (const unit of WATCHED_SERVICES) {
    const status = await checkServiceStatus(unit);
    results.push(status);
  }
  return results;
}

/**
 * 获取系统资源概览（CPU、内存、磁盘）
 */
async function getSystemResources() {
  const result = {};

  // 内存
  try {
    const { stdout } = await execAsync('free -m');
    const lines = stdout.trim().split('\n');
    const memLine = lines[1].split(/\s+/);
    result.memory = {
      total: parseInt(memLine[1]),
      used: parseInt(memLine[2]),
      free: parseInt(memLine[3]),
      available: parseInt(memLine[6]) || parseInt(memLine[3]),
      unit: 'MB',
    };
  } catch {
    result.memory = null;
  }

  // 磁盘
  try {
    const { stdout } = await execAsync("df -m / | tail -1");
    const parts = stdout.trim().split(/\s+/);
    result.disk = {
      total: parseInt(parts[1]),
      used: parseInt(parts[2]),
      available: parseInt(parts[3]),
      usePercent: parts[4],
      mount: parts[5],
    };
  } catch {
    result.disk = null;
  }

  // CPU 负载
  try {
    const { stdout } = await execAsync('cat /proc/loadavg');
    const parts = stdout.trim().split(/\s+/);
    result.loadavg = {
      '1min': parts[0],
      '5min': parts[1],
      '15min': parts[2],
    };
  } catch {
    result.loadavg = null;
  }

  // 运行时间
  try {
    const { stdout } = await execAsync('uptime -p');
    result.uptime = stdout.trim();
  } catch {
    result.uptime = null;
  }

  return result;
}

module.exports = {
  checkServiceStatus,
  checkAllServices,
  getSystemResources,
  WATCHED_SERVICES,
};
