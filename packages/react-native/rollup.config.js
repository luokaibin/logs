import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copyTypes from './rollup-plugin-copy-types.js';

const RN_CORE_LOG_AGGREGATOR_PLACEHOLDER =
  'logbeacon-internal:core-log-aggregator';

/**
 * `common/LogAggregator.js` 占位导入 → `@logbeacon/core/LogAggregator-sls|loki`（由 node-resolve 按 core 的 `exports` 解析到 `lib/esm`）。
 * @param {'sls' | 'loki'} variant
 */
function createRnCoreLogAggregatorPlaceholderPlugin(variant) {
  const target =
    variant === 'sls'
      ? '@logbeacon/core/LogAggregator-sls'
      : '@logbeacon/core/LogAggregator-loki';
  return {
    name: `rn-core-log-aggregator-${variant}`,
    async resolveId(id, importer) {
      if (id !== RN_CORE_LOG_AGGREGATOR_PLACEHOLDER) return null;
      const resolved = await this.resolve(target, importer, {
        skipSelf: true,
      });
      return resolved?.id ?? null;
    },
  };
}

const resolvePlugin = resolve({
  browser: true,
  preferBuiltins: false,
});

const commonjsPlugin = commonjs();

/** ESLint 插件在 Node 中加载，`eslint` 包 external（与 Web 包一致）。 */
const eslintResolvePlugin = resolve({
  browser: false,
  preferBuiltins: true,
});

const outputConfig = {
  sourcemap: false,
  exports: 'auto',
};

/** 宿主运行时提供，勿打进 bundle（RN 入口含 Flow，Rollup 无法解析）。 */
const rnExternals = ['react-native', 'react-native-quick-sqlite'];

/**
 * @param {'sls' | 'loki'} variant
 */
function createRnLogsEntryConfig(variant) {
  const dir = variant;
  return {
    input: 'core/logs.js',
    external: rnExternals,
    output: [
      {
        ...outputConfig,
        file: `dist/${dir}/logs.js`,
        format: 'esm',
        sourcemap: true,
      },
      {
        ...outputConfig,
        file: `dist/${dir}/logs.cjs`,
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
      createRnCoreLogAggregatorPlaceholderPlugin(variant),
      resolvePlugin,
      commonjsPlugin,
      ...(variant === 'sls'
        ? [
            copyTypes({
              targets: [
                { src: 'types/logs.d.ts', dest: 'dist/types/logs.d.ts' },
              ],
            }),
          ]
        : []),
    ],
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
    },
  };
}

function createRnEslintPluginConfig() {
  return {
    input: 'eslint/index.js',
    output: [
      {
        ...outputConfig,
        file: 'dist/eslint/index.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        ...outputConfig,
        file: 'dist/eslint/index.mjs',
        format: 'esm',
        sourcemap: false,
      },
    ],
    plugins: [
      eslintResolvePlugin,
      commonjsPlugin,
      copyTypes({
        targets: [
          {
            src: 'types/eslintPlugin.d.ts',
            dest: 'dist/types/eslintPlugin.d.ts',
          },
        ],
      }),
    ],
    external: ['eslint'],
  };
}

/**
 * 与 {@link packages/web/rollup.config.js} 对齐：统一入口 + 占位区分 SLS/Loki；另打包 ESLint 插件供宿主工程 lint 使用。
 */
export default [
  createRnLogsEntryConfig('sls'),
  createRnLogsEntryConfig('loki'),
  createRnEslintPluginConfig(),
];
