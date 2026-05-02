/** 打包 service worker 时由 Rollup `resolveId` 解析到 `@logbeacon/core/LogAggregator-sls` 或 `LogAggregator-loki`。 */
import { LogAggregator as CoreLogAggregator } from 'logbeacon-internal:core-log-aggregator';
import { MixinLogStore } from './LogStore.js';

export const LogAggregator = MixinLogStore(CoreLogAggregator);
