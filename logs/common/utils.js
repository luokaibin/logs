import { serializeLogContent, serializeSingleValue } from "./serializeLogContent.js";

/**
 * 判断两个时间戳是否为同一天
 * @param {number} ts1 毫秒级时间戳
 * @param {number} ts2 毫秒级时间戳
 * @returns {boolean}
 */
export function isSameDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

/**
 * 请求公网IP和地区（使用 geojs）
 * @returns {Promise<{ip?: string, region?: string}>}
 */
export async function fetchPublicIPAndRegion() {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
    if (!res.ok) return {};
    const data = await res.json();
    const ip = data.ip;
    const region = data.country;
    return { ip, region };
  } catch (e) {
    return {};
  }
}

/**
 * 浏览器端获取/生成uuid 如果 window 不存在则返回空字符串
 * @returns {string}
 */
export function getOrCreateUUID() {
  if (typeof window === "undefined") return "";
  const key = "_client_uuid";
  let uuid = window.localStorage.getItem(key);
  if (!uuid) {
    if (window.crypto && window.crypto.randomUUID) {
      uuid = window.crypto.randomUUID();
      window.localStorage.setItem(key, uuid);
    } else {
      // fallback简单uuid
      uuid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      window.localStorage.setItem(key, uuid);
    }
  }
  return uuid;
}

/**
 * 获取日志的附加信息
 * @typedef {Object} LogExtraInfo
 * @property {number} time - 日志生成的时间戳（毫秒级）
 * @property {string} clientUuid - 客户端唯一标识
 * @property {string} userAgent - 用户代理字符串
 * @property {Object} screen - 屏幕信息
 * @property {number} screen.width - 屏幕宽度
 * @property {number} screen.height - 屏幕高度
 * @property {Object} window - 窗口信息
 * @property {number} window.width - 窗口宽度
 * @property {number} window.height - 窗口高度
 * @property {string} url - 当前页面URL
 */

/**
 * @returns {LogExtraInfo|Object} 如果 window 不存在则返回空对象，否则返回日志附加信息
 * @description 获取浏览器环境下的日志附加信息，如果非浏览器环境则返回空对象
 */
export function getLogExtraInfo() {
  if (typeof window === "undefined" || typeof window.document === "undefined") {
    return {};
  }
  const base = {
    time: Date.now(),
    clientUuid: getOrCreateUUID(),
    userAgent: window.navigator.userAgent,
    screen: serializeSingleValue({ width: window.screen.width, height: window.screen.height }),
    window: serializeSingleValue({ width: window.innerWidth, height: window.innerHeight }),
    url: window.location.href
  };
  return base;
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
 * 发送日志到service worker
 * @param {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @param {any[]} logs - 需要发送的日志数组
 */
export async function sendLog(level, logs) {
  if (typeof window === "undefined") return;
  
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

export const logFilter = {
  setKeyWords(keyWords) {
    if (typeof window === "undefined") return;
    if (typeof keyWords !== "string") return;
    window.localStorage.setItem("_logFilterKeyWords", keyWords);
  },
  getKeyWords() {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("_logFilterKeyWords");
  },
}

