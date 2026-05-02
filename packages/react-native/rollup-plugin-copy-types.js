import fs from 'fs';
import path from 'path';

/**
 * 创建一个简单的 Rollup 插件，用于复制类型定义文件到指定目录
 * @param {Object} options 插件配置选项
 * @param {Array<{src: string, dest: string}>} options.targets 要复制的文件目标列表
 * @returns {Object} Rollup 插件对象
 */
export default function copyTypes(options = {}) {
  const { targets = [] } = options;
  
  return {
    name: 'copy-types',
    
    // 在构建结束后执行
    writeBundle() {
      if (!targets || !targets.length) return;
      
      for (const target of targets) {
        const { src, dest } = target;
        
        // 确保目标目录存在
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        // 复制文件
        try {
          fs.copyFileSync(src, dest);
          console.log(`Successfully copied ${src} to ${dest}`);
        } catch (err) {
          console.error(`Error copying ${src} to ${dest}:`, err);
        }
      }
    }
  };
}
