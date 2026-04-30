/**
 * Web Storage 形态的内存实现（无 localStorage 等持久化层时使用）。
 * @returns {{ setItem(key: string, value: string): void, getItem(key: string): string | null }}
 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    setItem(key, value) {
      map.set(key, String(value));
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
  };
}

/** FNV-1a 64-bit：offset basis */
const FNV1A_64_OFFSET = 14695981039346656037n;
/** FNV-1a 64-bit：prime */
const FNV1A_64_PRIME = 1099511628211n;
const FNV1A_64_MASK = 0xffffffffffffffffn;

/**
 * UTF-8 字节序列；优先用全局 `TextEncoder`（浏览器 / 现代 Node / RN），否则纯 JS 回退（如旧 Node 无全局 TextEncoder）。
 * @param {string} str
 * @returns {Uint8Array}
 */
export function utf8Bytes(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        i++;
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
      } else {
        out.push(0xef, 0xbf, 0xbd);
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out.push(0xef, 0xbf, 0xbd);
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

/**
 * 为日志正文生成去重键（FNV-1a 64-bit，输入按 UTF-8 字节计算）。
 * 同步、轻量，不依赖 crypto.subtle；需运行环境支持 **BigInt**（Node 10+、现代浏览器与 Hermes）。
 * 非密码学强度，仅用于短时间窗内的内容去重。
 * @param {string} str
 * @returns {string} 固定 16 位十六进制小写字符串
 */
export function dedupContentKey(str) {
  const bytes = utf8Bytes(str);
  let h = FNV1A_64_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * 判断两个时间戳是否为同一天
 * @param {number} ts1 毫秒级时间戳
 * @param {number} ts2 毫秒级时间戳
 * @returns {boolean}
 */
export function isSameDay(ts1, ts2) {
  const d1 = new Date(Number(ts1));
  const d2 = new Date(Number(ts2));
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
 * 生成随机前缀字符串（16位大写十六进制）
 * @returns {string}
 */
export function generateRandomPrefix() {
  let uuid;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    uuid = crypto.randomUUID();
  } else {
    // 生成 16 字节的随机十六进制字符串
    const hexChars = '0123456789ABCDEF';
    uuid = '';
    for (let i = 0; i < 32; i++) {
      uuid += hexChars[Math.floor(Math.random() * 16)];
    }
  }
  return uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
}

/**
 * 生成标准 UUID v4（RFC 4122）。
 * 优先使用 Web Crypto 的 getRandomValues（CSPRNG）；不可用时退回 Math.random（非密码学强度）。
 * @returns {string} 如 xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateUUIDv4() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * 获取或创建客户端唯一 ID（键名 `_client_uuid`），并写入存储。
 * 必须通过外部绑定 `this` 调用（例如 `getOrCreateUUID.call(localStorage)` 或先 `bind`），
 * 要求 `this` 提供与 Web Storage 一致的方法：`getItem(key)`、`setItem(key, value)`。
 * 应绑定**持久化**存储（如 `localStorage`、RN 侧的 AsyncStorage/MMKV 适配对象），以便安装期内多次启动仍复用同一 UUID。
 * @this {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }}
 * @returns {string}
 */
export function getOrCreateUUID() {
  const key = "_client_uuid";
  let uuid = this.getItem(key);
  if (!uuid) {
    uuid = generateUUIDv4();
    this.setItem(key, uuid);
  }
  return uuid;
}

/**
 * 获取或创建会话级 sessionId（键名 `_session_id`），并写入存储。
 * 同样须绑定 `this` 为带 `getItem` / `setItem` 的对象（API 形态同 Web Storage）。
 * 应绑定**会话**存储（如 `sessionStorage`，或仅进程/内存生命周期、冷启动即清空的适配对象），
 * 与持久化 UUID 区分：用于标识「本次启动/本次会话」内的操作。
 * @this {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }}
 * @returns {string}
 */
export function getOrCreateSessionId() {
  const key = "_session_id";
  let sessionId = this.getItem(key);
  if (!sessionId) {
    sessionId = generateRandomPrefix();
    this.setItem(key, sessionId);
  }
  return sessionId;
}


export function getGlobalObject() {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof global !== "undefined") return global;
  if (typeof self !== "undefined") return self;
  return undefined;
}

/**
 * 跨平台日志附加信息（由本文件的 getLogExtraInfo 产生）
 * @typedef {Object} LogExtraInfo
 * @property {number} time - 日志生成的时间戳（毫秒级）
 * @property {Object.<string, string>} extendedAttributes - 来自全局 `LOGS_CONTEXT` 的字符串键值（已过滤空串）
 */

/**
 * @returns {LogExtraInfo|{}} 若无法取得全局对象则返回空对象；否则返回时间与扩展属性
 * @description 读取全局对象上的 `LOGS_CONTEXT`（若存在），与当前时间一并作为附加信息
 */
export function getLogExtraInfo() {
  const g = getGlobalObject();
  if (!g) return {};
  // 过滤扩展属性，只保留有效的字符串值
  const extendedAttributes = {};
  if (g.LOGS_CONTEXT && typeof g.LOGS_CONTEXT === 'object') {
    for (const [key, value] of Object.entries(g.LOGS_CONTEXT)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        extendedAttributes[key] = value;
      }
    }
  }

  const base = {
    time: Date.now(),
    extendedAttributes,
  };
  return base;
}