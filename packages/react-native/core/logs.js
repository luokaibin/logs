import { ConsoleLogger } from "@logbeacon/core/console-logger";
import { sendLog, getGlobalObject } from "../common/utils";
import { LOG_BEACON_GLOBAL_KEY } from "@logbeacon/core/constants";
import { localStorage } from "../db/index";
import { setupLifecycleListeners } from "../runtime/lifecycle";


const log = new ConsoleLogger({
  storage: localStorage,
  forwardLog: sendLog,
});

setupLifecycleListeners();

const g = getGlobalObject();
if (g) {
  g[LOG_BEACON_GLOBAL_KEY] = log;
}

export default log;
