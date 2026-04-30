import {
  getLogExtraInfo as getLogExtraInfoOrigin,
  getOrCreateUUID as getOrCreateUUIDOrigin,
  getOrCreateSessionId,
  createMemoryStorage,
} from "@logbeacon/core/utils";
import { serializeLogContent } from "./serializeLogContent";

export {  getGlobalObject } from "@logbeacon/core/utils";

/**
 * 浏览器环境下的日志附加信息（在 core 的 `time`、`extendedAttributes` 之上追加视口/会话等字段）
 * @typedef {Object} WebLogExtraInfo
 * @property {number} time - 毫秒时间戳
 * @property {Object.<string, string>} extendedAttributes - 来自全局 `LOGS_CONTEXT`
 * @property {string} window - `JSON.stringify({ width, height })`，视口 inner 尺寸（日志字段名，非全局 `window`）
 * @property {string} url - 当前页 `location.href`
 * @property {string} referrer - `document.referrer`
 * @property {string} clientUuid
 * @property {string} sessionId
 */

const persistentStorage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : createMemoryStorage();

export const getOrCreateUUID = getOrCreateUUIDOrigin.bind(persistentStorage);

/**
 * @returns {WebLogExtraInfo}
 */
export function getLogExtraInfo() {
  const extraInfo = getLogExtraInfoOrigin();
  return {
    ...extraInfo,
    window: JSON.stringify({ width: window.innerWidth, height: window.innerHeight }),
    url: window.location.href,
    referrer: document.referrer,
    clientUuid: getOrCreateUUID(),
    sessionId: getOrCreateSessionId.call(window.sessionStorage),
  };
}


/**
 * 获取指定作用域的 Service Worker
 * @param {string} scope - Service Worker 的作用域
 * @returns {Promise<ServiceWorker|null>} 激活的 Service Worker 或 null
 */
export async function getServiceWorker(scope = '/beacon/') {
  if (!navigator.serviceWorker) return null;
  
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    // 查找匹配作用域的注册
    const swRegistration = registrations.find(reg => 
      reg.scope.includes(scope)
    );
    if (!swRegistration) return null;
    
    // Service Worker 已经激活，直接返回
    if (swRegistration.active) return swRegistration.active;
    
    // 如果同时存在 installing 和 waiting，返回 null
    if (swRegistration.installing && swRegistration.waiting) return null;
    
    // Service Worker is installing or waiting for activation
    const worker = swRegistration.installing || swRegistration.waiting;
    if (!worker) return null;
    
    // Create a Promise to wait for Service Worker activation
    const waitForActivation = new Promise((resolve, reject) => {
      // Listen for state changes
      worker.addEventListener('statechange', function() {
        if (this.state === 'activated') {
          resolve(swRegistration.active);
        } else if (this.state === 'redundant') {
          // Service Worker 变为冗余状态（安装失败）
          reject(new Error('Service Worker installation failed'));
        }
      });
    });
    
    // 等待激活，最多等待 60 秒
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Service Worker activation timeout')), 60 * 1000);
    });
    
    return await Promise.race([waitForActivation, timeout]);
  } catch (e) {
    console.error('Failed to get Service Worker:', e);
    return null;
  }
}

/**
 * 通过 Service Worker 或页面 `CustomEvent` 转发日志消息
 * @param {{ type: string, payload: Object }} msg - 例如 `{ type: 'log', payload: { level, content, ...getLogExtraInfo() } }`
 */
export async function sendEvent(msg) {
  try {
    // 获取指定作用域的 Service Worker
    const serviceWorker = await getServiceWorker('/beacon/');
    if (!serviceWorker) {
      const event = new CustomEvent('sendLog', {
        detail: msg
      });
      window.dispatchEvent(event)
    } else {
      serviceWorker.postMessage(msg);
    }
  } catch (e) {
    console.error('Failed to send logs to Service Worker:', e);
  }
}

/**
 * 发送日志到 Service Worker（或回退为页面事件）
 * @param {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @param {any[]} logs - 需要发送的日志数组
 * @returns {Promise<void>}
 */
export async function sendLog(level, logs) {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof navigator === "undefined"
  ) {
    return 
  }

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

  sendEvent(msg);  
}