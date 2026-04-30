import { ConsoleLogger } from "@logbeacon/core/console-logger";
import { createMemoryStorage } from "@logbeacon/core/utils";
import { sendLog, getGlobalObject } from "../common/utils";
import { LOG_BEACON_GLOBAL_KEY } from "@logbeacon/core/constants";

function resolveStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return createMemoryStorage();
}

const log = new ConsoleLogger({
  storage: resolveStorage(),
  forwardLog: sendLog,
});

const g = getGlobalObject();
if (g) {
  g[LOG_BEACON_GLOBAL_KEY] = log;
}

export default log;
