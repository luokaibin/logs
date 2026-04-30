import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.join(__dirname, '..');
const slsDist = path.join(exampleRoot, '../../packages/web/dist/sls');
const outDir = path.join(exampleRoot, 'public/beacon');

const files = ['beacon.js', 'beacon-sw.js'];

for (const name of files) {
  const src = path.join(slsDist, name);
  if (!fs.existsSync(src)) {
    console.error(
      `[sync-beacon] 找不到 ${src}\n` +
        '请先构建浏览器包：在仓库根目录执行 pnpm --filter logbeacon build'
    );
    process.exit(1);
  }
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of files) {
  fs.copyFileSync(path.join(slsDist, name), path.join(outDir, name));
}
console.log('[sync-beacon] 已复制到', outDir);
