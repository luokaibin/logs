/** 打包时由 Rollup `resolveId` 解析到 `@logbeacon/core/LogAggregator-sls` 或 `LogAggregator-loki`（视构建变体而定）。 */
import { LogAggregator as CoreLogAggregator } from 'logbeacon-internal:core-log-aggregator';
import { MixinLogStore } from './LogStore.js';

export const LogAggregator = MixinLogStore(CoreLogAggregator);
