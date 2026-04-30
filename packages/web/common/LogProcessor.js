import {LogProcessor as CoreLogProcessor} from "@logbeacon/core/LogProcessor";
import {MixinLogStore} from "./LogStore.js";

export const LogProcessor = MixinLogStore(CoreLogProcessor);