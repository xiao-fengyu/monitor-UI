const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

const BACKUP_BRANCH = 'backup';
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * 获取 Git 仓库信息
 */
async function getRepoInfo() {
  const { stdout: branch } = await execAsync(
    'git rev-parse --abbrev-ref HEAD'
  );
  const { stdout: lastBackup } = await execAsync(
    `git log --format="%H %ci" ${BACKUP_BRANCH} -1 2>/dev/null || echo ""`
  ).catch(() => ({ stdout: '' }));

  const { stdout: branchExists } = await execAsync(
    `git branch --list ${BACKUP_BRANCH}`
  ).catch(() => ({ stdout: '' }));

  return {
    currentBranch: branch.trim(),
    backupBranch: BACKUP_BRANCH,
    backupBranchExists: branchExists.trim().length > 0,
    lastBackupCommit: lastBackup.trim() || '从未备份',
  };
}

/**
 * 执行备份
 * 1. 切换到 backup 分支（创建如果不存在）
 * 2. 复制 node_modules/ 和 dist/（如果存在）
 * 3. 提交并推送
 */
async function runBackup() {
  const logs = [];

  try {
    // 记录开始
    logs.push({ step: 'start', time: new Date().toISOString() });

    // 确保当前在 main 分支
    const { stdout: currentBranch } = await execAsync(
      'git rev-parse --abbrev-ref HEAD'
    );
    if (currentBranch.trim() !== 'main') {
      await execAsync('git checkout main');
      logs.push({ step: 'checkout-main', status: 'ok' });
    }

    // 拉取最新
    await execAsync('git pull origin main');
    logs.push({ step: 'pull-main', status: 'ok' });

    // 构建前端（如果 package.json 有 build 脚本）
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.build) {
        logs.push({ step: 'build-start', status: 'building' });
        try {
          await execAsync('npm run build', { cwd: PROJECT_ROOT, timeout: 120000 });
          logs.push({ step: 'build', status: 'ok' });
        } catch (err) {
          logs.push({ step: 'build', status: 'skip', error: err.message.slice(0, 200) });
        }
      }
    }

    // 切换到 backup 分支
    const { stdout: branchList } = await execAsync(
      `git branch --list ${BACKUP_BRANCH}`
    );
    if (!branchList.trim()) {
      await execAsync(`git checkout -b ${BACKUP_BRANCH}`);
      logs.push({ step: 'create-backup-branch', status: 'ok' });
    } else {
      await execAsync(`git checkout ${BACKUP_BRANCH}`);
      logs.push({ step: 'checkout-backup', status: 'ok' });
    }

    // 确保 node_modules 和 dist 在 .gitignore 中被注释掉（backup 分支需要包含它们）
    // 实际上 backup 分支应该忽略 .gitignore 中的 node_modules/dist
    // 使用 git add -f 强制添加

    const itemsToBackup = [];

    // node_modules
    if (fs.existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
      await execAsync('git add -f node_modules/', { cwd: PROJECT_ROOT });
      itemsToBackup.push('node_modules');
      logs.push({ step: 'add-node_modules', status: 'ok' });
    }

    // dist
    if (fs.existsSync(path.join(PROJECT_ROOT, 'dist'))) {
      await execAsync('git add -f dist/', { cwd: PROJECT_ROOT });
      itemsToBackup.push('dist');
      logs.push({ step: 'add-dist', status: 'ok' });
    }

    // 其他源代码
    await execAsync('git add -A', { cwd: PROJECT_ROOT });

    // 提交
    const timestamp = new Date().toISOString();
    await execAsync(
      `git commit -m "backup: automated backup ${timestamp}"`,
      { cwd: PROJECT_ROOT }
    );
    logs.push({ step: 'commit', status: 'ok', items: itemsToBackup });

    // 推送
    await execAsync(
      `git push origin ${BACKUP_BRANCH} --force`,
      { cwd: PROJECT_ROOT, timeout: 300000 }
    );
    logs.push({ step: 'push', status: 'ok' });

    // 回到 main
    await execAsync('git checkout main', { cwd: PROJECT_ROOT });
    logs.push({ step: 'return-main', status: 'ok' });

    return {
      success: true,
      logs,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    // 出错时确保回到 main
    try {
      await execAsync('git checkout main 2>/dev/null', { cwd: PROJECT_ROOT });
    } catch {}

    return {
      success: false,
      error: err.message,
      logs,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 获取备份历史
 */
async function getBackupHistory(limit = 20) {
  try {
    const { stdout } = await execAsync(
      `git log --format="%H|%ci|%s" ${BACKUP_BRANCH} -${limit} 2>/dev/null`
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      const [hash, date, ...msgParts] = line.split('|');
      return {
        hash: hash.slice(0, 7),
        fullHash: hash,
        date,
        message: msgParts.join('|'),
      };
    });
  } catch {
    return [];
  }
}

/**
 * 获取备份分支大小估算
 */
async function getBackupSize() {
  try {
    const { stdout } = await execAsync(
      `git rev-list --objects --no-walk $(git rev-parse ${BACKUP_BRANCH}) 2>/dev/null | git cat-file --batch-check 2>/dev/null | awk '{sum+=$3} END {print sum}'`
    );
    const bytes = parseInt(stdout) || 0;
    return {
      bytes,
      mb: (bytes / 1024 / 1024).toFixed(1),
    };
  } catch {
    return { bytes: 0, mb: '0' };
  }
}

module.exports = {
  BACKUP_BRANCH,
  getRepoInfo,
  runBackup,
  getBackupHistory,
  getBackupSize,
};
