import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import obfuscator from 'rollup-plugin-obfuscator';
import copyTypes from './rollup-plugin-copy-types.js';

/**
 * terser 插件的配置项
 * 用于压缩和混淆 JavaScript 代码
 */
const terserOptions = {
  format: {
    comments: false  // 移除所有注释，减小文件大小
  },
  compress: {
    drop_console: true,  // 移除所有 console.* 调用
    drop_debugger: true, // 移除所有 debugger 语句
    pure_funcs: ['console.log', 'console.info', 'console.debug']  // 移除特定的纯函数调用
  },
  mangle: false  // 混淆变量名，使代码更难读懂并减小文件大小
};

// 解析模块引用，帮助 Rollup 找到外部模块
const resolvePlugin = resolve({
  browser: true, // 优先使用为浏览器环境准备的模块
  preferBuiltins: false // 不优先使用 Node.js 内置模块
});

// 将 CommonJS 模块转换为 ES 模块
const commonjsPlugin = commonjs();

// 压缩代码，使用上面定义的 terserOptions
const terserPlugin = terser(terserOptions);

// 混淆器配置选项
const obfuscatorOptions = {
  global: false, // 不进行全局混淆，只混淆当前文件
  options: {
    compact: true,               // 压缩代码，移除空白字符和注释
    controlFlowFlattening: true, // 控制流扁平化，使代码逻辑更难理解
    deadCodeInjection: false,    // 不注入死代码，避免增加文件体积
    stringArray: true,           // 将字符串提取到数组中，通过索引引用
    stringArrayEncoding: ['rc4'], // 使用 RC4 算法加密字符串数组
    stringArrayThreshold: 0.75   // 75% 的字符串会被移到字符串数组中
  } 
};

// 混淆器插件
// const obfuscatorPlugin = obfuscator(obfuscatorOptions);

// 输出格式的通用配置
const outputConfig = {
  sourcemap: false,  // 生成 sourcemap 文件，便于调试
  exports: 'auto'   // 自动检测并选择最适合的导出模式（default, named 等）
};

// Rollup 配置导出
export default [
  {
    input: 'core/logs.js',
    output: [
      {
        ...outputConfig,
        file: `dist/core/logs.js`,
        format: 'esm',
        sourcemap: true
      },
      {
        ...outputConfig,
        file: `dist/core/logs.cjs`,
        format: 'cjs',
        sourcemap: true
      },
    ],
    plugins: [
      resolvePlugin,
      commonjsPlugin,
      terserPlugin,
      // 复制类型定义文件到 dist 目录
      copyTypes({
        targets: [
          { src: 'types/logs.d.ts', dest: 'dist/types/logs.d.ts' }
        ]
      }),
    ],
    // 外部依赖配置，这些依赖不会被打包进最终文件，而是在运行时加载
    // external: ['loglevel', 'ua-parser-js', 'fflate', 'pbf']
  },
  // service worker
  {
    // 入口文件路径
    input: 'sls/beacon-sw.js',
    output: {
      file: 'dist/sls/beacon-sw.js',
      format: 'esm',
      ...outputConfig
    },
    // 使用上面定义的插件数组
    plugins: [
      resolvePlugin,
      commonjsPlugin,
      terserPlugin,
      obfuscator(obfuscatorOptions), // 混淆插件，混淆源码部分
    ],
    // Tree Shaking 优化配置，移除未使用的代码
    treeshake: {
      moduleSideEffects: false,         // 假设模块没有副作用，可以安全地移除未使用的导入
      propertyReadSideEffects: false    // 假设属性读取没有副作用，可以更积极地移除未使用的代码
    }
  },
  // script 标签
  {
    // 入口文件路径
    input: 'sls/beacon.js',
    output: [
      {
        ...outputConfig,
        file: 'dist/sls/beacon.js',
        format: 'esm',
      },
    ],
    // 使用上面定义的插件数组
    plugins: [
      resolvePlugin,
      commonjsPlugin,
      terserPlugin,
      obfuscator(obfuscatorOptions), // 混淆插件，混淆源码部分
    ],
    // Tree Shaking 优化配置
    treeshake: {
      moduleSideEffects: false,         // 假设模块没有副作用
      propertyReadSideEffects: false    // 假设属性读取没有副作用
    }
  },
  // 服务端
  {
    input: 'sls/slsClient.js',
    output: [
      {
        ...outputConfig,
        file: `dist/sls/slsClient.js`,
        format: 'esm',
        sourcemap: true
      },
      {
        ...outputConfig,
        file: `dist/sls/slsClient.cjs`,
        format: 'cjs',
        sourcemap: true
      },
    ],
    plugins: [
      resolve({
        browser: false, // 优先使用为浏览器环境准备的模块
        preferBuiltins: true // 不优先使用 Node.js 内置模块
      }),
      commonjsPlugin,
      terserPlugin,
      // 复制 slsClient 类型定义文件到 dist 目录
      copyTypes({
        targets: [
          { src: 'types/slsClient.d.ts', dest: 'dist/types/slsClient.d.ts' }
        ]
      }),
    ],
    // 外部依赖配置，这些依赖不会被打包进最终文件，而是在运行时加载
    // external: ['loglevel', 'ua-parser-js', 'fflate', 'pbf']
  },
  // service worker
  {
    // 入口文件路径
    input: 'loki/beacon-sw.js',
    output: {
      file: 'dist/loki/beacon-sw.js',
      format: 'esm',
      ...outputConfig
    },
    // 使用上面定义的插件数组
    plugins: [
      resolvePlugin,
      commonjsPlugin,
      terserPlugin,
      obfuscator(obfuscatorOptions), // 混淆插件，混淆源码部分
    ],
    // Tree Shaking 优化配置，移除未使用的代码
    treeshake: {
      moduleSideEffects: false,         // 假设模块没有副作用，可以安全地移除未使用的导入
      propertyReadSideEffects: false    // 假设属性读取没有副作用，可以更积极地移除未使用的代码
    }
  },
  // script 标签
  {
    // 入口文件路径
    input: 'loki/beacon.js',
    output: [
      {
        file: 'dist/loki/beacon.js',
        format: 'esm',
        ...outputConfig,
      },
    ],
    // 使用上面定义的插件数组
    plugins: [
      resolvePlugin,
      commonjsPlugin,
      terserPlugin,
      obfuscator(obfuscatorOptions), // 混淆插件，混淆源码部分
    ],
    // Tree Shaking 优化配置
    treeshake: {
      moduleSideEffects: false,         // 假设模块没有副作用
      propertyReadSideEffects: false    // 假设属性读取没有副作用
    }
  },
  // 服务端
  {
    input: 'loki/lokiClient.js',
    output: [
      {
        ...outputConfig,
        file: `dist/loki/lokiClient.js`,
        format: 'esm',
        sourcemap: true
      },
      {
        ...outputConfig,
        file: `dist/loki/lokiClient.cjs`,
        format: 'cjs',
        sourcemap: true
      },
    ],
    plugins: [
      resolve({
        browser: false, // 优先使用为浏览器环境准备的模块
        preferBuiltins: true // 不优先使用 Node.js 内置模块
      }),
      commonjsPlugin,
      terserPlugin,
      // 复制 slsClient 类型定义文件到 dist 目录
      copyTypes({
        targets: [
          { src: 'types/lokiClient.d.ts', dest: 'dist/types/lokiClient.d.ts' }
        ]
      }),
    ],
    // 外部依赖配置，这些依赖不会被打包进最终文件，而是在运行时加载
    // external: ['loglevel', 'ua-parser-js', 'fflate', 'pbf']
  },
  // ESLint插件
  {
    input: 'eslint/index.js',
    output: [
      {
        ...outputConfig,
        file: 'dist/eslint/index.js',
        format: 'cjs',
        sourcemap: false
      },
      {
        ...outputConfig,
        file: 'dist/eslint/index.mjs',
        format: 'esm',
        sourcemap: false
      }
    ],
    plugins: [
      resolve({
        browser: false,
        preferBuiltins: true
      }),
      commonjsPlugin,
      // 复制 ESLint 插件的类型定义文件到 dist 目录
      copyTypes({
        targets: [
          { src: 'types/eslintPlugin.d.ts', dest: 'dist/types/eslintPlugin.d.ts' }
        ]
      })
      // 注意：不使用terser和obfuscator，保持ESLint插件代码的可读性
    ],
    external: ['eslint']
  },
];
