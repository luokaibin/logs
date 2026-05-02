import path from 'path';
import { fileURLToPath } from 'url';
import resolve from '@rollup/plugin-node-resolve';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOG_ENCODER_PLACEHOLDER = 'logbeacon-internal:log-encoder';

/**
 * 将占位模块解析为对应平台的编码器入口（内存解析，不改源码文件）。
 * @param {'sls' | 'loki'} variant
 */
function createLogEncoderPlaceholderPlugin(variant) {
  const target =
    variant === 'sls'
      ? '@logbeacon/platforms/sls-encoder'
      : '@logbeacon/platforms/loki-encoder';
  return {
    name: `logbeacon-internal-log-encoder-${variant}`,
    async resolveId(id, importer) {
      if (id !== LOG_ENCODER_PLACEHOLDER) return null;
      const resolved = await this.resolve(target, importer, {
        skipSelf: true,
      });
      return resolved?.id ?? null;
    },
  };
}

/** 与 package.json `exports` 子路径一一对应（除 LogAggregator 两变体），各自独立 ESM。 */
const baseEntries = {
  serializeLogContent: 'src/serializeLogContent.js',
  utils: 'src/utils.js',
  'console-logger': 'src/ConsoleLogger.js',
  constants: 'src/constants.js',
  LogProcessor: 'src/LogProcessor.js',
  LogStore: 'src/LogStore.js',
  LogStorageBase: 'src/LogStorageBase.js',
};

const baseConfigs = Object.entries(baseEntries).map(([name, input]) => ({
  input: path.resolve(__dirname, input),
  output: {
    file: path.resolve(__dirname, 'lib/esm', `${name}.js`),
    format: 'es',
    sourcemap: true,
  },
  // external: ['fflate'],
  plugins: [resolve()],
}));

/** 同源 `LogAggregator.js`，按变体打入不同平台编码器。 */
const logAggregatorConfigs = ['sls', 'loki'].map((variant) => ({
  input: path.resolve(__dirname, 'src/LogAggregator.js'),
  output: {
    file: path.resolve(__dirname, 'lib/esm', `LogAggregator-${variant}.js`),
    format: 'es',
    sourcemap: true,
  },
  // external: ['fflate'],
  plugins: [createLogEncoderPlaceholderPlugin(variant), resolve()],
}));

export default [...baseConfigs, ...logAggregatorConfigs];
