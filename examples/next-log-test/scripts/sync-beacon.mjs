import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.join(__dirname, '..');
const slsDist = path.join(exampleRoot, '../../packages/web/dist/sls');
const outDir = path.join(exampleRoot, 'public/beacon');

const files = ['beacon.js', 'beacon-sw.js'];

/**
 * 将 `packages/web/dist/sls` 下的 beacon 脚本复制到本示例 `public/beacon`。
 * @returns {boolean} 是否成功（源文件均存在）
 */
export function syncBeacon() {
  for (const name of files) {
    const src = path.join(slsDist, name);
    if (!fs.existsSync(src)) {
      console.error(
        `[sync-beacon] 找不到 ${src}\n` +
          '请先构建浏览器包：在仓库根目录执行 pnpm run build（或保持 web 的 rollup -w 运行）'
      );
      return false;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const name of files) {
    fs.copyFileSync(path.join(slsDist, name), path.join(outDir, name));
  }
  console.log('[sync-beacon] 已复制到', outDir);
  return true;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * 监视 web 产出的 SLS beacon；变更后重新同步（用于 core→web 链式重建后更新 public）。
 */
function watchWebDistAndSync() {
  const onChange = debounce(() => {
    if (syncBeacon()) {
      console.log('[sync-beacon] watch: 已随 web dist 更新');
    }
  }, 200);

  const attach = () => {
    if (!fs.existsSync(slsDist)) {
      return false;
    }
    fs.watch(slsDist, { persistent: true }, (eventType, filename) => {
      if (!filename || !files.includes(filename)) return;
      console.log(`[sync-beacon] 检测到 ${filename} (${eventType})`);
      onChange();
    });
    return true;
  };

  if (attach()) {
    return;
  }

  console.warn(
    '[sync-beacon] watch: 尚未发现 packages/web/dist/sls，等待 web 首次打包…'
  );
  const poll = setInterval(() => {
    if (attach()) {
      clearInterval(poll);
      syncBeacon();
      console.log('[sync-beacon] watch: 已开始监视 web/dist/sls');
    }
  }, 400);
}

function runWatchDev() {
  const trySync = () => {
    if (!syncBeacon()) {
      console.warn(
        '[sync-beacon] 首次同步跳过（等待 web 产出）；rollup watch 生成后会自动复制'
      );
    }
  };
  trySync();
  watchWebDistAndSync();

  const next = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '-p', '3100'],
    {
      cwd: exampleRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );

  const stop = () => {
    next.kill('SIGINT');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  next.on('exit', (code) => process.exit(code ?? 0));
}

const watchMode = process.argv.includes('--watch');

if (watchMode) {
  runWatchDev();
} else {
  if (!syncBeacon()) {
    process.exit(1);
  }
}
