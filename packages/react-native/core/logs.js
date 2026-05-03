import { ConsoleLogger } from "@logbeacon/core/console-logger";
import { sendLog, getGlobalObject } from "../common/utils";
import { LOG_BEACON_GLOBAL_KEY } from "@logbeacon/core/constants";
import { localStorage } from "../db/index";
import { enqueueMessage } from "../common/messageQueue.js";
import { setupLifecycleListeners } from "../runtime/lifecycle";

/**
 * 指定日志上报接口地址（与 Web `data-beacon-url` 触发的 `config-update` 一致）。
 * @param {string} beaconUrl
 * @returns {Promise<void>}
 */
export function setBeaconUrl(beaconUrl) {
  if (typeof beaconUrl !== "string" || beaconUrl.trim().length === 0) {
    throw new TypeError("setBeaconUrl: beaconUrl must be a non-empty string");
  }
  return enqueueMessage({
    type: "config-update",
    payload: { beaconUrl: beaconUrl.trim() },
  });
}


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
