const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const packagesRoot = path.resolve(monorepoRoot, 'packages');
/** 仅用于 watch：pnpm 真实文件在 .pnpm 下，需允许 Metro 读盘 */
const workspaceNodeModules = path.resolve(monorepoRoot, 'node_modules');

const babelRuntimeRoot = path.dirname(
  require.resolve('@babel/runtime/package.json', {paths: [projectRoot]}),
);

const reactNativeRoot = path.dirname(
  require.resolve('react-native/package.json', {paths: [projectRoot]}),
);
const reactRoot = path.dirname(
  require.resolve('react/package.json', {paths: [projectRoot]}),
);

/**
 * 用 Node 解析钉在本示例依赖树上的模块，避免 `nodeModulesPaths` 扫到仓库根里别的 RN/React。
 * @param {string} moduleName
 */
function resolveFromProject(moduleName) {
  try {
    const filePath = require.resolve(moduleName, {paths: [projectRoot]});
    return {type: 'sourceFile', filePath};
  } catch {
    return null;
  }
}

/**
 * @type {import('metro-config').MetroConfig}
 */
module.exports = mergeConfig(getDefaultConfig(projectRoot), {
  watchFolders: [packagesRoot, workspaceNodeModules],
  resolver: {
    /** 不要包含仓库根 `node_modules`，否则 Metro 会优先命中其中的 react-native@0.85 等 */
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    extraNodeModules: {
      '@babel/runtime': babelRuntimeRoot,
      'react-native': reactNativeRoot,
      react: reactRoot,
    },
    resolveRequest(context, moduleName, platform) {
      if (
        moduleName === '@babel/runtime' ||
        moduleName.startsWith('@babel/runtime/')
      ) {
        const r = resolveFromProject(moduleName);
        if (r) {
          return r;
        }
      }
      if (
        moduleName === 'react-native' ||
        moduleName.startsWith('react-native/')
      ) {
        const r = resolveFromProject(moduleName);
        if (r) {
          return r;
        }
      }
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        const r = resolveFromProject(moduleName);
        if (r) {
          return r;
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});
