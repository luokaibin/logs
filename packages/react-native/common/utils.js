import {
  getLogExtraInfo as getLogExtraInfoOrigin,
  getOrCreateUUID as getOrCreateUUIDOrigin,
  getOrCreateSessionId,
  createMemoryStorage,
} from "@logbeacon/core/utils";
import { Dimensions } from "react-native";
import { serializeLogContent } from "./serializeLogContent";
import { localStorage } from "../db/index";
import { enqueueMessage } from "./messageQueue";
export {  getGlobalObject } from "@logbeacon/core/utils";

/**
 * React Native 环境下的日志附加信息（在 core 的 `time`、`extendedAttributes` 之上追加窗口/会话等字段）
 * @typedef {Object} RNLogExtraInfo
 * @property {number} time - 毫秒时间戳
 * @property {Object.<string, string>} extendedAttributes - 来自全局 `LOGS_CONTEXT`
 * @property {string} windowWidth - 当前窗口宽度
 * @property {string} windowHeight - 当前窗口高度
 * @property {string} orientation - 屏幕方向（portrait / landscape）
 * @property {string} clientUuid
 * @property {string} sessionId
 */

const sessionStorage = createMemoryStorage();

export const genReadableUUID = () => {
  let uuid;
  return () => {
    if (uuid) return uuid;
    const getOrCreateUUID = getOrCreateUUIDOrigin.bind(localStorage);
    uuid = getOrCreateUUID();
    return uuid;
  }
}

const readClientUUID = genReadableUUID();

/**
 * @returns {RNLogExtraInfo}
 */
export function getLogExtraInfo() {
  const extraInfo = getLogExtraInfoOrigin();
  const { width, height } = Dimensions.get("window");
  const orientation = width >= height ? "landscape" : "portrait";
  return {
    ...extraInfo,
    window: JSON.stringify({ width, height, orientation }),
    orientation,
    clientUuid: readClientUUID(),
    sessionId: getOrCreateSessionId.call(sessionStorage),
  };
}

/**
 * 发送日志到 Service Worker（或回退为页面事件）
 * @param {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @param {any[]} logs - 需要发送的日志数组
 * @returns {Promise<void>}
 */
export function sendLog(level, logs) {
  const extraInfo = getLogExtraInfo();
  const base = {
    level,
    content: serializeLogContent(logs),
    ...extraInfo
  };
  
  // 发送到 service worker，消息结构带 type
  const msg = {
    type: 'log',
    payload: base
  };

  enqueueMessage(msg);
}