import { LogAggregator as CoreLogAggregator } from "@logbeacon/core/LogAggregator";
import {MixinLogStore} from './LogStore.js';
export const LogAggregator = MixinLogStore(CoreLogAggregator);
