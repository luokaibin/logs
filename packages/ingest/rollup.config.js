import path from 'path';
import { fileURLToPath } from 'url';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copyTypes from './rollup-plugin-copy-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformsDir = path.resolve(__dirname, '../platforms');

const outputConfig = {
  sourcemap: false,
  exports: 'auto',
};

const commonjsPlugin = commonjs();

export default [
  {
    input: path.join(platformsDir, 'sls/slsClient.js'),
    output: [
      {
        ...outputConfig,
        file: 'dist/sls/slsClient.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        ...outputConfig,
        file: 'dist/sls/slsClient.cjs',
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        browser: false,
        preferBuiltins: true,
      }),
      commonjsPlugin,
      copyTypes({
        targets: [{ src: 'types/slsClient.d.ts', dest: 'dist/types/slsClient.d.ts' }],
      }),
    ],
  },
  {
    input: path.join(platformsDir, 'loki/lokiClient.js'),
    output: [
      {
        ...outputConfig,
        file: 'dist/loki/lokiClient.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        ...outputConfig,
        file: 'dist/loki/lokiClient.cjs',
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        browser: false,
        preferBuiltins: true,
      }),
      commonjsPlugin,
      copyTypes({
        targets: [{ src: 'types/lokiClient.d.ts', dest: 'dist/types/lokiClient.d.ts' }],
      }),
    ],
  },
];
