import fs from 'fs';
import path from 'path';

/**
 * 构建结束后复制 .d.ts 到 dist。
 * @param {{ targets?: Array<{ src: string; dest: string }> }} options
 */
export default function copyTypes(options = {}) {
  const { targets = [] } = options;

  return {
    name: 'copy-types',

    writeBundle() {
      if (!targets?.length) return;

      for (const target of targets) {
        const { src, dest } = target;
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        try {
          fs.copyFileSync(src, dest);
          console.log(`Successfully copied ${src} to ${dest}`);
        } catch (err) {
          console.error(`Error copying ${src} to ${dest}:`, err);
        }
      }
    },
  };
}
