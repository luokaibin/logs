/**
 * Web Storage 形态的内存实现（无 localStorage 等持久化层时使用）。
 * @returns {{ setItem(key: string, value: string): void, getItem(key: string): string | null }}
 */
function createMemoryStorage() {
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

/**
 * UTF-8 字节序列；优先用全局 `TextEncoder`（浏览器 / 现代 Node / RN），否则纯 JS 回退（如旧 Node 无全局 TextEncoder）。
 * @param {string} str
 * @returns {Uint8Array}
 */
function utf8Bytes$1(str) {
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
 * 生成随机前缀字符串（16位大写十六进制）
 * @returns {string}
 */
function generateRandomPrefix() {
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
function getOrCreateUUID$1() {
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
function getOrCreateSessionId() {
  const key = "_session_id";
  let sessionId = this.getItem(key);
  if (!sessionId) {
    sessionId = generateRandomPrefix();
    this.setItem(key, sessionId);
  }
  return sessionId;
}


function getGlobalObject() {
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
function getLogExtraInfo$1() {
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

// 默认的数组采样规则
const ARRAY_SAMPLING_CONFIG$1 = {
  primitive: {
    threshold: 20, // 对简单数组保持宽松的阈值
    head: 10,      // 保留足够的上下文
    tail: 4,
    middle: 3
  },
  complex: {
    threshold: 10, // 对复杂数组使用严格的阈值
    head: 5,       // 采用更保守的采样数
    tail: 3,
    middle: 2
  },
};

// 序列化后日志字符串的最大长度
const MAX_LOG_LENGTH = 100000;

/**
 * 递归地将值转换为可 JSON 序列化的格式。
 * @param {any} value - 需要序列化的值。
 * @param {object} [options={maxDepth: 10, sensitiveKeys: [...]}] - 序列化选项。
 * @param {number} [options.maxDepth=10] - 最大序列化深度。
 * @param {string[]} [options.sensitiveKeys=['password', 'token', 'secret', 'auth']] - 敏感信息的键名。
 * @param {number} [currentDepth=0] - 当前序列化深度，用于递归。
 * @param {WeakSet} [seen=new WeakSet()] - 用于检测循环引用的集合，用于递归。
 * @returns {any} 可序列化的值。
 */
function serializeSingleValue$2(
  value,
  options = {
    maxDepth: 10,
    sensitiveKeys: ['password', 'token', 'secret', 'auth'],
  },
  currentDepth = 0,
  seen = new WeakSet(),
) {
  const { maxDepth, sensitiveKeys } = options;
  const type = typeof value;

  // 处理原始类型和 null
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(type)) {
    return value;
  }

  // 处理 BigInt
  if (type === 'bigint') {
    return `${value.toString()}n`;
  }

  // 处理 Symbol
  if (type === 'symbol') {
    return value.toString();
  }
  
  // 处理函数
  if (type === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  // --- 对象类型处理开始 ---

  // 检查循环引用
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[循环引用]';
    }
    seen.add(value);
  }

  // 检查最大深度
  if (currentDepth >= maxDepth) {
    return `[达到最大深度: ${Object.prototype.toString.call(value)}]`;
  }

  // 处理特殊对象类型
  // 检查是否有专门的类型处理器（策略模式）
  for (const [typeConstructor, handler] of this.entries()) {
    if (value instanceof typeConstructor) {
      return handler(value, options, currentDepth, seen);
    }
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}\nStack: ${value.stack || ''}`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) {
      const keyStr = typeof k === 'object' && k !== null ? '[object]' : String(k);
      obj[keyStr] = serializeSingleValue$2.call(this, v, options, currentDepth + 1, seen);
    }
    return obj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    const arr = [];
    for (const v of value.values()) {
      arr.push(serializeSingleValue$2.call(this, v, options, currentDepth + 1, seen));
    }
    return arr;
  }

  // 处理数组 (包括采样逻辑)
  if (Array.isArray(value)) {
    const isComplex = value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
    const rules = isComplex ? ARRAY_SAMPLING_CONFIG$1.complex : ARRAY_SAMPLING_CONFIG$1.primitive;

    // 卫语句：如果未达到采样阈值，则正常处理并提前返回
    if (value.length <= rules.threshold) {
      return value.map(item => serializeSingleValue$2.call(this, item, options, currentDepth + 1, seen));
    }

    // --- 采样逻辑开始 ---
    const sampledResult = { _t: 'arr', _l: value.length, _e: {} };
    const indices = new Set();

    // Head
    for (let i = 0; i < rules.head && i < value.length; i++) {
      indices.add(i);
    }
    // Tail
    for (let i = 0; i < rules.tail && value.length - 1 - i >= 0; i++) {
      indices.add(value.length - 1 - i);
    }
    // Middle
    const midStart = Math.floor(value.length / 2 - rules.middle / 2);
    for (let i = 0; i < rules.middle && midStart + i < value.length; i++) {
      indices.add(midStart + i);
    }

    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    for (const index of sortedIndices) {
      sampledResult._e[index] = serializeSingleValue$2.call(this, value[index], options, currentDepth + 1, seen);
    }

    return sampledResult;
  }

  // 处理普通对象
  if (typeof value === 'object' && value !== null) {
     // 检查是否有自定义的 toJSON 方法
    if (typeof value.toJSON === 'function') {
      return serializeSingleValue$2.call(this, value.toJSON(), options, currentDepth + 1, seen);
    }

    const result = {};
    for (const key of Object.keys(value)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        result[key] = '[敏感信息已过滤]';
      } else {
        result[key] = serializeSingleValue$2.call(this, value[key], options, currentDepth + 1, seen);
      }
    }
    return result;
  }

  // 兜底处理
  return String(value);
}

/**
 * 将任何 JavaScript 内容序列化为截断后的 JSON 字符串。
 * @param {any} content - 需要序列化的内容。
 * @returns {string} 序列化后的 JSON 字符串。
 */
function serializeLogContent$1(content) {
  const serializableObject = serializeSingleValue$2.call(this, content);

  try {
    const result = JSON.stringify(serializableObject);

    // 截断过长的结果
    return result.length > MAX_LOG_LENGTH ? result.slice(0, MAX_LOG_LENGTH) + '...' : result;
  } catch (e) {
    // Fallback for any unexpected stringify errors
    return `[序列化失败: ${e.message}]`;
  }
}

// 策略模式：为浏览器环境中的特定对象类型定义专门的处理器
const browserTypeHandlers = new Map();
if (typeof window !== 'undefined') {
  // ErrorEvent 处理器
  browserTypeHandlers.set(window.ErrorEvent, (value, options, currentDepth, seen) => ({
    _t: 'ErrorEvent',
    message: value.message,
    filename: value.filename,
    lineno: value.lineno,
    colno: value.colno,
    error: serializeSingleValue$1(value.error, options, currentDepth + 1, seen),
  }));

  // PromiseRejectionEvent 处理器
  browserTypeHandlers.set(window.PromiseRejectionEvent, (value, options, currentDepth, seen) => ({
    _t: 'PromiseRejectionEvent',
    reason: serializeSingleValue$1(value.reason, options, currentDepth + 1, seen),
  }));

  // MessageEvent 处理器
  browserTypeHandlers.set(window.MessageEvent, (value, options, currentDepth, seen) => ({
    _t: 'MessageEvent',
    data: serializeSingleValue$1(value.data, options, currentDepth + 1, seen),
    origin: value.origin,
    lastEventId: value.lastEventId,
    source: '[WindowProxy]', // source 是一个 window proxy, 不能直接序列化
  }));

  // CloseEvent 处理器
  browserTypeHandlers.set(window.CloseEvent, (value, options, currentDepth, seen) => ({
    _t: 'CloseEvent',
    code: value.code,
    reason: value.reason,
    wasClean: value.wasClean,
  }));

  // CustomEvent 处理器
  browserTypeHandlers.set(window.CustomEvent, (value, options, currentDepth, seen) => ({
    _t: 'CustomEvent',
    type: value.type,
    detail: serializeSingleValue$1(value.detail, options, currentDepth + 1, seen),
    bubbles: value.bubbles,
    cancelable: value.cancelable,
    composed: value.composed,
  }));

  // KeyboardEvent 处理器
  browserTypeHandlers.set(window.KeyboardEvent, (value, options, currentDepth, seen) => ({
    _t: 'KeyboardEvent',
    type: value.type,
    key: value.key,
    code: value.code,
    ctrlKey: value.ctrlKey,
    shiftKey: value.shiftKey,
    altKey: value.altKey,
    metaKey: value.metaKey,
    repeat: value.repeat,
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // InputEvent 处理器
  browserTypeHandlers.set(window.InputEvent, (value, options, currentDepth, seen) => ({
    _t: 'InputEvent',
    type: value.type,
    inputType: value.inputType,
    data: value.data,
    isComposing: value.isComposing,
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // StorageEvent 处理器
  browserTypeHandlers.set(window.StorageEvent, (value, options, currentDepth, seen) => ({
    _t: 'StorageEvent',
    type: value.type,
    key: value.key,
    newValue: value.newValue,
    oldValue: value.oldValue,
    url: value.url,
    storageArea: '[Storage]', // storageArea 是 Storage 对象，不能直接序列化
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // Element（含 HTML / SVG 等 DOM 节点）
  browserTypeHandlers.set(window.Element, (value) =>
    `<${value.tagName.toLowerCase()} class="${value.className}" id="${value.id}">`,
  );
}

const serializeSingleValue$1 = serializeSingleValue$2.bind(browserTypeHandlers);
const serializeLogContent = serializeLogContent$1.bind(browserTypeHandlers);

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

const getOrCreateUUID = getOrCreateUUID$1.bind(persistentStorage);

/**
 * @returns {WebLogExtraInfo}
 */
function getLogExtraInfo() {
  const extraInfo = getLogExtraInfo$1();
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
async function getServiceWorker(scope = '/beacon/') {
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

// Generated ESM version of ua-parser-js
// DO NOT EDIT THIS FILE!
// Source: /src/main/ua-parser.js

/////////////////////////////////////////////////////////////////////////////////
/* UAParser.js v2.0.6
   Copyright © 2012-2025 Faisal Salman <f@faisalman.com>
   AGPLv3 License *//*
   Detect Browser, Engine, OS, CPU, and Device type/model from User-Agent data.
   Supports browser & node.js environment. 
   Demo   : https://uaparser.dev
   Source : https://github.com/faisalman/ua-parser-js */
/////////////////////////////////////////////////////////////////////////////////

/* jshint esversion: 6 */ 
/* globals window */


    
    //////////////
    // Constants
    /////////////

    var LIBVERSION  = '2.0.6',
        UA_MAX_LENGTH = 500,
        USER_AGENT  = 'user-agent',
        EMPTY       = '',
        UNKNOWN     = '?',
        TYPEOF = {
            FUNCTION    : 'function',
            OBJECT      : 'object',
            STRING      : 'string',
            UNDEFINED   : 'undefined'
        },

        // properties
        BROWSER     = 'browser',
        CPU         = 'cpu',
        DEVICE      = 'device',
        ENGINE      = 'engine',
        OS          = 'os',
        RESULT      = 'result',

        NAME        = 'name',
        TYPE        = 'type',
        VENDOR      = 'vendor',
        VERSION     = 'version',
        ARCHITECTURE= 'architecture',
        MAJOR       = 'major',
        MODEL       = 'model',

        // device types
        CONSOLE     = 'console',
        MOBILE      = 'mobile',
        TABLET      = 'tablet',
        SMARTTV     = 'smarttv',
        WEARABLE    = 'wearable',
        XR          = 'xr',
        EMBEDDED    = 'embedded',

        // browser types
        INAPP       = 'inapp',

        // client hints
        BRANDS      = 'brands',
        FORMFACTORS = 'formFactors',
        FULLVERLIST = 'fullVersionList',
        PLATFORM    = 'platform',
        PLATFORMVER = 'platformVersion',
        BITNESS     = 'bitness',
        CH          = 'sec-ch-ua',
        CH_FULL_VER_LIST= CH + '-full-version-list',
        CH_ARCH         = CH + '-arch',
        CH_BITNESS      = CH + '-' + BITNESS,
        CH_FORM_FACTORS = CH + '-form-factors',
        CH_MOBILE       = CH + '-' + MOBILE,
        CH_MODEL        = CH + '-' + MODEL,
        CH_PLATFORM     = CH + '-' + PLATFORM,
        CH_PLATFORM_VER = CH_PLATFORM + '-version',
        CH_ALL_VALUES   = [BRANDS, FULLVERLIST, MOBILE, MODEL, PLATFORM, PLATFORMVER, ARCHITECTURE, FORMFACTORS, BITNESS],

        // device vendors
        AMAZON      = 'Amazon',
        APPLE       = 'Apple',
        ASUS        = 'ASUS',
        BLACKBERRY  = 'BlackBerry',
        GOOGLE      = 'Google',
        HUAWEI      = 'Huawei',
        LENOVO      = 'Lenovo',
        HONOR       = 'Honor',
        LG          = 'LG',
        MICROSOFT   = 'Microsoft',
        MOTOROLA    = 'Motorola',
        NVIDIA      = 'Nvidia',
        ONEPLUS     = 'OnePlus',
        OPPO        = 'OPPO',
        SAMSUNG     = 'Samsung',
        SHARP       = 'Sharp',
        SONY        = 'Sony',
        XIAOMI      = 'Xiaomi',
        ZEBRA       = 'Zebra',

        // browsers
        CHROME      = 'Chrome',
        CHROMIUM    = 'Chromium',
        CHROMECAST  = 'Chromecast',
        EDGE        = 'Edge',
        FIREFOX     = 'Firefox',
        OPERA       = 'Opera',
        FACEBOOK    = 'Facebook',
        SOGOU       = 'Sogou',

        PREFIX_MOBILE  = 'Mobile ',
        SUFFIX_BROWSER = ' Browser',

        // os
        WINDOWS     = 'Windows';
   
    var isWindow            = typeof window !== TYPEOF.UNDEFINED,
        NAVIGATOR           = (isWindow && window.navigator) ? 
                                window.navigator : 
                                undefined,
        NAVIGATOR_UADATA    = (NAVIGATOR && NAVIGATOR.userAgentData) ? 
                                NAVIGATOR.userAgentData : 
                                undefined;

    ///////////
    // Helper
    //////////

    var extend = function (defaultRgx, extensions) {
            var mergedRgx = {};
            var extraRgx = extensions;
            if (!isExtensions(extensions)) {
                extraRgx = {};
                for (var i in extensions) {
                    for (var j in extensions[i]) {
                        extraRgx[j] = extensions[i][j].concat(extraRgx[j] ? extraRgx[j] : []);
                    }
                }
            }
            for (var k in defaultRgx) {
                mergedRgx[k] = extraRgx[k] && extraRgx[k].length % 2 === 0 ? extraRgx[k].concat(defaultRgx[k]) : defaultRgx[k];
            }
            return mergedRgx;
        },
        enumerize = function (arr) {
            var enums = {};
            for (var i=0; i<arr.length; i++) {
                enums[arr[i].toUpperCase()] = arr[i];
            }
            return enums;
        },
        has = function (str1, str2) {
            if (typeof str1 === TYPEOF.OBJECT && str1.length > 0) {
                for (var i in str1) {
                    if (lowerize(str2) == lowerize(str1[i])) return true;
                }
                return false;
            }
            return isString(str1) ? lowerize(str2) == lowerize(str1) : false;
        },
        isExtensions = function (obj, deep) {
            for (var prop in obj) {
                return /^(browser|cpu|device|engine|os)$/.test(prop) || (deep ? isExtensions(obj[prop]) : false);
            }
        },
        isString = function (val) {
            return typeof val === TYPEOF.STRING;
        },
        itemListToArray = function (header) {
            if (!header) return undefined;
            var arr = [];
            var tokens = strip(/\\?\"/g, header).split(',');
            for (var i = 0; i < tokens.length; i++) {
                if (tokens[i].indexOf(';') > -1) {
                    var token = trim(tokens[i]).split(';v=');
                    arr[i] = { brand : token[0], version : token[1] };
                } else {
                    arr[i] = trim(tokens[i]);
                }
            }
            return arr;
        },
        lowerize = function (str) {
            return isString(str) ? str.toLowerCase() : str;
        },
        majorize = function (version) {
            return isString(version) ? strip(/[^\d\.]/g, version).split('.')[0] : undefined;
        },
        setProps = function (arr) {
            for (var i in arr) {
                if (!arr.hasOwnProperty(i)) continue;

                var propName = arr[i];
                if (typeof propName == TYPEOF.OBJECT && propName.length == 2) {
                    this[propName[0]] = propName[1];
                } else {
                    this[propName] = undefined;
                }
            }
            return this;
        },
        strip = function (pattern, str) {
            return isString(str) ? str.replace(pattern, EMPTY) : str;
        },
        stripQuotes = function (str) {
            return strip(/\\?\"/g, str); 
        },
        trim = function (str, len) {
            str = strip(/^\s\s*/, String(str));
            return typeof len === TYPEOF.UNDEFINED ? str : str.substring(0, len);
    };

    ///////////////
    // Map helper
    //////////////

    var rgxMapper = function (ua, arrays) {

            if(!ua || !arrays) return;

            var i = 0, j, k, p, q, matches, match;

            // loop through all regexes maps
            while (i < arrays.length && !matches) {

                var regex = arrays[i],       // even sequence (0,2,4,..)
                    props = arrays[i + 1];   // odd sequence (1,3,5,..)
                j = k = 0;

                // try matching uastring with regexes
                while (j < regex.length && !matches) {

                    if (!regex[j]) { break; }
                    matches = regex[j++].exec(ua);

                    if (!!matches) {
                        for (p = 0; p < props.length; p++) {
                            match = matches[++k];
                            q = props[p];
                            // check if given property is actually array
                            if (typeof q === TYPEOF.OBJECT && q.length > 0) {
                                if (q.length === 2) {
                                    if (typeof q[1] == TYPEOF.FUNCTION) {
                                        // assign modified match
                                        this[q[0]] = q[1].call(this, match);
                                    } else {
                                        // assign given value, ignore regex match
                                        this[q[0]] = q[1];
                                    }
                                } else if (q.length >= 3) {
                                    // Check whether q[1] FUNCTION or REGEX
                                    if (typeof q[1] === TYPEOF.FUNCTION && !(q[1].exec && q[1].test)) {
                                        if (q.length > 3) {
                                            this[q[0]] = match ? q[1].apply(this, q.slice(2)) : undefined;
                                        } else {
                                            // call function (usually string mapper)
                                            this[q[0]] = match ? q[1].call(this, match, q[2]) : undefined;
                                        }
                                    } else {
                                        if (q.length == 3) {
                                            // sanitize match using given regex
                                            this[q[0]] = match ? match.replace(q[1], q[2]) : undefined;
                                        } else if (q.length == 4) {
                                            this[q[0]] = match ? q[3].call(this, match.replace(q[1], q[2])) : undefined;
                                        } else if (q.length > 4) {
                                            this[q[0]] = match ? q[3].apply(this, [match.replace(q[1], q[2])].concat(q.slice(4))) : undefined;
                                        }
                                    }
                                }
                            } else {
                                this[q] = match ? match : undefined;
                            }
                        }
                    }
                }
                i += 2;
            }
        },

        strMapper = function (str, map) {

            for (var i in map) {
                // check if current value is array
                if (typeof map[i] === TYPEOF.OBJECT && map[i].length > 0) {
                    for (var j = 0; j < map[i].length; j++) {
                        if (has(map[i][j], str)) {
                            return (i === UNKNOWN) ? undefined : i;
                        }
                    }
                } else if (has(map[i], str)) {
                    return (i === UNKNOWN) ? undefined : i;
                }
            }
            return map.hasOwnProperty('*') ? map['*'] : str;
    };

    ///////////////
    // String map
    //////////////

    var windowsVersionMap = {
            'ME'    : '4.90',
            'NT 3.51': '3.51',
            'NT 4.0': '4.0',
            '2000'  : ['5.0', '5.01'],
            'XP'    : ['5.1', '5.2'],
            'Vista' : '6.0',
            '7'     : '6.1',
            '8'     : '6.2',
            '8.1'   : '6.3',
            '10'    : ['6.4', '10.0'],
            'NT'    : ''
        },
        
        formFactorsMap = {
            'embedded'  : 'Automotive',
            'mobile'    : 'Mobile',
            'tablet'    : ['Tablet', 'EInk'],
            'smarttv'   : 'TV',
            'wearable'  : 'Watch',
            'xr'        : ['VR', 'XR'],
            '?'         : ['Desktop', 'Unknown'],
            '*'         : undefined
        },

        browserHintsMap = {
            'Chrome'        : 'Google Chrome',
            'Edge'          : 'Microsoft Edge',
            'Edge WebView2' : 'Microsoft Edge WebView2',
            'Chrome WebView': 'Android WebView',
            'Chrome Headless':'HeadlessChrome',
            'Huawei Browser': 'HuaweiBrowser',
            'MIUI Browser'  : 'Miui Browser',
            'Opera Mobi'    : 'OperaMobile',
            'Yandex'        : 'YaBrowser'
    };

    //////////////
    // Regex map
    /////////////

    var defaultRegexes = {

        browser : [[

            // Most common regardless engine
            /\b(?:crmo|crios)\/([\w\.]+)/i                                      // Chrome for Android/iOS
            ], [VERSION, [NAME, PREFIX_MOBILE + 'Chrome']], [
            /webview.+edge\/([\w\.]+)/i                                         // Microsoft Edge
            ], [VERSION, [NAME, EDGE+' WebView']], [
            /edg(?:e|ios|a)?\/([\w\.]+)/i                                       
            ], [VERSION, [NAME, 'Edge']], [

            // Presto based
            /(opera mini)\/([-\w\.]+)/i,                                        // Opera Mini
            /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i,                 // Opera Mobi/Tablet
            /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i                           // Opera
            ], [NAME, VERSION], [
            /opios[\/ ]+([\w\.]+)/i                                             // Opera mini on iphone >= 8.0
            ], [VERSION, [NAME, OPERA+' Mini']], [
            /\bop(?:rg)?x\/([\w\.]+)/i                                          // Opera GX
            ], [VERSION, [NAME, OPERA+' GX']], [
            /\bopr\/([\w\.]+)/i                                                 // Opera Webkit
            ], [VERSION, [NAME, OPERA]], [

            // Mixed
            /\bb[ai]*d(?:uhd|[ub]*[aekoprswx]{5,6})[\/ ]?([\w\.]+)/i            // Baidu
            ], [VERSION, [NAME, 'Baidu']], [
            /\b(?:mxbrowser|mxios|myie2)\/?([-\w\.]*)\b/i                       // Maxthon
            ], [VERSION, [NAME, 'Maxthon']], [
            /(kindle)\/([\w\.]+)/i,                                             // Kindle
            /(lunascape|maxthon|netfront|jasmine|blazer|sleipnir)[\/ ]?([\w\.]*)/i,      
                                                                                // Lunascape/Maxthon/Netfront/Jasmine/Blazer/Sleipnir
            // Trident based
            /(avant|iemobile|slim(?:browser|boat|jet))[\/ ]?([\d\.]*)/i,        // Avant/IEMobile/SlimBrowser/SlimBoat/Slimjet
            /(?:ms|\()(ie) ([\w\.]+)/i,                                         // Internet Explorer

            // Blink/Webkit/KHTML based                                         // Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium/PhantomJS/Bowser/QupZilla/Falkon/LG Browser/Otter/qutebrowser/Dooble/Palemoon
            /(flock|rockmelt|midori|epiphany|silk|skyfire|ovibrowser|bolt|iron|vivaldi|iridium|phantomjs|bowser|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|duckduckgo|klar|helio|(?=comodo_)?dragon|otter|dooble|(?:lg |qute)browser|palemoon)\/([-\w\.]+)/i,
                                                                                // Rekonq/Puffin/Brave/Whale/QQBrowserLite/QQ//Vivaldi/DuckDuckGo/Klar/Helio/Dragon
            /(heytap|ovi|115|surf|qwant)browser\/([\d\.]+)/i,                   // HeyTap/Ovi/115/Surf
            /(qwant)(?:ios|mobile)\/([\d\.]+)/i,                                // Qwant
            /(ecosia|weibo)(?:__| \w+@)([\d\.]+)/i                              // Ecosia/Weibo
            ], [NAME, VERSION], [
            /quark(?:pc)?\/([-\w\.]+)/i                                         // Quark
            ], [VERSION, [NAME, 'Quark']], [
            /\bddg\/([\w\.]+)/i                                                 // DuckDuckGo
            ], [VERSION, [NAME, 'DuckDuckGo']], [
            /(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i                 // UCBrowser
            ], [VERSION, [NAME, 'UCBrowser']], [
            /microm.+\bqbcore\/([\w\.]+)/i,                                     // WeChat Desktop for Windows Built-in Browser
            /\bqbcore\/([\w\.]+).+microm/i,
            /micromessenger\/([\w\.]+)/i                                        // WeChat
            ], [VERSION, [NAME, 'WeChat']], [
            /konqueror\/([\w\.]+)/i                                             // Konqueror
            ], [VERSION, [NAME, 'Konqueror']], [
            /trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i                       // IE11
            ], [VERSION, [NAME, 'IE']], [
            /ya(?:search)?browser\/([\w\.]+)/i                                  // Yandex
            ], [VERSION, [NAME, 'Yandex']], [
            /slbrowser\/([\w\.]+)/i                                             // Smart Lenovo Browser
            ], [VERSION, [NAME, 'Smart ' + LENOVO + SUFFIX_BROWSER]], [
            /(avast|avg)\/([\w\.]+)/i                                           // Avast/AVG Secure Browser
            ], [[NAME, /(.+)/, '$1 Secure' + SUFFIX_BROWSER], VERSION], [
            /\bfocus\/([\w\.]+)/i                                               // Firefox Focus
            ], [VERSION, [NAME, FIREFOX+' Focus']], [
            /\bopt\/([\w\.]+)/i                                                 // Opera Touch
            ], [VERSION, [NAME, OPERA+' Touch']], [
            /coc_coc\w+\/([\w\.]+)/i                                            // Coc Coc Browser
            ], [VERSION, [NAME, 'Coc Coc']], [
            /dolfin\/([\w\.]+)/i                                                // Dolphin
            ], [VERSION, [NAME, 'Dolphin']], [
            /coast\/([\w\.]+)/i                                                 // Opera Coast
            ], [VERSION, [NAME, OPERA+' Coast']], [
            /miuibrowser\/([\w\.]+)/i                                           // MIUI Browser
            ], [VERSION, [NAME, 'MIUI' + SUFFIX_BROWSER]], [
            /fxios\/([\w\.-]+)/i                                                // Firefox for iOS
            ], [VERSION, [NAME, PREFIX_MOBILE + FIREFOX]], [
            /\bqihoobrowser\/?([\w\.]*)/i                                       // 360
            ], [VERSION, [NAME, '360']], [
            /\b(qq)\/([\w\.]+)/i                                                // QQ
            ], [[NAME, /(.+)/, '$1Browser'], VERSION], [
            /(oculus|sailfish|huawei|vivo|pico)browser\/([\w\.]+)/i
            ], [[NAME, /(.+)/, '$1' + SUFFIX_BROWSER], VERSION], [              // Oculus/Sailfish/HuaweiBrowser/VivoBrowser/PicoBrowser
            /samsungbrowser\/([\w\.]+)/i                                        // Samsung Internet
            ], [VERSION, [NAME, SAMSUNG + ' Internet']], [
            /metasr[\/ ]?([\d\.]+)/i                                            // Sogou Explorer
            ], [VERSION, [NAME, SOGOU + ' Explorer']], [
            /(sogou)mo\w+\/([\d\.]+)/i                                          // Sogou Mobile
            ], [[NAME, SOGOU + ' Mobile'], VERSION], [
            /(electron)\/([\w\.]+) safari/i,                                    // Electron-based App
            /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i,                   // Tesla
            /m?(qqbrowser|2345(?=browser|chrome|explorer))\w*[\/ ]?v?([\w\.]+)/i   // QQ/2345
            ], [NAME, VERSION], [
            /(lbbrowser|rekonq)/i                                               // LieBao Browser/Rekonq
            ], [NAME], [
            /ome\/([\w\.]+) \w* ?(iron) saf/i,                                  // Iron
            /ome\/([\w\.]+).+qihu (360)[es]e/i                                  // 360
            ], [VERSION, NAME], [

            // WebView
            /((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i       // Facebook App for iOS & Android
            ], [[NAME, FACEBOOK], VERSION, [TYPE, INAPP]], [
            /(kakao(?:talk|story))[\/ ]([\w\.]+)/i,                             // Kakao App
            /(naver)\(.*?(\d+\.[\w\.]+).*\)/i,                                  // Naver InApp
            /(daum)apps[\/ ]([\w\.]+)/i,                                        // Daum App
            /safari (line)\/([\w\.]+)/i,                                        // Line App for iOS
            /\b(line)\/([\w\.]+)\/iab/i,                                        // Line App for Android
            /(alipay)client\/([\w\.]+)/i,                                       // Alipay
            /(twitter)(?:and| f.+e\/([\w\.]+))/i,                               // Twitter
            /(bing)(?:web|sapphire)\/([\w\.]+)/i,                               // Bing
            /(instagram|snapchat|klarna)[\/ ]([-\w\.]+)/i                       // Instagram/Snapchat/Klarna
            ], [NAME, VERSION, [TYPE, INAPP]], [
            /\bgsa\/([\w\.]+) .*safari\//i                                      // Google Search Appliance on iOS
            ], [VERSION, [NAME, 'GSA'], [TYPE, INAPP]], [
            /musical_ly(?:.+app_?version\/|_)([\w\.]+)/i                        // TikTok
            ], [VERSION, [NAME, 'TikTok'], [TYPE, INAPP]], [
            /\[(linkedin)app\]/i                                                // LinkedIn App for iOS & Android
            ], [NAME, [TYPE, INAPP]], [
            /(zalo(?:app)?)[\/\sa-z]*([\w\.-]+)/i                               // Zalo 
            ], [[NAME, /(.+)/, 'Zalo'], VERSION, [TYPE, INAPP]], [

            /(chromium)[\/ ]([-\w\.]+)/i                                        // Chromium
            ], [NAME, VERSION], [

            /headlesschrome(?:\/([\w\.]+)| )/i                                  // Chrome Headless
            ], [VERSION, [NAME, CHROME+' Headless']], [

            /wv\).+chrome\/([\w\.]+).+edgw\//i                                  // Edge WebView2
            ], [VERSION, [NAME, EDGE+' WebView2']], [

            / wv\).+(chrome)\/([\w\.]+)/i                                       // Chrome WebView
            ], [[NAME, CHROME+' WebView'], VERSION], [

            /droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i           // Android Browser
            ], [VERSION, [NAME, 'Android' + SUFFIX_BROWSER]], [

            /chrome\/([\w\.]+) mobile/i                                         // Chrome Mobile
            ], [VERSION, [NAME, PREFIX_MOBILE + 'Chrome']], [

            /(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i       // Chrome/OmniWeb/Arora/Tizen/Nokia
            ], [NAME, VERSION], [

            /version\/([\w\.\,]+) .*mobile(?:\/\w+ | ?)safari/i                 // Safari Mobile
            ], [VERSION, [NAME, PREFIX_MOBILE + 'Safari']], [
            /iphone .*mobile(?:\/\w+ | ?)safari/i
            ], [[NAME, PREFIX_MOBILE + 'Safari']], [
            /version\/([\w\.\,]+) .*(safari)/i                                  // Safari
            ], [VERSION, NAME], [
            /webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i                      // Safari < 3.0
            ], [NAME, [VERSION, '1']], [

            /(webkit|khtml)\/([\w\.]+)/i
            ], [NAME, VERSION], [

            // Gecko based
            /(?:mobile|tablet);.*(firefox)\/([\w\.-]+)/i                        // Firefox Mobile
            ], [[NAME, PREFIX_MOBILE + FIREFOX], VERSION], [
            /(navigator|netscape\d?)\/([-\w\.]+)/i                              // Netscape
            ], [[NAME, 'Netscape'], VERSION], [
            /(wolvic|librewolf)\/([\w\.]+)/i                                    // Wolvic/LibreWolf
            ], [NAME, VERSION], [
            /mobile vr; rv:([\w\.]+)\).+firefox/i                               // Firefox Reality
            ], [VERSION, [NAME, FIREFOX+' Reality']], [
            /ekiohf.+(flow)\/([\w\.]+)/i,                                       // Flow
            /(swiftfox)/i,                                                      // Swiftfox
            /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror)[\/ ]?([\w\.\+]+)/i,
                                                                                // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror
            /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|basilisk|waterfox)\/([-\w\.]+)$/i,
                                                                                // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
            /(firefox)\/([\w\.]+)/i,                                            // Other Firefox-based
            /(mozilla)\/([\w\.]+(?= .+rv\:.+gecko\/\d+)|[0-4][\w\.]+(?!.+compatible))/i, // Mozilla

            // Other
            /(amaya|dillo|doris|icab|ladybird|lynx|mosaic|netsurf|obigo|polaris|w3m|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i,
                                                                                // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf/Obigo/Mosaic/Go/ICE/UP.Browser/Ladybird
            /\b(links) \(([\w\.]+)/i                                            // Links
            ], [NAME, [VERSION, /_/g, '.']], [
            
            /(cobalt)\/([\w\.]+)/i                                              // Cobalt
            ], [NAME, [VERSION, /[^\d\.]+./, EMPTY]]
        ],

        cpu : [[

            /\b((amd|x|x86[-_]?|wow|win)64)\b/i                                 // AMD64 (x64)
            ], [[ARCHITECTURE, 'amd64']], [

            /(ia32(?=;))/i,                                                     // IA32 (quicktime)
            /\b((i[346]|x)86)(pc)?\b/i                                          // IA32 (x86)
            ], [[ARCHITECTURE, 'ia32']], [

            /\b(aarch64|arm(v?[89]e?l?|_?64))\b/i                               // ARM64
            ], [[ARCHITECTURE, 'arm64']], [

            /\b(arm(v[67])?ht?n?[fl]p?)\b/i                                     // ARMHF
            ], [[ARCHITECTURE, 'armhf']], [

            // PocketPC mistakenly identified as PowerPC
            /( (ce|mobile); ppc;|\/[\w\.]+arm\b)/i
            ], [[ARCHITECTURE, 'arm']], [

            / sun4\w[;\)]/i                                                     // SPARC
            ], [[ARCHITECTURE, 'sparc']], [
                                                                                // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
            /\b(avr32|ia64(?=;)|68k(?=\))|\barm(?=v([1-7]|[5-7]1)l?|;|eabi)|(irix|mips|sparc)(64)?\b|pa-risc)/i,
            /((ppc|powerpc)(64)?)( mac|;|\))/i,                                 // PowerPC
            /(?:osf1|[freopnt]{3,4}bsd) (alpha)/i                               // Alpha
            ], [[ARCHITECTURE, /ower/, EMPTY, lowerize]], [
            /mc680.0/i
            ], [[ARCHITECTURE, '68k']], [
            /winnt.+\[axp/i
            ], [[ARCHITECTURE, 'alpha']]
        ],

        device : [[

            //////////////////////////
            // MOBILES & TABLETS
            /////////////////////////

            // Samsung
            /\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i
            ], [MODEL, [VENDOR, SAMSUNG], [TYPE, TABLET]], [
            /\b((?:s[cgp]h|gt|sm)-(?![lr])\w+|sc[g-]?[\d]+a?|galaxy nexus)/i,
            /samsung[- ]((?!sm-[lr]|browser)[-\w]+)/i,
            /sec-(sgh\w+)/i
            ], [MODEL, [VENDOR, SAMSUNG], [TYPE, MOBILE]], [

            // Apple
            /(?:\/|\()(ip(?:hone|od)[\w, ]*)[\/\);]/i                           // iPod/iPhone
            ], [MODEL, [VENDOR, APPLE], [TYPE, MOBILE]], [
            /\b(?:ios|apple\w+)\/.+[\(\/](ipad)/i,                              // iPad
            /\b(ipad)[\d,]*[;\] ].+(mac |i(pad)?)os/i
            ], [MODEL, [VENDOR, APPLE], [TYPE, TABLET]], [
            /(macintosh);/i
            ], [MODEL, [VENDOR, APPLE]], [

            // Sharp
            /\b(sh-?[altvz]?\d\d[a-ekm]?)/i
            ], [MODEL, [VENDOR, SHARP], [TYPE, MOBILE]], [

            // Honor
            /\b((?:brt|eln|hey2?|gdi|jdn)-a?[lnw]09|(?:ag[rm]3?|jdn2|kob2)-a?[lw]0[09]hn)(?: bui|\)|;)/i
            ], [MODEL, [VENDOR, HONOR], [TYPE, TABLET]], [
            /honor([-\w ]+)[;\)]/i
            ], [MODEL, [VENDOR, HONOR], [TYPE, MOBILE]], [

            // Huawei
            /\b((?:ag[rs][2356]?k?|bah[234]?|bg[2o]|bt[kv]|cmr|cpn|db[ry]2?|jdn2|got|kob2?k?|mon|pce|scm|sht?|[tw]gr|vrd)-[ad]?[lw][0125][09]b?|605hw|bg2-u03|(?:gem|fdr|m2|ple|t1)-[7a]0[1-4][lu]|t1-a2[13][lw]|mediapad[\w\. ]*(?= bui|\)))\b(?!.+d\/s)/i
            ], [MODEL, [VENDOR, HUAWEI], [TYPE, TABLET]], [
            /(?:huawei) ?([-\w ]+)[;\)]/i,
            /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][\dc][adnt]?)\b(?!.+d\/s)/i
            ], [MODEL, [VENDOR, HUAWEI], [TYPE, MOBILE]], [

            // Xiaomi
            /oid[^\)]+; (2[\dbc]{4}(182|283|rp\w{2})[cgl]|m2105k81a?c)(?: bui|\))/i,
            /\b(?:xiao)?((?:red)?mi[-_ ]?pad[\w- ]*)(?: bui|\))/i               // Mi Pad tablets
            ],[[MODEL, /_/g, ' '], [VENDOR, XIAOMI], [TYPE, TABLET]], [

            /\b(poco[\w ]+|m2\d{3}j\d\d[a-z]{2})(?: bui|\))/i,                  // Xiaomi POCO
            /\b; (\w+) build\/hm\1/i,                                           // Xiaomi Hongmi 'numeric' models
            /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i,                             // Xiaomi Hongmi
            /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i,                   // Xiaomi Redmi
            /oid[^\)]+; (m?[12][0-389][01]\w{3,6}[c-y])( bui|; wv|\))/i,        // Xiaomi Redmi 'numeric' models
            /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note|max|cc)?[_ ]?(?:\d{0,2}\w?)[_ ]?(?:plus|se|lite|pro)?( 5g|lte)?)(?: bui|\))/i, // Xiaomi Mi
            / ([\w ]+) miui\/v?\d/i
            ], [[MODEL, /_/g, ' '], [VENDOR, XIAOMI], [TYPE, MOBILE]], [

            // OnePlus
            /droid.+; (cph2[3-6]\d[13579]|((gm|hd)19|(ac|be|in|kb)20|(d[en]|eb|le|mt)21|ne22)[0-2]\d|p[g-k]\w[1m]10)\b/i,
            /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i
            ], [MODEL, [VENDOR, ONEPLUS], [TYPE, MOBILE]], [

            // OPPO
            /; (\w+) bui.+ oppo/i,
            /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i
            ], [MODEL, [VENDOR, OPPO], [TYPE, MOBILE]], [
            /\b(opd2(\d{3}a?))(?: bui|\))/i
            ], [MODEL, [VENDOR, strMapper, { 'OnePlus' : ['203', '304', '403', '404', '413', '415'], '*' : OPPO }], [TYPE, TABLET]], [

            // BLU
            /(vivo (5r?|6|8l?|go|one|s|x[il]?[2-4]?)[\w\+ ]*)(?: bui|\))/i  // Vivo series
            ], [MODEL, [VENDOR, 'BLU'], [TYPE, MOBILE]], [    

            // Vivo
            /; vivo (\w+)(?: bui|\))/i,
            /\b(v[12]\d{3}\w?[at])(?: bui|;)/i
            ], [MODEL, [VENDOR, 'Vivo'], [TYPE, MOBILE]], [

            // Realme
            /\b(rmx[1-3]\d{3})(?: bui|;|\))/i
            ], [MODEL, [VENDOR, 'Realme'], [TYPE, MOBILE]], [

            // Lenovo
            /(ideatab[-\w ]+|602lv|d-42a|a101lv|a2109a|a3500-hv|s[56]000|pb-6505[my]|tb-?x?\d{3,4}(?:f[cu]|xu|[av])|yt\d?-[jx]?\d+[lfmx])( bui|;|\)|\/)/i,
            /lenovo ?(b[68]0[08]0-?[hf]?|tab(?:[\w- ]+?)|tb[\w-]{6,7})( bui|;|\)|\/)/i
            ], [MODEL, [VENDOR, LENOVO], [TYPE, TABLET]], [            
            /lenovo[-_ ]?([-\w ]+?)(?: bui|\)|\/)/i
            ], [MODEL, [VENDOR, LENOVO], [TYPE, MOBILE]], [

            // Motorola
            /\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i,
            /\bmot(?:orola)?[- ]([\w\s]+)(\)| bui)/i,
            /((?:moto(?! 360)[-\w\(\) ]+|xt\d{3,4}[cgkosw\+]?[-\d]*|nexus 6)(?= bui|\)))/i
            ], [MODEL, [VENDOR, MOTOROLA], [TYPE, MOBILE]], [
            /\b(mz60\d|xoom[2 ]{0,2}) build\//i
            ], [MODEL, [VENDOR, MOTOROLA], [TYPE, TABLET]], [

            // LG
            /((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i
            ], [MODEL, [VENDOR, LG], [TYPE, TABLET]], [
            /(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i,
            /\blg[-e;\/ ]+(?!.*(?:browser|netcast|android tv|watch|webos))(\w+)/i,
            /\blg-?([\d\w]+) bui/i
            ], [MODEL, [VENDOR, LG], [TYPE, MOBILE]], [

            // Nokia
            /(nokia) (t[12][01])/i
            ], [VENDOR, MODEL, [TYPE, TABLET]], [
            /(?:maemo|nokia).*(n900|lumia \d+|rm-\d+)/i,
            /nokia[-_ ]?(([-\w\. ]*?))( bui|\)|;|\/)/i
            ], [[MODEL, /_/g, ' '], [TYPE, MOBILE], [VENDOR, 'Nokia']], [

            // Google
            /(pixel (c|tablet))\b/i                                             // Google Pixel C/Tablet
            ], [MODEL, [VENDOR, GOOGLE], [TYPE, TABLET]], [
                                                                                // Google Pixel
            /droid.+;(?: google)? (g(01[13]a|020[aem]|025[jn]|1b60|1f8f|2ybb|4s1m|576d|5nz6|8hhn|8vou|a02099|c15s|d1yq|e2ae|ec77|gh2x|kv4x|p4bc|pj41|r83y|tt9q|ur25|wvk6)|pixel[\d ]*a?( pro)?( xl)?( fold)?( \(5g\))?)( bui|\))/i
            ], [MODEL, [VENDOR, GOOGLE], [TYPE, MOBILE]], [
            /(google) (pixelbook( go)?)/i
            ], [VENDOR, MODEL], [

            // Sony
            /droid.+; (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-\w\w\d\d)(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i
            ], [MODEL, [VENDOR, SONY], [TYPE, MOBILE]], [
            /sony tablet [ps]/i,
            /\b(?:sony)?sgp\w+(?: bui|\))/i
            ], [[MODEL, 'Xperia Tablet'], [VENDOR, SONY], [TYPE, TABLET]], [

            // Amazon
            /(alexa)webm/i,
            /(kf[a-z]{2}wi|aeo(?!bc)\w\w)( bui|\))/i,                           // Kindle Fire without Silk / Echo Show
            /(kf[a-z]+)( bui|\)).+silk\//i                                      // Kindle Fire HD
            ], [MODEL, [VENDOR, AMAZON], [TYPE, TABLET]], [
            /((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i                     // Fire Phone
            ], [[MODEL, /(.+)/g, 'Fire Phone $1'], [VENDOR, AMAZON], [TYPE, MOBILE]], [

            // BlackBerry
            /(playbook);[-\w\),; ]+(rim)/i                                      // BlackBerry PlayBook
            ], [MODEL, VENDOR, [TYPE, TABLET]], [
            /\b((?:bb[a-f]|st[hv])100-\d)/i,
            /(?:blackberry|\(bb10;) (\w+)/i
            ], [MODEL, [VENDOR, BLACKBERRY], [TYPE, MOBILE]], [

            // Asus
            /(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i
            ], [MODEL, [VENDOR, ASUS], [TYPE, TABLET]], [
            / (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i
            ], [MODEL, [VENDOR, ASUS], [TYPE, MOBILE]], [

            // HTC
            /(nexus 9)/i                                                        // HTC Nexus 9
            ], [MODEL, [VENDOR, 'HTC'], [TYPE, TABLET]], [
            /(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i,                         // HTC

            // ZTE
            /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i,
            /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i         // Alcatel/GeeksPhone/Nexian/Panasonic/Sony
            ], [VENDOR, [MODEL, /_/g, ' '], [TYPE, MOBILE]], [

            // TCL
            /tcl (xess p17aa)/i,
            /droid [\w\.]+; ((?:8[14]9[16]|9(?:0(?:48|60|8[01])|1(?:3[27]|66)|2(?:6[69]|9[56])|466))[gqswx])(_\w(\w|\w\w))?(\)| bui)/i
            ], [MODEL, [VENDOR, 'TCL'], [TYPE, TABLET]], [
            /droid [\w\.]+; (418(?:7d|8v)|5087z|5102l|61(?:02[dh]|25[adfh]|27[ai]|56[dh]|59k|65[ah])|a509dl|t(?:43(?:0w|1[adepqu])|50(?:6d|7[adju])|6(?:09dl|10k|12b|71[efho]|76[hjk])|7(?:66[ahju]|67[hw]|7[045][bh]|71[hk]|73o|76[ho]|79w|81[hks]?|82h|90[bhsy]|99b)|810[hs]))(_\w(\w|\w\w))?(\)| bui)/i
            ], [MODEL, [VENDOR, 'TCL'], [TYPE, MOBILE]], [

            // itel
            /(itel) ((\w+))/i
            ], [[VENDOR, lowerize], MODEL, [TYPE, strMapper, { 'tablet' : ['p10001l', 'w7001'], '*' : 'mobile' }]], [

            // Acer
            /droid.+; ([ab][1-7]-?[0178a]\d\d?)/i
            ], [MODEL, [VENDOR, 'Acer'], [TYPE, TABLET]], [

            // Meizu
            /droid.+; (m[1-5] note) bui/i,
            /\bmz-([-\w]{2,})/i
            ], [MODEL, [VENDOR, 'Meizu'], [TYPE, MOBILE]], [
                
            // Ulefone
            /; ((?:power )?armor(?:[\w ]{0,8}))(?: bui|\))/i
            ], [MODEL, [VENDOR, 'Ulefone'], [TYPE, MOBILE]], [

            // Energizer
            /; (energy ?\w+)(?: bui|\))/i,
            /; energizer ([\w ]+)(?: bui|\))/i
            ], [MODEL, [VENDOR, 'Energizer'], [TYPE, MOBILE]], [

            // Cat
            /; cat (b35);/i,
            /; (b15q?|s22 flip|s48c|s62 pro)(?: bui|\))/i
            ], [MODEL, [VENDOR, 'Cat'], [TYPE, MOBILE]], [

            // Smartfren
            /((?:new )?andromax[\w- ]+)(?: bui|\))/i
            ], [MODEL, [VENDOR, 'Smartfren'], [TYPE, MOBILE]], [

            // Nothing
            /droid.+; (a(in)?(0(15|59|6[35])|142)p?)/i
            ], [MODEL, [VENDOR, 'Nothing'], [TYPE, MOBILE]], [

            // Archos
            /; (x67 5g|tikeasy \w+|ac[1789]\d\w+)( b|\))/i,
            /archos ?(5|gamepad2?|([\w ]*[t1789]|hello) ?\d+[\w ]*)( b|\))/i
            ], [MODEL, [VENDOR, 'Archos'], [TYPE, TABLET]], [
            /archos ([\w ]+)( b|\))/i,
            /; (ac[3-6]\d\w{2,8})( b|\))/i 
            ], [MODEL, [VENDOR, 'Archos'], [TYPE, MOBILE]], [

            // HMD
            /; (n159v)/i
            ], [MODEL, [VENDOR, 'HMD'], [TYPE, MOBILE]], [

            // MIXED
            /(imo) (tab \w+)/i,                                                 // IMO
            /(infinix|tecno) (x1101b?|p904|dp(7c|8d|10a)( pro)?|p70[1-3]a?|p904|t1101)/i                     // Infinix XPad / Tecno
            ], [VENDOR, MODEL, [TYPE, TABLET]], [

            /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus(?! zenw)|dell|jolla|meizu|motorola|polytron|tecno|micromax|advan)[-_ ]?([-\w]*)/i,
                                                                                // BlackBerry/BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Meizu/Motorola/Polytron/Tecno/Micromax/Advan
                                                                                // BLU/HMD/IMO/Infinix/Lava/OnePlus/TCL/Wiko
            /; (blu|hmd|imo|infinix|lava|oneplus|tcl|wiko)[_ ]([\w\+ ]+?)(?: bui|\)|; r)/i,
            /(hp) ([\w ]+\w)/i,                                                 // HP iPAQ
            /(microsoft); (lumia[\w ]+)/i,                                      // Microsoft Lumia
            /(oppo) ?([\w ]+) bui/i,                                            // OPPO
            /(hisense) ([ehv][\w ]+)\)/i,                                       // Hisense
            /droid[^;]+; (philips)[_ ]([sv-x][\d]{3,4}[xz]?)/i                  // Philips
            ], [VENDOR, MODEL, [TYPE, MOBILE]], [

            /(kobo)\s(ereader|touch)/i,                                         // Kobo
            /(hp).+(touchpad(?!.+tablet)|tablet)/i,                             // HP TouchPad
            /(kindle)\/([\w\.]+)/i                                              // Kindle
            ], [VENDOR, MODEL, [TYPE, TABLET]], [

            /(surface duo)/i                                                    // Surface Duo
            ], [MODEL, [VENDOR, MICROSOFT], [TYPE, TABLET]], [
            /droid [\d\.]+; (fp\du?)(?: b|\))/i                                 // Fairphone
            ], [MODEL, [VENDOR, 'Fairphone'], [TYPE, MOBILE]], [
            /((?:tegranote|shield t(?!.+d tv))[\w- ]*?)(?: b|\))/i              // Nvidia Tablets
            ], [MODEL, [VENDOR, NVIDIA], [TYPE, TABLET]], [
            /(sprint) (\w+)/i                                                   // Sprint Phones
            ], [VENDOR, MODEL, [TYPE, MOBILE]], [
            /(kin\.[onetw]{3})/i                                                // Microsoft Kin
            ], [[MODEL, /\./g, ' '], [VENDOR, MICROSOFT], [TYPE, MOBILE]], [
            /droid.+; ([c6]+|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i               // Zebra
            ], [MODEL, [VENDOR, ZEBRA], [TYPE, TABLET]], [
            /droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i
            ], [MODEL, [VENDOR, ZEBRA], [TYPE, MOBILE]], [

            ///////////////////
            // SMARTTVS
            ///////////////////

            /(philips)[\w ]+tv/i,                                               // Philips
            /smart-tv.+(samsung)/i                                              // Samsung
            ], [VENDOR, [TYPE, SMARTTV]], [
            /hbbtv.+maple;(\d+)/i
            ], [[MODEL, /^/, 'SmartTV'], [VENDOR, SAMSUNG], [TYPE, SMARTTV]], [
            /(vizio)(?: |.+model\/)(\w+-\w+)/i,                                 // Vizio
            /tcast.+(lg)e?. ([-\w]+)/i                                          // LG SmartTV
            ], [VENDOR, MODEL, [TYPE, SMARTTV]], [
            /(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i
            ], [[VENDOR, LG], [TYPE, SMARTTV]], [
            /(apple) ?tv/i                                                      // Apple TV
            ], [VENDOR, [MODEL, APPLE+' TV'], [TYPE, SMARTTV]], [
            /crkey.*devicetype\/chromecast/i                                    // Google Chromecast Third Generation
            ], [[MODEL, CHROMECAST+' Third Generation'], [VENDOR, GOOGLE], [TYPE, SMARTTV]], [
            /crkey.*devicetype\/([^/]*)/i                                       // Google Chromecast with specific device type
            ], [[MODEL, /^/, 'Chromecast '], [VENDOR, GOOGLE], [TYPE, SMARTTV]], [
            /fuchsia.*crkey/i                                                   // Google Chromecast Nest Hub
            ], [[MODEL, CHROMECAST+' Nest Hub'], [VENDOR, GOOGLE], [TYPE, SMARTTV]], [
            /crkey/i                                                            // Google Chromecast, Linux-based or unknown
            ], [[MODEL, CHROMECAST], [VENDOR, GOOGLE], [TYPE, SMARTTV]], [
            /(portaltv)/i                                                       // Facebook Portal TV
            ], [MODEL, [VENDOR, FACEBOOK], [TYPE, SMARTTV]], [
            /droid.+aft(\w+)( bui|\))/i                                         // Fire TV
            ], [MODEL, [VENDOR, AMAZON], [TYPE, SMARTTV]], [
            /(shield \w+ tv)/i                                                  // Nvidia Shield TV
            ], [MODEL, [VENDOR, NVIDIA], [TYPE, SMARTTV]], [
            /\(dtv[\);].+(aquos)/i,
            /(aquos-tv[\w ]+)\)/i                                               // Sharp
            ], [MODEL, [VENDOR, SHARP], [TYPE, SMARTTV]],[
            /(bravia[\w ]+)( bui|\))/i                                          // Sony
            ], [MODEL, [VENDOR, SONY], [TYPE, SMARTTV]], [
            /(mi(tv|box)-?\w+) bui/i                                            // Xiaomi
            ], [MODEL, [VENDOR, XIAOMI], [TYPE, SMARTTV]], [
            /Hbbtv.*(technisat) (.*);/i                                         // TechniSAT
            ], [VENDOR, MODEL, [TYPE, SMARTTV]], [
            /\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i,                          // Roku
            /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i         // HbbTV devices
            ], [[VENDOR, /.+\/(\w+)/, '$1', strMapper, {'LG':'lge'}], [MODEL, trim], [TYPE, SMARTTV]], [

            ///////////////////
            // CONSOLES
            ///////////////////

            /(playstation \w+)/i                                                // Playstation
            ], [MODEL, [VENDOR, SONY], [TYPE, CONSOLE]], [
            /\b(xbox(?: one)?(?!; xbox))[\); ]/i                                // Microsoft Xbox
            ], [MODEL, [VENDOR, MICROSOFT], [TYPE, CONSOLE]], [
            /(ouya)/i,                                                          // Ouya
            /(nintendo) (\w+)/i,                                                // Nintendo
            /(retroid) (pocket ([^\)]+))/i                                      // Retroid Pocket
            ], [VENDOR, MODEL, [TYPE, CONSOLE]], [
            /droid.+; (shield)( bui|\))/i                                       // Nvidia Portable
            ], [MODEL, [VENDOR, NVIDIA], [TYPE, CONSOLE]], [

            ///////////////////
            // WEARABLES
            ///////////////////

            /\b(sm-[lr]\d\d[0156][fnuw]?s?|gear live)\b/i                       // Samsung Galaxy Watch
            ], [MODEL, [VENDOR, SAMSUNG], [TYPE, WEARABLE]], [
            /((pebble))app/i,                                                   // Pebble
            /(asus|google|lg|oppo) ((pixel |zen)?watch[\w ]*)( bui|\))/i        // Asus ZenWatch / LG Watch / Pixel Watch
            ], [VENDOR, MODEL, [TYPE, WEARABLE]], [
            /(ow(?:19|20)?we?[1-3]{1,3})/i                                      // Oppo Watch
            ], [MODEL, [VENDOR, OPPO], [TYPE, WEARABLE]], [
            /(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i                              // Apple Watch
            ], [MODEL, [VENDOR, APPLE], [TYPE, WEARABLE]], [
            /(opwwe\d{3})/i                                                     // OnePlus Watch
            ], [MODEL, [VENDOR, ONEPLUS], [TYPE, WEARABLE]], [
            /(moto 360)/i                                                       // Motorola 360
            ], [MODEL, [VENDOR, MOTOROLA], [TYPE, WEARABLE]], [
            /(smartwatch 3)/i                                                   // Sony SmartWatch
            ], [MODEL, [VENDOR, SONY], [TYPE, WEARABLE]], [
            /(g watch r)/i                                                      // LG G Watch R
            ], [MODEL, [VENDOR, LG], [TYPE, WEARABLE]], [
            /droid.+; (wt63?0{2,3})\)/i
            ], [MODEL, [VENDOR, ZEBRA], [TYPE, WEARABLE]], [

            ///////////////////
            // XR
            ///////////////////

            /droid.+; (glass) \d/i                                              // Google Glass
            ], [MODEL, [VENDOR, GOOGLE], [TYPE, XR]], [
            /(pico) ([\w ]+) os\d/i                                             // Pico
            ], [VENDOR, MODEL, [TYPE, XR]], [
            /(quest( \d| pro)?s?).+vr/i                                         // Meta Quest
            ], [MODEL, [VENDOR, FACEBOOK], [TYPE, XR]], [
            /mobile vr; rv.+firefox/i                                           // Unidentifiable VR device using Firefox Reality / Wolvic
            ], [[TYPE, XR]], [

            ///////////////////
            // EMBEDDED
            ///////////////////

            /(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i                              // Tesla
            ], [VENDOR, [TYPE, EMBEDDED]], [
            /(aeobc)\b/i                                                        // Echo Dot
            ], [MODEL, [VENDOR, AMAZON], [TYPE, EMBEDDED]], [
            /(homepod).+mac os/i                                                // Apple HomePod
            ], [MODEL, [VENDOR, APPLE], [TYPE, EMBEDDED]], [
            /windows iot/i                                                      // Unidentifiable embedded device using Windows IoT
            ], [[TYPE, EMBEDDED]], [

            ////////////////////
            // MIXED (GENERIC)
            ///////////////////

            /droid.+; ([\w- ]+) (4k|android|smart|google)[- ]?tv/i              // Unidentifiable SmartTV
            ], [MODEL, [TYPE, SMARTTV]], [
            /\b((4k|android|smart|opera)[- ]?tv|tv; rv:|large screen[\w ]+safari)\b/i
            ], [[TYPE, SMARTTV]], [
            /droid .+?; ([^;]+?)(?: bui|; wv\)|\) applew|; hmsc).+?(mobile|vr|\d) safari/i
            ], [MODEL, [TYPE, strMapper, { 'mobile' : 'Mobile', 'xr' : 'VR', '*' : TABLET }]], [
            /\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i                      // Unidentifiable Tablet
            ], [[TYPE, TABLET]], [
            /(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i    // Unidentifiable Mobile
            ], [[TYPE, MOBILE]], [
            /droid .+?; ([\w\. -]+)( bui|\))/i                                  // Generic Android Device
            ], [MODEL, [VENDOR, 'Generic']]
        ],

        engine : [[

            /windows.+ edge\/([\w\.]+)/i                                       // EdgeHTML
            ], [VERSION, [NAME, EDGE+'HTML']], [

            /(arkweb)\/([\w\.]+)/i                                              // ArkWeb
            ], [NAME, VERSION], [

            /webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i                         // Blink
            ], [VERSION, [NAME, 'Blink']], [

            /(presto)\/([\w\.]+)/i,                                             // Presto
            /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna|servo)\/([\w\.]+)/i, // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m/Goanna/Servo
            /ekioh(flow)\/([\w\.]+)/i,                                          // Flow
            /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i,                           // KHTML/Tasman/Links
            /(icab)[\/ ]([23]\.[\d\.]+)/i,                                      // iCab

            /\b(libweb)/i                                                       // LibWeb
            ], [NAME, VERSION], [
            /ladybird\//i
            ], [[NAME, 'LibWeb']], [

            /rv\:([\w\.]{1,9})\b.+(gecko)/i                                     // Gecko
            ], [VERSION, NAME]
        ],

        os : [[

            // Windows
            /(windows nt) (6\.[23]); arm/i                                      // Windows RT
            ], [[NAME, /N/, 'R'], [VERSION, strMapper, windowsVersionMap]], [
            /(windows (?:phone|mobile|iot))(?: os)?[\/ ]?([\d\.]*( se)?)/i,     // Windows IoT/Mobile/Phone
                                                                                // Windows NT/3.1/95/98/ME/2000/XP/Vista/7/8/8.1/10/11
            /(windows)[\/ ](1[01]|2000|3\.1|7|8(\.1)?|9[58]|me|server 20\d\d( r2)?|vista|xp)/i
            ], [NAME, VERSION], [
            /windows nt ?([\d\.\)]*)(?!.+xbox)/i,
            /\bwin(?=3| ?9|n)(?:nt| 9x )?([\d\.;]*)/i
            ], [[VERSION, /(;|\))/g, '', strMapper, windowsVersionMap], [NAME, WINDOWS]], [
            /(windows ce)\/?([\d\.]*)/i                                         // Windows CE
            ], [NAME, VERSION], [

            // iOS/macOS
            /[adehimnop]{4,7}\b(?:.*os ([\w]+) like mac|; opera)/i,             // iOS
            /(?:ios;fbsv|ios(?=.+ip(?:ad|hone))|ip(?:ad|hone)(?: |.+i(?:pad)?)os)[\/ ]([\w\.]+)/i,
            /cfnetwork\/.+darwin/i
            ], [[VERSION, /_/g, '.'], [NAME, 'iOS']], [
            /(mac os x) ?([\w\. ]*)/i,
            /(macintosh|mac_powerpc\b)(?!.+(haiku|morphos))/i                   // Mac OS
            ], [[NAME, 'macOS'], [VERSION, /_/g, '.']], [

            // Google Chromecast
            /android ([\d\.]+).*crkey/i                                         // Google Chromecast, Android-based
            ], [VERSION, [NAME, CHROMECAST + ' Android']], [
            /fuchsia.*crkey\/([\d\.]+)/i                                        // Google Chromecast, Fuchsia-based
            ], [VERSION, [NAME, CHROMECAST + ' Fuchsia']], [
            /crkey\/([\d\.]+).*devicetype\/smartspeaker/i                       // Google Chromecast, Linux-based Smart Speaker
            ], [VERSION, [NAME, CHROMECAST + ' SmartSpeaker']], [
            /linux.*crkey\/([\d\.]+)/i                                          // Google Chromecast, Legacy Linux-based
            ], [VERSION, [NAME, CHROMECAST + ' Linux']], [
            /crkey\/([\d\.]+)/i                                                 // Google Chromecast, unknown
            ], [VERSION, [NAME, CHROMECAST]], [

            // Mobile OSes
            /droid ([\w\.]+)\b.+(android[- ]x86)/i                              // Android-x86
            ], [VERSION, NAME], [                                               
            /(ubuntu) ([\w\.]+) like android/i                                  // Ubuntu Touch
            ], [[NAME, /(.+)/, '$1 Touch'], VERSION], [
            /(harmonyos)[\/ ]?([\d\.]*)/i,                                      // HarmonyOS
                                                                                // Android/Blackberry/WebOS/QNX/Bada/RIM/KaiOS/Maemo/MeeGo/S40/Sailfish OS/OpenHarmony/Tizen
            /(android|bada|blackberry|kaios|maemo|meego|openharmony|qnx|rim tablet os|sailfish|series40|symbian|tizen)\w*[-\/\.; ]?([\d\.]*)/i
            ], [NAME, VERSION], [
            /\(bb(10);/i                                                        // BlackBerry 10
            ], [VERSION, [NAME, BLACKBERRY]], [
            /(?:symbian ?os|symbos|s60(?=;)|series ?60)[-\/ ]?([\w\.]*)/i       // Symbian
            ], [VERSION, [NAME, 'Symbian']], [
            /mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i // Firefox OS
            ], [VERSION, [NAME, FIREFOX+' OS']], [
            /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i,                             // WebOS
            /webos(?:[ \/]?|\.tv-20(?=2[2-9]))(\d[\d\.]*)/i
            ], [VERSION, [NAME, 'webOS']], [
            /web0s;.+?(?:chr[o0]me|safari)\/(\d+)/i
                                                                                // https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
            ], [[VERSION, strMapper, {'25':'120','24':'108','23':'94','22':'87','6':'79','5':'68','4':'53','3':'38','2':'538','1':'537','*':'TV'}], [NAME, 'webOS']], [                   
            /watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i                              // watchOS
            ], [VERSION, [NAME, 'watchOS']], [

            // Google ChromeOS
            /(cros) [\w]+(?:\)| ([\w\.]+)\b)/i                                  // Chromium OS
            ], [[NAME, "Chrome OS"], VERSION],[

            // Smart TVs
            /panasonic;(viera)/i,                                               // Panasonic Viera
            /(netrange)mmh/i,                                                   // Netrange
            /(nettv)\/(\d+\.[\w\.]+)/i,                                         // NetTV

            // Console
            /(nintendo|playstation) (\w+)/i,                                    // Nintendo/Playstation
            /(xbox); +xbox ([^\);]+)/i,                                         // Microsoft Xbox (360, One, X, S, Series X, Series S)
            /(pico) .+os([\w\.]+)/i,                                            // Pico

            // Other
            /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i,                            // Joli/Palm
            /linux.+(mint)[\/\(\) ]?([\w\.]*)/i,                                // Mint
            /(mageia|vectorlinux|fuchsia|arcaos|arch(?= ?linux))[;l ]([\d\.]*)/i,  // Mageia/VectorLinux/Fuchsia/ArcaOS/Arch
            /([kxln]?ubuntu|debian|suse|opensuse|gentoo|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire|knoppix)(?: gnu[\/ ]linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i,
                                                                                // Ubuntu/Debian/SUSE/Gentoo/Slackware/Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus/Raspbian/Plan9/Minix/RISCOS/Contiki/Deepin/Manjaro/elementary/Sabayon/Linspire/Knoppix
            /((?:open)?solaris)[-\/ ]?([\w\.]*)/i,                              // Solaris
            /\b(aix)[; ]([1-9\.]{0,4})/i,                                       // AIX
            /(hurd|linux|morphos)(?: (?:arm|x86|ppc)\w*| ?)([\w\.]*)/i,         // Hurd/Linux/MorphOS
            /(gnu) ?([\w\.]*)/i,                                                // GNU
            /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i, // FreeBSD/NetBSD/OpenBSD/PC-BSD/GhostBSD/DragonFly
            /(haiku) ?(r\d)?/i                                                  // Haiku
            ], [NAME, VERSION], [
            /(sunos) ?([\d\.]*)/i                                               // Solaris
            ], [[NAME, 'Solaris'], VERSION], [
            /\b(beos|os\/2|amigaos|openvms|hp-ux|serenityos)/i,                 // BeOS/OS2/AmigaOS/OpenVMS/HP-UX/SerenityOS
            /(unix) ?([\w\.]*)/i                                                // UNIX
            ], [NAME, VERSION]
        ]
    };

    /////////////////
    // Factories
    ////////////////

    var defaultProps = (function () {
            var props = { init : {}, isIgnore : {}, isIgnoreRgx : {}, toString : {}};
            setProps.call(props.init, [
                [BROWSER, [NAME, VERSION, MAJOR, TYPE]],
                [CPU, [ARCHITECTURE]],
                [DEVICE, [TYPE, MODEL, VENDOR]],
                [ENGINE, [NAME, VERSION]],
                [OS, [NAME, VERSION]]
            ]);
            setProps.call(props.isIgnore, [
                [BROWSER, [VERSION, MAJOR]],
                [ENGINE, [VERSION]],
                [OS, [VERSION]]
            ]);
            setProps.call(props.isIgnoreRgx, [
                [BROWSER, / ?browser$/i],
                [OS, / ?os$/i]
            ]);
            setProps.call(props.toString, [
                [BROWSER, [NAME, VERSION]],
                [CPU, [ARCHITECTURE]],
                [DEVICE, [VENDOR, MODEL]],
                [ENGINE, [NAME, VERSION]],
                [OS, [NAME, VERSION]]
            ]);
            return props;
    })();

    var createIData = function (item, itemType) {

        var init_props = defaultProps.init[itemType],
            is_ignoreProps = defaultProps.isIgnore[itemType] || 0,
            is_ignoreRgx = defaultProps.isIgnoreRgx[itemType] || 0,
            toString_props = defaultProps.toString[itemType] || 0;

        function IData () {
            setProps.call(this, init_props);
        }

        IData.prototype.getItem = function () {
            return item;
        };

        IData.prototype.withClientHints = function () {

            // nodejs / non-client-hints browsers
            if (!NAVIGATOR_UADATA) {
                return item
                        .parseCH()
                        .get();
            }

            // browsers based on chromium 85+
            return NAVIGATOR_UADATA
                    .getHighEntropyValues(CH_ALL_VALUES)
                    .then(function (res) {
                        return item
                                .setCH(new UACHData(res, false))
                                .parseCH()
                                .get();
            });
        };

        IData.prototype.withFeatureCheck = function () {
            return item.detectFeature().get();
        };

        if (itemType != RESULT) {
            IData.prototype.is = function (strToCheck) {
                var is = false;
                for (var i in this) {
                    if (this.hasOwnProperty(i) && !has(is_ignoreProps, i) && lowerize(is_ignoreRgx ? strip(is_ignoreRgx, this[i]) : this[i]) == lowerize(is_ignoreRgx ? strip(is_ignoreRgx, strToCheck) : strToCheck)) {
                        is = true;
                        if (strToCheck != TYPEOF.UNDEFINED) break;
                    } else if (strToCheck == TYPEOF.UNDEFINED && is) {
                        is = !is;
                        break;
                    }
                }
                return is;
            };
            IData.prototype.toString = function () {
                var str = EMPTY;
                for (var i in toString_props) {
                    if (typeof(this[toString_props[i]]) !== TYPEOF.UNDEFINED) {
                        str += (str ? ' ' : EMPTY) + this[toString_props[i]];
                    }
                }
                return str || TYPEOF.UNDEFINED;
            };
        }

        if (!NAVIGATOR_UADATA) {
            IData.prototype.then = function (cb) { 
                var that = this;
                var IDataResolve = function () {
                    for (var prop in that) {
                        if (that.hasOwnProperty(prop)) {
                            this[prop] = that[prop];
                        }
                    }
                };
                IDataResolve.prototype = {
                    is : IData.prototype.is,
                    toString : IData.prototype.toString
                };
                var resolveData = new IDataResolve();
                cb(resolveData);
                return resolveData;
            };
        }

        return new IData();
    };

    /////////////////
    // Constructor
    ////////////////

    function UACHData (uach, isHttpUACH) {
        uach = uach || {};
        setProps.call(this, CH_ALL_VALUES);
        if (isHttpUACH) {
            setProps.call(this, [
                [BRANDS, itemListToArray(uach[CH])],
                [FULLVERLIST, itemListToArray(uach[CH_FULL_VER_LIST])],
                [MOBILE, /\?1/.test(uach[CH_MOBILE])],
                [MODEL, stripQuotes(uach[CH_MODEL])],
                [PLATFORM, stripQuotes(uach[CH_PLATFORM])],
                [PLATFORMVER, stripQuotes(uach[CH_PLATFORM_VER])],
                [ARCHITECTURE, stripQuotes(uach[CH_ARCH])],
                [FORMFACTORS, itemListToArray(uach[CH_FORM_FACTORS])],
                [BITNESS, stripQuotes(uach[CH_BITNESS])]
            ]);
        } else {
            for (var prop in uach) {
                if(this.hasOwnProperty(prop) && typeof uach[prop] !== TYPEOF.UNDEFINED) this[prop] = uach[prop];
            }
        }
    }

    function UAItem (itemType, ua, rgxMap, uaCH) {

        this.get = function (prop) {
            if (!prop) return this.data;
            return this.data.hasOwnProperty(prop) ? this.data[prop] : undefined;
        };

        this.set = function (prop, val) {
            this.data[prop] = val;
            return this;
        };

        this.setCH = function (ch) {
            this.uaCH = ch;
            return this;
        };

        this.detectFeature = function () {
            if (NAVIGATOR && NAVIGATOR.userAgent == this.ua) {
                switch (this.itemType) {
                    case BROWSER:
                        // Brave-specific detection
                        if (NAVIGATOR.brave && typeof NAVIGATOR.brave.isBrave == TYPEOF.FUNCTION) {
                            this.set(NAME, 'Brave');
                        }
                        break;
                    case DEVICE:
                        // Chrome-specific detection: check for 'mobile' value of navigator.userAgentData
                        if (!this.get(TYPE) && NAVIGATOR_UADATA && NAVIGATOR_UADATA[MOBILE]) {
                            this.set(TYPE, MOBILE);
                        }
                        // iPadOS-specific detection: identified as Mac, but has some iOS-only properties
                        if (this.get(MODEL) == 'Macintosh' && NAVIGATOR && typeof NAVIGATOR.standalone !== TYPEOF.UNDEFINED && NAVIGATOR.maxTouchPoints && NAVIGATOR.maxTouchPoints > 2) {
                            this.set(MODEL, 'iPad')
                                .set(TYPE, TABLET);
                        }
                        break;
                    case OS:
                        // Chrome-specific detection: check for 'platform' value of navigator.userAgentData
                        if (!this.get(NAME) && NAVIGATOR_UADATA && NAVIGATOR_UADATA[PLATFORM]) {
                            this.set(NAME, NAVIGATOR_UADATA[PLATFORM]);
                        }
                        break;
                    case RESULT:
                        var data = this.data;
                        var detect = function (itemType) {
                            return data[itemType]
                                    .getItem()
                                    .detectFeature()
                                    .get();
                        };
                        this.set(BROWSER, detect(BROWSER))
                            .set(CPU, detect(CPU))
                            .set(DEVICE, detect(DEVICE))
                            .set(ENGINE, detect(ENGINE))
                            .set(OS, detect(OS));
                }
            }
            return this;
        };

        this.parseUA = function () {
            if (this.itemType != RESULT) {
                rgxMapper.call(this.data, this.ua, this.rgxMap);
            }
            switch (this.itemType) {
                case BROWSER:
                    this.set(MAJOR, majorize(this.get(VERSION)));
                    break;
                case OS:
                    if (this.get(NAME) == 'iOS' && this.get(VERSION) == '18.6') {
                        // Based on the assumption that iOS version is tightly coupled with Safari version
                        var realVersion = /\) Version\/([\d\.]+)/.exec(this.ua); // Get Safari version
                        if (realVersion && parseInt(realVersion[1].substring(0,2), 10) >= 26) {
                            this.set(VERSION, realVersion[1]);  // Set as iOS version
                        }
                    }
                    break;
            }
            return this;
        };

        this.parseCH = function () {
            var uaCH = this.uaCH,
                rgxMap = this.rgxMap;
    
            switch (this.itemType) {
                case BROWSER:
                case ENGINE:
                    var brands = uaCH[FULLVERLIST] || uaCH[BRANDS], prevName;
                    if (brands) {
                        for (var i=0; i<brands.length; i++) {
                            var brandName = brands[i].brand || brands[i],
                                brandVersion = brands[i].version;
                            if (this.itemType == BROWSER && 
                                !/not.a.brand/i.test(brandName) && 
                                (!prevName || 
                                    (/Chrom/.test(prevName) && brandName != CHROMIUM) || 
                                    (prevName == EDGE && /WebView2/.test(brandName))
                                )) {
                                    brandName = strMapper(brandName, browserHintsMap);
                                    prevName = this.get(NAME);
                                    if (!(prevName && !/Chrom/.test(prevName) && /Chrom/.test(brandName))) {
                                        this.set(NAME, brandName)
                                            .set(VERSION, brandVersion)
                                            .set(MAJOR, majorize(brandVersion));
                                    }
                                    prevName = brandName;
                            }
                            if (this.itemType == ENGINE && brandName == CHROMIUM) {
                                this.set(VERSION, brandVersion);
                            }
                        }
                    }
                    break;
                case CPU:
                    var archName = uaCH[ARCHITECTURE];
                    if (archName) {
                        if (archName && uaCH[BITNESS] == '64') archName += '64';
                        rgxMapper.call(this.data, archName + ';', rgxMap);
                    }
                    break;
                case DEVICE:
                    if (uaCH[MOBILE]) {
                        this.set(TYPE, MOBILE);
                    }
                    if (uaCH[MODEL]) {
                        this.set(MODEL, uaCH[MODEL]);
                        if (!this.get(TYPE) || !this.get(VENDOR)) {
                            var reParse = {};
                            rgxMapper.call(reParse, 'droid 9; ' + uaCH[MODEL] + ')', rgxMap);
                            if (!this.get(TYPE) && !!reParse.type) {
                                this.set(TYPE, reParse.type);
                            }
                            if (!this.get(VENDOR) && !!reParse.vendor) {
                                this.set(VENDOR, reParse.vendor);
                            }
                        }
                    }
                    if (uaCH[FORMFACTORS]) {
                        var ff;
                        if (typeof uaCH[FORMFACTORS] !== 'string') {
                            var idx = 0;
                            while (!ff && idx < uaCH[FORMFACTORS].length) {
                                ff = strMapper(uaCH[FORMFACTORS][idx++], formFactorsMap);
                            }
                        } else {
                            ff = strMapper(uaCH[FORMFACTORS], formFactorsMap);
                        }
                        this.set(TYPE, ff);
                    }
                    break;
                case OS:
                    var osName = uaCH[PLATFORM];
                    if(osName) {
                        var osVersion = uaCH[PLATFORMVER];
                        if (osName == WINDOWS) osVersion = (parseInt(majorize(osVersion), 10) >= 13 ? '11' : '10');
                        this.set(NAME, osName)
                            .set(VERSION, osVersion);
                    }
                    // Xbox-Specific Detection
                    if (this.get(NAME) == WINDOWS && uaCH[MODEL] == 'Xbox') {
                        this.set(NAME, 'Xbox')
                            .set(VERSION, undefined);
                    }           
                    break;
                case RESULT:
                    var data = this.data;
                    var parse = function (itemType) {
                        return data[itemType]
                                .getItem()
                                .setCH(uaCH)
                                .parseCH()
                                .get();
                    };
                    this.set(BROWSER, parse(BROWSER))
                        .set(CPU, parse(CPU))
                        .set(DEVICE, parse(DEVICE))
                        .set(ENGINE, parse(ENGINE))
                        .set(OS, parse(OS));
            }
            return this;
        };

        setProps.call(this, [
            ['itemType', itemType],
            ['ua', ua],
            ['uaCH', uaCH],
            ['rgxMap', rgxMap],
            ['data', createIData(this, itemType)]
        ]);

        return this;
    }

    function UAParser (ua, extensions, headers) {

        if (typeof ua === TYPEOF.OBJECT) {
            if (isExtensions(ua, true)) {
                if (typeof extensions === TYPEOF.OBJECT) {
                    headers = extensions;               // case UAParser(extensions, headers)           
                }
                extensions = ua;                        // case UAParser(extensions)
            } else {
                headers = ua;                           // case UAParser(headers)
                extensions = undefined;
            }
            ua = undefined;
        } else if (typeof ua === TYPEOF.STRING && !isExtensions(extensions, true)) {
            headers = extensions;                       // case UAParser(ua, headers)
            extensions = undefined;
        }

        if (headers) {
            if (typeof headers.append === TYPEOF.FUNCTION) {
                // Convert Headers object into a plain object
                var kv = {};
                headers.forEach(function (v, k) { kv[String(k).toLowerCase()] = v; });
                headers = kv;
            } else {
                // Normalize headers field name into lowercase
                var normalized = {};
                for (var header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        normalized[String(header).toLowerCase()] = headers[header];
                    }
                }
                headers = normalized;
            }
        }
        
        if (!(this instanceof UAParser)) {
            return new UAParser(ua, extensions, headers).getResult();
        }

        var userAgent = typeof ua === TYPEOF.STRING ? ua :                                       // Passed user-agent string
                                (headers && headers[USER_AGENT] ? headers[USER_AGENT] :     // User-Agent from passed headers
                                ((NAVIGATOR && NAVIGATOR.userAgent) ? NAVIGATOR.userAgent : // navigator.userAgent
                                    EMPTY)),                                                // empty string

            httpUACH = new UACHData(headers, true),
            regexMap = extensions ? 
                        extend(defaultRegexes, extensions) : 
                        defaultRegexes,

            createItemFunc = function (itemType) {
                if (itemType == RESULT) {
                    return function () {
                        return new UAItem(itemType, userAgent, regexMap, httpUACH)
                                    .set('ua', userAgent)
                                    .set(BROWSER, this.getBrowser())
                                    .set(CPU, this.getCPU())
                                    .set(DEVICE, this.getDevice())
                                    .set(ENGINE, this.getEngine())
                                    .set(OS, this.getOS())
                                    .get();
                    };
                } else {
                    return function () {
                        return new UAItem(itemType, userAgent, regexMap[itemType], httpUACH)
                                    .parseUA()
                                    .get();
                    };
                }
            };
            
        // public methods
        setProps.call(this, [
            ['getBrowser', createItemFunc(BROWSER)],
            ['getCPU', createItemFunc(CPU)],
            ['getDevice', createItemFunc(DEVICE)],
            ['getEngine', createItemFunc(ENGINE)],
            ['getOS', createItemFunc(OS)],
            ['getResult', createItemFunc(RESULT)],
            ['getUA', function () { return userAgent; }],
            ['setUA', function (ua) {
                if (isString(ua)) userAgent = trim(ua, UA_MAX_LENGTH);
                return this;
            }]
        ])
        .setUA(userAgent);

        return this;
    }

    UAParser.VERSION = LIBVERSION;
    UAParser.BROWSER =  enumerize([NAME, VERSION, MAJOR, TYPE]);
    UAParser.CPU = enumerize([ARCHITECTURE]);
    UAParser.DEVICE = enumerize([MODEL, VENDOR, TYPE, CONSOLE, MOBILE, SMARTTV, TABLET, WEARABLE, EMBEDDED]);
    UAParser.ENGINE = UAParser.OS = enumerize([NAME, VERSION]);

/**
 * 日志持久化抽象基类：约定与 `idb` 的 `IDBPDatabase` 相近的 CRUD 形态，
 * 由具体环境子类（如 Web IndexedDB）实现。
 *
 * 持久化相关钩子统一使用 **`ls` 前缀**（log storage），降低与中间层、
 * 业务子类方法名（如 `add` / `get`）冲突、误覆盖的风险。
 *
 * 各 `ls*` 方法第一个参数均为对象仓库名（store name），与 `LogStore` 中
 * `b_dat` / `digestCache` / `meta` 等常量对应；`lsDeleteMany` 按条件批量删除（如按 `timestamp`）；
 * `lsGetStoreSize` 用游标累加各条 value 的负载字节数（非引擎磁盘占用）。
 * `lsInit` 仅做参数校验；连接打开、upgrade 与状态字段由**平台层**实现。
 */

/** @typedef {string|number|Date|ArrayBuffer|ArrayBufferView|IDBArrayKey} StorageKey */

/**
 * `lsDeleteMany` 第二参数：按字段条件删除（`$lte` 表示小于等于该值，上界是否包含由子类与底层存储约定）。
 * @typedef {{ timestamp: { $lte: number } }} LsDeleteManyFilter
 */

class LogStorageBase {

  /**
   * 校验库名、版本与对象仓库名列表（子类若需统一入口可先 `await super.lsInit(...)`，再执行 `openDB` 等）。
   * @param {string} dbName
   * @param {number} dbVersion
   * @param {readonly string[]|string[]} storeNames 参与建库/升级的对象仓库名（非空字符串）
   * @returns {Promise<void>}
   */
  async lsInit(dbName, dbVersion, storeNames) {
    if (typeof dbName !== 'string' || dbName.length === 0) {
      throw new TypeError('dbName must be a non-empty string');
    }
    if (!Number.isInteger(dbVersion) || dbVersion < 1) {
      throw new TypeError('dbVersion must be a positive integer');
    }
    if (!Array.isArray(storeNames) || storeNames.length === 0) {
      throw new TypeError('storeNames must be a non-empty array');
    }
    if (!storeNames.every((n) => typeof n === 'string' && n.length > 0)) {
      throw new TypeError('storeNames must contain only non-empty strings');
    }
  }

  /**
   * 插入一条记录（对应 `add`；若主键冲突应抛错）。
   * @param {string} storeName
   * @param {unknown} value
   * @returns {Promise<{key: StorageKey, size: number}>}
   */
  async lsAdd(storeName, value) {
    throw new Error(`${this.constructor.name}.lsAdd() must be implemented by subclass`);
  }

  /**
   * 读取指定仓库的全部记录。
   * @param {string} storeName
   * @returns {Promise<unknown[]>}
   */
  async lsGetAll(storeName) {
    throw new Error(`${this.constructor.name}.lsGetAll() must be implemented by subclass`);
  }

  /**
   * 清空指定仓库。
   * @param {string} storeName
   * @returns {Promise<void>}
   */
  async lsClear(storeName) {
    throw new Error(`${this.constructor.name}.lsClear() must be implemented by subclass`);
  }

  /**
   * 遍历指定对象仓库，用 `openCursor` 逐条累加 **value 负载字节数**（与 `getAll` 后逐条 `length` 加总语义一致，峰值内存更低）。
   * 不包含 IndexedDB 内部页/索引开销；非二进制 value 的计法由子类约定。
   * @param {string} storeName
   * @returns {Promise<number>}
   */
  async lsGetStoreSize(storeName) {
    throw new Error(`${this.constructor.name}.lsGetStoreSize() must be implemented by subclass`);
  }

  /**
   * 写入或覆盖记录（对应 `put`）。
   * 带 `keyPath` 的仓库可只传 `value`；`meta` 等 out-of-line 键时需传 `key`。
   * @param {string} storeName
   * @param {unknown} value
   * @param {StorageKey} [key]
   * @returns {Promise<StorageKey>}
   */
  async lsPut(storeName, value, key) {
    throw new Error(`${this.constructor.name}.lsPut() must be implemented by subclass`);
  }

  /**
   * 按键读取单条记录（对应 `get`）。
   * @param {string} storeName
   * @param {StorageKey} key
   * @returns {Promise<unknown|undefined>}
   */
  async lsGet(storeName, key) {
    throw new Error(`${this.constructor.name}.lsGet() must be implemented by subclass`);
  }

  /**
   * 在指定仓库中按条件批量删除（例如摘要仓库按 `timestamp` 删除过期项）。
   * @param {string} storeName
   * @param {LsDeleteManyFilter} filter
   * @returns {Promise<void>}
   */
  async lsDeleteMany(storeName, filter) {
    throw new Error(`${this.constructor.name}.lsDeleteMany() must be implemented by subclass`);
  }
}

const DB_NAME$1 = 'beacon-db';
const DB_VERSION$1 = 1;

// 定义对象存储区的名称
const STORE_LOGS$1 = 'b_dat';
const STORE_DIGEST$1 = 'digestCache';
const STORE_META$1 = 'meta';

/**
 * LogStore — 面向「日志 / digest / meta」的领域 API，通过 {@link LogStorageBase} 的 `ls*` 钩子由平台层实现持久化。
 * 本类不绑定具体存储引擎；浏览器实现见 `logbeacon` 包中的 `MixinLogStore`。
 */
class LogStore extends LogStorageBase {

  constructor() {
    super();
    this.lsInit(DB_NAME$1, DB_VERSION$1, [STORE_LOGS$1, STORE_DIGEST$1, STORE_META$1]);
  }

  // --- 日志 (b_dat) 操作 ---

  /**
   * 向数据库中添加一条日志记录。
   * @param {object} logData - 要存储的日志数据。
   * @returns {Promise<{key: StorageKey, size: number}>} 解析为新日志记录ID的 Promise。
   */
  async insertLog(logData) {
    // 注意：IndexedDB add/put 的返回值是 key
    return this.lsAdd(STORE_LOGS$1, logData);
  }

  /**
   * 获取数据库中所有的日志记录。
   * @returns {Promise<object[]>} 解析为所有日志记录数组的 Promise。
   */
  async getAllLogs() {
    return this.lsGetAll(STORE_LOGS$1);
  }

  /**
   * 获取数据库中所有的日志记录字节数。
   * @returns {Promise<number>} 解析为所有日志记录字节数的 Promise。
   */
  async getAllLogsBytes() {
    return this.lsGetStoreSize(STORE_LOGS$1);
  }

  /**
   * 从数据库中删除所有日志记录。
   * @returns {Promise<void>}
   */
  async clearLogs() {
    await this.lsClear(STORE_LOGS$1);
  }

  // --- 摘要 (digestCache) 操作 ---

  /**
   * 在数据库中设置或更新一个日志摘要及其时间戳。
   * @param {string} digest - 日志内容的摘要字符串。
   * @param {number} timestamp - 日志的时间戳。
   * @returns {Promise<string>} 解析为摘要键的 Promise。
   */
  async setDigest(digest, timestamp) {
    return this.lsPut(STORE_DIGEST$1, { digest, timestamp });
  }

  /**
   * 获取数据库中所有的摘要记录。
   * @returns {Promise<object[]>} 解析为所有摘要记录数组的 Promise。
   */
  async getAllDigests() {
    return this.lsGetAll(STORE_DIGEST$1);
  }

  /**
   * 从数据库中删除所有早于指定时间戳的旧摘要。
   * @param {number} maxAgeTimestamp - 用于判断摘要是否过期的最大时间戳。
   * @returns {Promise<void>}
   */
  async clearOldDigests(maxAgeTimestamp) {
    await this.lsDeleteMany(STORE_DIGEST$1, { timestamp: { $lte: maxAgeTimestamp } });
  }

  // --- 元数据 (meta) 操作 ---

  /**
   * 在数据库中设置或更新一个元数据键值对。
   * @param {string} key - 元数据的键。
   * @param {*} value - 要存储的元数据值（将被编码为二进制）。
   * @returns {Promise<string>} 解析为元数据键的 Promise。
   */
  async setMeta(key, value) {
    return this.lsPut(STORE_META$1, value, key);
  }

  /**
   * 从数据库中获取一个元数据值。
   * @param {string} key - 要获取的元数据的键。
   * @returns {Promise<any | null>} 解析为解码后的元数据值的 Promise，如果不存在则为 null。
   */
  async getMeta(key) {
    return this.lsGet(STORE_META$1, key);
  }

  /**
   * 获取数据库中所有的元数据记录。
   * @returns {Promise<Record<string, string|number>>} 解析为所有元数据记录数组的 Promise。
   */
  async getAllMeta() {
    return this.lsGetAll(STORE_META$1);
  }
}

/**
 * Web Storage 形态的内存实现（无 localStorage 等持久化层时使用）。
 * @returns {{ setItem(key: string, value: string): void, getItem(key: string): string | null }}
 */

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
function utf8Bytes(str) {
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
function dedupContentKey(str) {
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
function isSameDay(ts1, ts2) {
  const d1 = new Date(Number(ts1));
  const d2 = new Date(Number(ts2));
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

/**
 * 请求公网IP和地区（使用 geojs）
 * @returns {Promise<{ip?: string, region?: string}>}
 */
async function fetchPublicIPAndRegion() {
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

// 默认的数组采样规则
const ARRAY_SAMPLING_CONFIG = {
  primitive: {
    threshold: 20, // 对简单数组保持宽松的阈值
    head: 10,      // 保留足够的上下文
    tail: 4,
    middle: 3
  },
  complex: {
    threshold: 10, // 对复杂数组使用严格的阈值
    head: 5,       // 采用更保守的采样数
    tail: 3,
    middle: 2
  },
};

/** 无浏览器特化时的空处理器表；直接调用 core 导出时请使用 `.call(defaultTypeHandlers, …)` 或与 web 包一样 `.bind(handlers)` */
const defaultTypeHandlers = new Map();

/**
 * 递归地将值转换为可 JSON 序列化的格式。
 * @param {any} value - 需要序列化的值。
 * @param {object} [options={maxDepth: 10, sensitiveKeys: [...]}] - 序列化选项。
 * @param {number} [options.maxDepth=10] - 最大序列化深度。
 * @param {string[]} [options.sensitiveKeys=['password', 'token', 'secret', 'auth']] - 敏感信息的键名。
 * @param {number} [currentDepth=0] - 当前序列化深度，用于递归。
 * @param {WeakSet} [seen=new WeakSet()] - 用于检测循环引用的集合，用于递归。
 * @returns {any} 可序列化的值。
 */
function serializeSingleValue(
  value,
  options = {
    maxDepth: 10,
    sensitiveKeys: ['password', 'token', 'secret', 'auth'],
  },
  currentDepth = 0,
  seen = new WeakSet(),
) {
  const { maxDepth, sensitiveKeys } = options;
  const type = typeof value;

  // 处理原始类型和 null
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(type)) {
    return value;
  }

  // 处理 BigInt
  if (type === 'bigint') {
    return `${value.toString()}n`;
  }

  // 处理 Symbol
  if (type === 'symbol') {
    return value.toString();
  }
  
  // 处理函数
  if (type === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  // --- 对象类型处理开始 ---

  // 检查循环引用
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[循环引用]';
    }
    seen.add(value);
  }

  // 检查最大深度
  if (currentDepth >= maxDepth) {
    return `[达到最大深度: ${Object.prototype.toString.call(value)}]`;
  }

  // 处理特殊对象类型
  // 检查是否有专门的类型处理器（策略模式）
  for (const [typeConstructor, handler] of this.entries()) {
    if (value instanceof typeConstructor) {
      return handler(value, options, currentDepth, seen);
    }
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}\nStack: ${value.stack || ''}`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) {
      const keyStr = typeof k === 'object' && k !== null ? '[object]' : String(k);
      obj[keyStr] = serializeSingleValue.call(this, v, options, currentDepth + 1, seen);
    }
    return obj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    const arr = [];
    for (const v of value.values()) {
      arr.push(serializeSingleValue.call(this, v, options, currentDepth + 1, seen));
    }
    return arr;
  }

  // 处理数组 (包括采样逻辑)
  if (Array.isArray(value)) {
    const isComplex = value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
    const rules = isComplex ? ARRAY_SAMPLING_CONFIG.complex : ARRAY_SAMPLING_CONFIG.primitive;

    // 卫语句：如果未达到采样阈值，则正常处理并提前返回
    if (value.length <= rules.threshold) {
      return value.map(item => serializeSingleValue.call(this, item, options, currentDepth + 1, seen));
    }

    // --- 采样逻辑开始 ---
    const sampledResult = { _t: 'arr', _l: value.length, _e: {} };
    const indices = new Set();

    // Head
    for (let i = 0; i < rules.head && i < value.length; i++) {
      indices.add(i);
    }
    // Tail
    for (let i = 0; i < rules.tail && value.length - 1 - i >= 0; i++) {
      indices.add(value.length - 1 - i);
    }
    // Middle
    const midStart = Math.floor(value.length / 2 - rules.middle / 2);
    for (let i = 0; i < rules.middle && midStart + i < value.length; i++) {
      indices.add(midStart + i);
    }

    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    for (const index of sortedIndices) {
      sampledResult._e[index] = serializeSingleValue.call(this, value[index], options, currentDepth + 1, seen);
    }

    return sampledResult;
  }

  // 处理普通对象
  if (typeof value === 'object' && value !== null) {
     // 检查是否有自定义的 toJSON 方法
    if (typeof value.toJSON === 'function') {
      return serializeSingleValue.call(this, value.toJSON(), options, currentDepth + 1, seen);
    }

    const result = {};
    for (const key of Object.keys(value)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        result[key] = '[敏感信息已过滤]';
      } else {
        result[key] = serializeSingleValue.call(this, value[key], options, currentDepth + 1, seen);
      }
    }
    return result;
  }

  // 兜底处理
  return String(value);
}

/**
 * @file 常量定义文件
 */

/**
 * 预先计算好的元数据键的 SHA-256 哈希值，用于在 IndexedDB 中作为键名，以增强隐私性。
 * @const {Object<string, string>}
 */
const META_KEYS = {
  IP: 'bb9af5d1915da1fbc132ced081325efcd2e63e4804f96890f42e9739677237a4',
  REGION: 'c697d2981bf416569a16cfbcdec1542b5398f3cc77d2b905819aa99c46ecf6f6',
  LAST_UPDATE_TIME: '0682cd61a299947aa5324230d6d64eb1eef0a9b612cbdd2c7ca25355fb614201',
  LOG_CONTEXT: '5d9a7a8550f5914b8895af9c0dae801a3da0a102e411c2c505efe37f06a011fa',
  BEACON_URL: '24950352bd3207a680735e5075d9c1256b9c13d1116235b31305dfb256c5470a', // for 'beaconUrl'
};

/**
 * 可作为元数据键持久化的 META_KEYS 哈希值白名单（与 {@link META_KEYS} 的 value 一一对应）。
 * @type {readonly string[]}
 */
const META_KEYS_WHITELIST = Object.freeze(Object.values(META_KEYS));

/**
 * 日志处理器类
 * 负责单条日志的处理和存储，包括去重、元数据补充等
 */
let LogProcessor$1 = class LogProcessor extends LogStore {
  /**
   * 创建日志处理器实例
   * @param {Object} options - 配置选项
   * @param {number} [options.dedupInterval=2000] - 重复日志去重时间窗口（毫秒）
   */
  constructor(options = {}) {
    super(options);
    /**
     * 日志摘要缓存，用于去重 null 说明是冷启动
     * @type {Map<string, number>|null}
     * @private
     */
    this._logDigestCache = null;

    /**
     * 重复日志去重时间窗口（毫秒）
     * @type {number}
     * @private
     */
    this._dedupInterval = options.dedupInterval || 3000;

    /**
     * 当前公网出口IP
     * @type {string|null}
     * @private
     */
    this._currentIp = null;
    
    /**
     * 当前公网出口IP所在地区
     * @type {string|null}
     * @private
     */
    this._currentRegion = null;

    /**
     * 上次更新元数据的时间戳（毫秒）
     * @type {number}
     * @private
     */
    this._lastUpdateTime = 0;

    /**
     * 非标准 / 额外元数据的内存镜像（键不在 {@link META_KEYS_WHITELIST} 内时由 {@link LogProcessor#applyExtendedMetaIfChanged} 写入）。
     * @type {Object.<string, string>}
     */
    this.extendedMeta = Object.create(null);
  }

  /**
   * 获取摘要时间戳
   * @private
   * @returns {Promise<Map<string, number>>} - 摘要时间戳
   */
  async _getLogDigestCache() {
    if (this._logDigestCache) return this._logDigestCache;
    this._logDigestCache = await this.getAllDigests();
    if (!this._logDigestCache || this._logDigestCache.length === 0) {
      this._logDigestCache = new Map();
      return this._logDigestCache;
    }
    this._logDigestCache = new Map(this._logDigestCache.map(item => [item.digest, item.timestamp]));
    return this._logDigestCache;
  }

  /**
   * 添加摘要到缓存
   * @private
   * @param {string} digest - 日志摘要
   * @param {number} timestamp - 摘要时间戳
   * @returns {Promise<void>}
   */
  async _addLogDigestCache(digest, timestamp) {
    this._logDigestCache.set(digest, timestamp);
    await this.setDigest(digest, timestamp);
  }

  /**
   * 清空摘要缓存
   * @private
   * @returns {Promise<void>}
   */
  async _clearLogDigestCache() {
    this._logDigestCache.clear();
    await this.clearOldDigests(Date.now());
  }

  /**
   * 获取元数据，包括 IP、地理位置与内存中的扩展元数据镜像。
   * 该方法会优先从内存缓存中读取，如果缓存不存在或已过期（非同一天），则会重新获取并更新缓存和 IndexedDB。
   * @private
   * @returns {Promise<{ip: string, region: string, lastUpdateTime: number, extendedMeta: Object.<string, string>}>}
   */
  async _getMeta() {
    if (this._currentIp && this._currentRegion) {
      return {
        ip: this._currentIp,
        region: this._currentRegion,
        lastUpdateTime: this._lastUpdateTime,
        extendedMeta: this.extendedMeta,
      };
    }
    const meta = await this.getAllMeta();
    this._lastUpdateTime = meta[META_KEYS.LAST_UPDATE_TIME];
    const now = Date.now();
    this.extendedMeta = Object.fromEntries(Object.entries(meta).filter(([key]) => !META_KEYS_WHITELIST.includes(key)));
    if (this._lastUpdateTime && isSameDay(this._lastUpdateTime, now)) {
      this._currentIp = meta[META_KEYS.IP];
      this._currentRegion = meta[META_KEYS.REGION];
      return {
        ip: this._currentIp,
        region: this._currentRegion,
        lastUpdateTime: this._lastUpdateTime,
        extendedMeta: this.extendedMeta,
      };
    }

    const { ip, region } = await fetchPublicIPAndRegion();
    this._currentIp = ip;
    this._currentRegion = region;
    this._lastUpdateTime = now;

    await this.setMeta(META_KEYS.LAST_UPDATE_TIME, now);
    await this.setMeta(META_KEYS.IP, this._currentIp);
    await this.setMeta(META_KEYS.REGION, this._currentRegion);

    return {
      ip: this._currentIp,
      region: this._currentRegion,
      lastUpdateTime: this._lastUpdateTime,
      extendedMeta: this.extendedMeta,
    };
  }

  /**
   * 处理非标准或额外元数据：校验字符串后，白名单外键写入 {@link LogProcessor#extendedMeta}，再与 IndexedDB 比对并按需持久化。
   * @param {string} key - 元数据键
   * @param {string} value - 元数据值
   * @returns {Promise<void>}
   */
  async applyExtendedMetaIfChanged(key, value) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return;
    }
    if (!META_KEYS_WHITELIST.includes(key)) {
      this.extendedMeta[key] = value;
    }
    const stored = await this.getMeta(key);
    if (value !== stored) {
      await this.setMeta(key, value);
    }
  }

  /**
   * 添加日志到存储
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<{log: LogItem, size: number}|null>} - 返回是否成功添加
   */
  async insertLog(logItem) {
    if (!logItem.content) return null;
    let log = await this.dedupLog(logItem);
    console.log('添加日志', log);
    if (!log) return null;
    log = await this.completeLog(log);
    const {size = 0} = await super.insertLog(log);
    return {log, size};
  }
  /**
   * 日志去重
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<LogItem|null>} - 去重后的日志项，如果去重成功则返回 null
   */
  async dedupLog(logItem) {
    const digest = dedupContentKey(logItem.content);
    const digestCache = await this._getLogDigestCache();
    const lastTime = digestCache.get(digest);
    if (lastTime) {
      // 时间窗口内重复，丢弃
      if (logItem.time - lastTime <= this._dedupInterval) return null;
    }
    // 更新摘要时间或添加新摘要
    await this._addLogDigestCache(digest, logItem.time);
    return logItem;
  }
  /**
   * 日志补全元信息
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<LogItem>}
   */
  async completeLog(logItem) {
    const { ip, region, extendedMeta } = await this._getMeta();
    logItem.ip = ip;
    logItem.region = region;
    logItem.extendedMeta = serializeSingleValue.call(defaultTypeHandlers, extendedMeta);
    return logItem;
  }
};

const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);

let idbProxyableTypes;
let cursorAdvanceMethods;
// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes() {
    return (idbProxyableTypes ||
        (idbProxyableTypes = [
            IDBDatabase,
            IDBObjectStore,
            IDBIndex,
            IDBCursor,
            IDBTransaction,
        ]));
}
// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods() {
    return (cursorAdvanceMethods ||
        (cursorAdvanceMethods = [
            IDBCursor.prototype.advance,
            IDBCursor.prototype.continue,
            IDBCursor.prototype.continuePrimaryKey,
        ]));
}
const transactionDoneMap = new WeakMap();
const transformCache = new WeakMap();
const reverseTransformCache = new WeakMap();
function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
        const unlisten = () => {
            request.removeEventListener('success', success);
            request.removeEventListener('error', error);
        };
        const success = () => {
            resolve(wrap(request.result));
            unlisten();
        };
        const error = () => {
            reject(request.error);
            unlisten();
        };
        request.addEventListener('success', success);
        request.addEventListener('error', error);
    });
    // This mapping exists in reverseTransformCache but doesn't exist in transformCache. This
    // is because we create many promises from a single IDBRequest.
    reverseTransformCache.set(promise, request);
    return promise;
}
function cacheDonePromiseForTransaction(tx) {
    // Early bail if we've already created a done promise for this transaction.
    if (transactionDoneMap.has(tx))
        return;
    const done = new Promise((resolve, reject) => {
        const unlisten = () => {
            tx.removeEventListener('complete', complete);
            tx.removeEventListener('error', error);
            tx.removeEventListener('abort', error);
        };
        const complete = () => {
            resolve();
            unlisten();
        };
        const error = () => {
            reject(tx.error || new DOMException('AbortError', 'AbortError'));
            unlisten();
        };
        tx.addEventListener('complete', complete);
        tx.addEventListener('error', error);
        tx.addEventListener('abort', error);
    });
    // Cache it for later retrieval.
    transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
    get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
            // Special handling for transaction.done.
            if (prop === 'done')
                return transactionDoneMap.get(target);
            // Make tx.store return the only store in the transaction, or undefined if there are many.
            if (prop === 'store') {
                return receiver.objectStoreNames[1]
                    ? undefined
                    : receiver.objectStore(receiver.objectStoreNames[0]);
            }
        }
        // Else transform whatever we get back.
        return wrap(target[prop]);
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    },
    has(target, prop) {
        if (target instanceof IDBTransaction &&
            (prop === 'done' || prop === 'store')) {
            return true;
        }
        return prop in target;
    },
};
function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
    // Due to expected object equality (which is enforced by the caching in `wrap`), we
    // only create one new func per func.
    // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
    // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
    // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
    // with real promises, so each advance methods returns a new promise for the cursor object, or
    // undefined if the end of the cursor has been reached.
    if (getCursorAdvanceMethods().includes(func)) {
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            func.apply(unwrap(this), args);
            return wrap(this.request);
        };
    }
    return function (...args) {
        // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
        // the original object.
        return wrap(func.apply(unwrap(this), args));
    };
}
function transformCachableValue(value) {
    if (typeof value === 'function')
        return wrapFunction(value);
    // This doesn't return, it just creates a 'done' promise for the transaction,
    // which is later returned for transaction.done (see idbObjectHandler).
    if (value instanceof IDBTransaction)
        cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
        return new Proxy(value, idbProxyTraps);
    // Return the same value back if we're not going to transform it.
    return value;
}
function wrap(value) {
    // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
    // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
    if (value instanceof IDBRequest)
        return promisifyRequest(value);
    // If we've already transformed this value before, reuse the transformed value.
    // This is faster, but it also provides object equality.
    if (transformCache.has(value))
        return transformCache.get(value);
    const newValue = transformCachableValue(value);
    // Not all types are transformed.
    // These may be primitive types, so they can't be WeakMap keys.
    if (newValue !== value) {
        transformCache.set(value, newValue);
        reverseTransformCache.set(newValue, value);
    }
    return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);

/**
 * Open a database.
 *
 * @param name Name of the database.
 * @param version Schema version.
 * @param callbacks Additional callbacks.
 */
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
        request.addEventListener('upgradeneeded', (event) => {
            upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
        });
    }
    if (blocked) {
        request.addEventListener('blocked', (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion, event.newVersion, event));
    }
    openPromise
        .then((db) => {
        if (terminated)
            db.addEventListener('close', () => terminated());
        if (blocking) {
            db.addEventListener('versionchange', (event) => blocking(event.oldVersion, event.newVersion, event));
        }
    })
        .catch(() => { });
    return openPromise;
}

const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
const writeMethods = ['put', 'add', 'delete', 'clear'];
const cachedMethods = new Map();
function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase &&
        !(prop in target) &&
        typeof prop === 'string')) {
        return;
    }
    if (cachedMethods.get(prop))
        return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, '');
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
        !(isWrite || readMethods.includes(targetFuncName))) {
        return;
    }
    const method = async function (storeName, ...args) {
        // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
        const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
        let target = tx.store;
        if (useIndex)
            target = target.index(args.shift());
        // Must reject if op rejects.
        // If it's a write operation, must reject if tx.done rejects.
        // Must reject with op rejection first.
        // Must resolve with op value.
        // Must handle both promises (no unhandled rejections)
        return (await Promise.all([
            target[targetFuncName](...args),
            isWrite && tx.done,
        ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
}));

const advanceMethodProps = ['continue', 'continuePrimaryKey', 'advance'];
const methodMap = {};
const advanceResults = new WeakMap();
const ittrProxiedCursorToOriginalProxy = new WeakMap();
const cursorIteratorTraps = {
    get(target, prop) {
        if (!advanceMethodProps.includes(prop))
            return target[prop];
        let cachedFunc = methodMap[prop];
        if (!cachedFunc) {
            cachedFunc = methodMap[prop] = function (...args) {
                advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
            };
        }
        return cachedFunc;
    },
};
async function* iterate(...args) {
    // tslint:disable-next-line:no-this-assignment
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
        cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
        return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    // Map this double-proxy back to the original, so other cursor methods work.
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
        yield proxiedCursor;
        // If one of the advancing methods was not called, call continue().
        cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
        advanceResults.delete(proxiedCursor);
    }
}
function isIteratorProp(target, prop) {
    return ((prop === Symbol.asyncIterator &&
        instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
        (prop === 'iterate' && instanceOfAny(target, [IDBIndex, IDBObjectStore])));
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
        if (isIteratorProp(target, prop))
            return iterate;
        return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
        return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    },
}));

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
const TEXT_DECODER_MIN_LENGTH = 12;
const utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8');

const PBF_VARINT  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
const PBF_FIXED64 = 1; // 64-bit: double, fixed64, sfixed64
const PBF_BYTES   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
const PBF_FIXED32 = 5; // 32-bit: float, fixed32, sfixed32

class Pbf {
    /**
     * @param {Uint8Array | ArrayBuffer} [buf]
     */
    constructor(buf = new Uint8Array(16)) {
        this.buf = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf);
        this.dataView = new DataView(this.buf.buffer);
        this.pos = 0;
        this.type = 0;
        this.length = this.buf.length;
    }

    // === READING =================================================================

    /**
     * @template T
     * @param {(tag: number, result: T, pbf: Pbf) => void} readField
     * @param {T} result
     * @param {number} [end]
     */
    readFields(readField, result, end = this.length) {
        while (this.pos < end) {
            const val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    }

    /**
     * @template T
     * @param {(tag: number, result: T, pbf: Pbf) => void} readField
     * @param {T} result
     */
    readMessage(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    }

    readFixed32() {
        const val = this.dataView.getUint32(this.pos, true);
        this.pos += 4;
        return val;
    }

    readSFixed32() {
        const val = this.dataView.getInt32(this.pos, true);
        this.pos += 4;
        return val;
    }

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64() {
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getUint32(this.pos + 4, true) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    }

    readSFixed64() {
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getInt32(this.pos + 4, true) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    }

    readFloat() {
        const val = this.dataView.getFloat32(this.pos, true);
        this.pos += 4;
        return val;
    }

    readDouble() {
        const val = this.dataView.getFloat64(this.pos, true);
        this.pos += 8;
        return val;
    }

    /**
     * @param {boolean} [isSigned]
     */
    readVarint(isSigned) {
        const buf = this.buf;
        let val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder(val, isSigned, this);
    }

    readVarint64() { // for compatibility with v2.0.1
        return this.readVarint(true);
    }

    readSVarint() {
        const num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    }

    readBoolean() {
        return Boolean(this.readVarint());
    }

    readString() {
        const end = this.readVarint() + this.pos;
        const pos = this.pos;
        this.pos = end;

        if (end - pos >= TEXT_DECODER_MIN_LENGTH && utf8TextDecoder) {
            // longer strings are fast with the built-in browser TextDecoder API
            return utf8TextDecoder.decode(this.buf.subarray(pos, end));
        }
        // short strings are fast with our custom implementation
        return readUtf8(this.buf, pos, end);
    }

    readBytes() {
        const end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    }

    // verbose for performance reasons; doesn't affect gzipped size

    /**
     * @param {number[]} [arr]
     * @param {boolean} [isSigned]
     */
    readPackedVarint(arr = [], isSigned) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSVarint(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    }
    /** @param {boolean[]} [arr] */
    readPackedBoolean(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFloat(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedDouble(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFixed32(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSFixed32(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFixed64(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSFixed64(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    }
    readPackedEnd() {
        return this.type === PBF_BYTES ? this.readVarint() + this.pos : this.pos + 1;
    }

    /** @param {number} val */
    skip(val) {
        const type = val & 0x7;
        if (type === PBF_VARINT) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === PBF_BYTES) this.pos = this.readVarint() + this.pos;
        else if (type === PBF_FIXED32) this.pos += 4;
        else if (type === PBF_FIXED64) this.pos += 8;
        else throw new Error(`Unimplemented type: ${type}`);
    }

    // === WRITING =================================================================

    /**
     * @param {number} tag
     * @param {number} type
     */
    writeTag(tag, type) {
        this.writeVarint((tag << 3) | type);
    }

    /** @param {number} min */
    realloc(min) {
        let length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            const buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.dataView = new DataView(buf.buffer);
            this.length = length;
        }
    }

    finish() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    }

    /** @param {number} val */
    writeFixed32(val) {
        this.realloc(4);
        this.dataView.setInt32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeSFixed32(val) {
        this.realloc(4);
        this.dataView.setInt32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeFixed64(val) {
        this.realloc(8);
        this.dataView.setInt32(this.pos, val & -1, true);
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeSFixed64(val) {
        this.realloc(8);
        this.dataView.setInt32(this.pos, val & -1, true);
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeVarint(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    }

    /** @param {number} val */
    writeSVarint(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    }

    /** @param {boolean} val */
    writeBoolean(val) {
        this.writeVarint(+val);
    }

    /** @param {string} str */
    writeString(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        const startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8(this.buf, str, this.pos);
        const len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    }

    /** @param {number} val */
    writeFloat(val) {
        this.realloc(4);
        this.dataView.setFloat32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeDouble(val) {
        this.realloc(8);
        this.dataView.setFloat64(this.pos, val, true);
        this.pos += 8;
    }

    /** @param {Uint8Array} buffer */
    writeBytes(buffer) {
        const len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (let i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    }

    /**
     * @template T
     * @param {(obj: T, pbf: Pbf) => void} fn
     * @param {T} obj
     */
    writeRawMessage(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        const startPos = this.pos;
        fn(obj, this);
        const len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    }

    /**
     * @template T
     * @param {number} tag
     * @param {(obj: T, pbf: Pbf) => void} fn
     * @param {T} obj
     */
    writeMessage(tag, fn, obj) {
        this.writeTag(tag, PBF_BYTES);
        this.writeRawMessage(fn, obj);
    }

    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedVarint, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSVarint, arr);
    }
    /**
     * @param {number} tag
     * @param {boolean[]} arr
     */
    writePackedBoolean(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedBoolean, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFloat(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFloat, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedDouble(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedDouble, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed32, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed32, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed64, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed64, arr);
    }

    /**
     * @param {number} tag
     * @param {Uint8Array} buffer
     */
    writeBytesField(tag, buffer) {
        this.writeTag(tag, PBF_BYTES);
        this.writeBytes(buffer);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeSFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeSFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT);
        this.writeVarint(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT);
        this.writeSVarint(val);
    }
    /**
     * @param {number} tag
     * @param {string} str
     */
    writeStringField(tag, str) {
        this.writeTag(tag, PBF_BYTES);
        this.writeString(str);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFloatField(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeFloat(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeDoubleField(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeDouble(val);
    }
    /**
     * @param {number} tag
     * @param {boolean} val
     */
    writeBooleanField(tag, val) {
        this.writeVarintField(tag, +val);
    }
}
/**
 * @param {number} l
 * @param {boolean | undefined} s
 * @param {Pbf} p
 */
function readVarintRemainder(l, s, p) {
    const buf = p.buf;
    let h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

/**
 * @param {number} low
 * @param {number} high
 * @param {boolean} [isSigned]
 */
function toNum(low, high, isSigned) {
    return isSigned ? high * 0x100000000 + (low >>> 0) : ((high >>> 0) * 0x100000000) + (low >>> 0);
}

/**
 * @param {number} val
 * @param {Pbf} pbf
 */
function writeBigVarint(val, pbf) {
    let low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow(low, high, pbf);
    writeBigVarintHigh(high, pbf);
}

/**
 * @param {number} high
 * @param {number} low
 * @param {Pbf} pbf
 */
function writeBigVarintLow(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

/**
 * @param {number} high
 * @param {Pbf} pbf
 */
function writeBigVarintHigh(high, pbf) {
    const lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

/**
 * @param {number} startPos
 * @param {number} len
 * @param {Pbf} pbf
 */
function makeRoomForExtraLength(startPos, len, pbf) {
    const extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (let i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedVarint(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSVarint(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFloat(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedDouble(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);
}
/**
 * @param {boolean[]} arr
 * @param {Pbf} pbf
 */
function writePackedBoolean(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed32(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed32(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed64(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed64(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]);
}

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

/**
 * @param {Uint8Array} buf
 * @param {number} pos
 * @param {number} end
 */
function readUtf8(buf, pos, end) {
    let str = '';
    let i = pos;

    while (i < end) {
        const b0 = buf[i];
        let c = null; // codepoint
        let bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        let b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

/**
 * @param {Uint8Array} buf
 * @param {string} str
 * @param {number} pos
 */
function writeUtf8(buf, str, pos) {
    for (let i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

// code generated by pbf v4.0.1


function readLogItem(pbf, end) {
    return pbf.readFields(readLogItemField, {time: 0, level: "", content: "", clientUuid: "", window: "", url: "", ip: "", region: "", referrer: "", sessionId: "", extendedAttributes: {}, extendedMeta: {}}, end);
}
function readLogItemField(tag, obj, pbf) {
    if (tag === 1) obj.time = pbf.readVarint(true);
    else if (tag === 2) obj.level = pbf.readString();
    else if (tag === 3) obj.content = pbf.readString();
    else if (tag === 4) obj.clientUuid = pbf.readString();
    else if (tag === 7) obj.window = pbf.readString();
    else if (tag === 8) obj.url = pbf.readString();
    else if (tag === 9) obj.ip = pbf.readString();
    else if (tag === 10) obj.region = pbf.readString();
    else if (tag === 11) obj.referrer = pbf.readString();
    else if (tag === 12) obj.sessionId = pbf.readString();
    else if (tag === 13) { const {key, value} = readLogItem_FieldEntry13(pbf, pbf.readVarint() + pbf.pos); obj.extendedAttributes[key] = value; }
    else if (tag === 14) { const {key, value} = readLogItem_FieldEntry14(pbf, pbf.readVarint() + pbf.pos); obj.extendedMeta[key] = value; }
}
function writeLogItem(obj, pbf) {
    if (obj.time) pbf.writeVarintField(1, obj.time);
    if (obj.level) pbf.writeStringField(2, obj.level);
    if (obj.content) pbf.writeStringField(3, obj.content);
    if (obj.clientUuid) pbf.writeStringField(4, obj.clientUuid);
    if (obj.window) pbf.writeStringField(7, obj.window);
    if (obj.url) pbf.writeStringField(8, obj.url);
    if (obj.ip) pbf.writeStringField(9, obj.ip);
    if (obj.region) pbf.writeStringField(10, obj.region);
    if (obj.referrer) pbf.writeStringField(11, obj.referrer);
    if (obj.sessionId) pbf.writeStringField(12, obj.sessionId);
    if (obj.extendedAttributes) for (const key of Object.keys(obj.extendedAttributes)) pbf.writeMessage(13, writeLogItem_FieldEntry13, {key, value: obj.extendedAttributes[key]});
    if (obj.extendedMeta) for (const key of Object.keys(obj.extendedMeta)) pbf.writeMessage(14, writeLogItem_FieldEntry14, {key, value: obj.extendedMeta[key]});
}

function readLogItem_FieldEntry13(pbf, end) {
    return pbf.readFields(readLogItem_FieldEntry13Field, {key: "", value: ""}, end);
}
function readLogItem_FieldEntry13Field(tag, obj, pbf) {
    if (tag === 1) obj.key = pbf.readString();
    else if (tag === 2) obj.value = pbf.readString();
}
function writeLogItem_FieldEntry13(obj, pbf) {
    if (obj.key) pbf.writeStringField(1, obj.key);
    if (obj.value) pbf.writeStringField(2, obj.value);
}

function readLogItem_FieldEntry14(pbf, end) {
    return pbf.readFields(readLogItem_FieldEntry14Field, {key: "", value: ""}, end);
}
function readLogItem_FieldEntry14Field(tag, obj, pbf) {
    if (tag === 1) obj.key = pbf.readString();
    else if (tag === 2) obj.value = pbf.readString();
}
function writeLogItem_FieldEntry14(obj, pbf) {
    if (obj.key) pbf.writeStringField(1, obj.key);
    if (obj.value) pbf.writeStringField(2, obj.value);
}

/**
 * 日志持久化抽象基类：约定与 `idb` 的 `IDBPDatabase` 相近的 CRUD 形态，
 * 由具体环境子类（如 Web IndexedDB）实现。
 *
 * 持久化相关钩子统一使用 **`ls` 前缀**（log storage），降低与中间层、
 * 业务子类方法名（如 `add` / `get`）冲突、误覆盖的风险。
 *
 * 各 `ls*` 方法第一个参数均为对象仓库名（store name），与 `LogStore` 中
 * `b_dat` / `digestCache` / `meta` 等常量对应；`lsDeleteMany` 按条件批量删除（如按 `timestamp`）；
 * `lsGetStoreSize` 用游标累加各条 value 的负载字节数（非引擎磁盘占用）。
 * `lsInit` 仅做参数校验；连接打开、upgrade 与状态字段由**平台层**实现。
 */


const DB_NAME = 'beacon-db';
const DB_VERSION = 1;

// 定义对象存储区的名称
const STORE_LOGS = 'b_dat';
const STORE_DIGEST = 'digestCache';
const STORE_META = 'meta';

const MixinLogStore = (BaseClass) => {
  /**
  * LogStore - 一个用于管理 IndexedDB 中日志持久化的基类。
  * 它处理数据库初始化、模式升级，并为日志、摘要和元数据
  * 提供原子化的 CRUD 操作方法。
  */
  return class extends BaseClass {
    /**
     * @private
     * @type {Promise<import('idb').IDBPDatabase> | null}
     */
    _dbPromise = null;

    constructor(...args) {
      super(...args);
    }

    /**
     * 初始化 IndexedDB 数据库连接和模式。
     * @private
     */
    lsInit(dbName, dbVersion, storeNames) {
      this._dbPromise = openDB(dbName, dbVersion, {
        upgrade(db) {
          // 创建日志存储区 (b_dat)
          if (!db.objectStoreNames.contains(STORE_LOGS)) {
            db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
          }

          // 创建摘要缓存存储区 (digestCache)
          if (!db.objectStoreNames.contains(STORE_DIGEST)) {
            const digestStore = db.createObjectStore(STORE_DIGEST, { keyPath: 'digest' });
            // 创建时间戳索引，用于清理过期摘要
            digestStore.createIndex('by_timestamp', 'timestamp');
          }

          // 创建元数据存储区 (meta)
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META);
          }
        },
      });
    }

    /**
     * 获取数据库实例，如果需要则进行初始化。
     * @protected
     * @returns {Promise<import('idb').IDBPDatabase>} 一个解析为数据库实例的 Promise。
     */
    async _getDB() {
      if (!this._dbPromise) {
        this.lsInit(DB_NAME, DB_VERSION, [STORE_LOGS, STORE_DIGEST, STORE_META]);
      }
      return this._dbPromise;
    }

    /**
     * 将单条 IDB value 折算为用于 `lsGetStoreSize` 累加的字节数。
     * @param {unknown} value
     * @returns {number}
     * @private
     */
    _idbValuePayloadBytes(value) {
      if (value == null) return 0;
      if (typeof value === 'string') {
        return new TextEncoder().encode(value).length;
      }
      if (value instanceof ArrayBuffer) {
        return value.byteLength;
      }
      if (ArrayBuffer.isView(value)) {
        return value.byteLength;
      }
      try {
        return new TextEncoder().encode(JSON.stringify(value)).length;
      } catch {
        return 0;
      }
    }

    /**
     * @param {string} storeName
     * @returns {Promise<number>}
     */
    async lsGetStoreSize(storeName) {
      const db = await this._getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.store;
      let total = 0;
      let cursor = await store.openCursor();
      while (cursor) {
        total += this._idbValuePayloadBytes(cursor.value);
        cursor = await cursor.continue();
      }
      await tx.done;
      return total;
    }

    /**
     * 将数据编码为用于二进制存储的 Uint8Array。
     * @private
     * @param {string} data - 要编码的数据。
     * @returns {Uint8Array} 编码后的二进制数据。
     */
    _encode(data) {
      return utf8Bytes$1(data);
    }

    /**
     * 将 Uint8Array 解码回原始数据。
     * @private
     * @param {BufferSource | undefined} buffer - 要解码的二进制数据。
     * @returns {string | null} 解码后的数据，如果输入为空则返回 null。
     */
    _decode(buffer) {
      if (!buffer) return null;
      return new TextDecoder().decode(buffer);
    }

    // --- 日志 (b_dat) 操作 ---

    /**
     * 向数据库中添加一条日志记录。
     * @param {object} logData - 要存储的日志数据。
     * @returns {Promise<number>} 解析为新日志记录ID的 Promise。
     */
    async lsAdd(storeName, value) {
      console.log("indexeddb add", storeName, value);
      const db = await this._getDB();
      if (storeName === STORE_LOGS) {
        value = this.encodeLog(value);
      }
      const key = await db.add(storeName, value);
      return {key, size: this._idbValuePayloadBytes(value)};
    }

    /**
     * 获取数据库中所有的日志记录。
     * @returns {Promise<object[]>} 解析为所有日志记录数组的 Promise。
     */
    async lsGetAll(storeName) {
      const db = await this._getDB();
      if (storeName === STORE_META) {
        const tx = db.transaction(STORE_META, 'readonly');
        const store = tx.store;
        const allMeta = {};
        let cursor = await store.openCursor();

        while (cursor) {
          // The key is already a hash, and the value is decoded.
          allMeta[cursor.key] = this._decode(cursor.value);
          cursor = await cursor.continue();
        }

        await tx.done;
        return allMeta;
      }
      if (storeName === STORE_LOGS) {
        const rows = await db.getAll(storeName);
        return rows.map(row => {
          return this.decodeLog(row);
        });
      }
      const rows = await db.getAll(storeName);
      return rows;
    }

    /**
     * 从数据库中删除所有日志记录。
     * @returns {Promise<void>}
     */
    async lsClear(storeName) {
      const db = await this._getDB();
      await db.clear(storeName);
    }

    // --- 摘要 (digestCache) 操作 ---

    /**
     * 在数据库中设置或更新一个日志摘要及其时间戳。
     * @param {string} digest - 日志内容的摘要字符串。
     * @param {number} timestamp - 日志的时间戳。
     * @returns {Promise<string>} 解析为摘要键的 Promise。
     */
    async lsPut(storeName, value, key) {
      const db = await this._getDB();
      if (storeName === STORE_DIGEST) {
        return db.put(storeName, value);
      }
      if (storeName === STORE_META) {
        const encodedValue = this._encode(value);
        return db.put(storeName, encodedValue, key);
      }
      return db.put(storeName, value, key)
    }

    /**
     * 从数据库中获取一个元数据值。
     * @param {string} key - 要获取的元数据的键。
     * @returns {Promise<any | null>} 解析为解码后的元数据值的 Promise，如果不存在则为 null。
     */
    async lsGet(storeName, key) {
      const db = await this._getDB();
      const value = await db.get(storeName, key);
      if (storeName === STORE_META) {
        return this._decode(value);
      }
      return value;
    }

    /**
     * @param {string} storeName
     * @param {{ timestamp: { $lte: number } }} filter
     */
    async lsDeleteMany(storeName, filter) {
      const lte = filter?.timestamp?.$lte;
      if (lte === undefined || !Number.isFinite(lte)) {
        return;
      }
      if (storeName !== STORE_DIGEST) {
        throw new Error(`${this.constructor.name}.lsDeleteMany: unsupported store ${storeName}`);
      }
      const db = await this._getDB();
      const tx = db.transaction(STORE_DIGEST, 'readwrite');
      const index = tx.store.index('by_timestamp');
      let cursor = await index.openCursor(IDBKeyRange.upperBound(lte));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }

    /**
     * 日志编码
     * @param {LogItem} logItem - 日志项
     * @returns {Uint8Array}
     */
    encodeLog(logItem) {
      const pbf = new Pbf();
      writeLogItem(logItem, pbf);
      return pbf.finish();
    }

    /**
     * 解码日志
     * @param {Uint8Array} log - 日志数据
     * @returns {LogItem}
     */
    decodeLog(log) {
      const pbf = new Pbf(log);
      return readLogItem(pbf);
    }
  }
};

const LogProcessor = MixinLogStore(LogProcessor$1);

const generateLog = () => {
  const currentScript = document.currentScript;
  function initSWBridge() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const logProcessor = new LogProcessor();
      const uaSerialized = JSON.stringify(
        serializeSingleValue$1(UAParser(navigator.userAgent))
      );
      const screenSerialized = JSON.stringify({
        width: window.screen.width,
        height: window.screen.height,
      });
      logProcessor.applyExtendedMetaIfChanged("userAgent", uaSerialized);
      logProcessor.applyExtendedMetaIfChanged("screen", screenSerialized);

      const initInfo = {
        currentScript,
        serviceWorker: null,
      };

      // 发送事件
      const sendSWEvent = (msg) => {
        if (initInfo.serviceWorker) {
          return initInfo.serviceWorker.postMessage(msg);
        }
        const event = new CustomEvent('sendLog', {
          detail: msg
        });
        window.dispatchEvent(event);
      };

      // 定义 Service Worker 注册函数
      const registerServiceWorker = () => {
        const extraInfo = getLogExtraInfo();
        const loadLog = {
          level: 'trace',
          content: '[logbeacon] page load',
          ...extraInfo
        };
        // 指定 Service Worker 的路径和作用域
        navigator.serviceWorker.register('/beacon/beacon-sw.js', {
          type: 'module',
          scope: '/beacon/' // 明确指定作用域
        }).then(async (registration) => {
          // 每次页面加载主动请求浏览器检查 SW 脚本是否有更新（异步，对首屏影响可忽略）
          registration.update().catch(() => {});

          if (registration.active) {
            initInfo.serviceWorker = registration.active;
          } else {
            initInfo.serviceWorker = await getServiceWorker();
          }

          // 读取 beacon-url 配置并发送
          if (initInfo.currentScript) {
            const beaconUrl = initInfo.currentScript.getAttribute('data-beacon-url');
            if (beaconUrl) {
              sendSWEvent({
                type: 'config-update',
                payload: {
                  beaconUrl,
                },
              });
            }
          }

          sendSWEvent({ type: 'log', payload: loadLog });
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] Service Worker registered successfully',
              ...extraInfo
            }
          });
          sendSWEvent({ type: 'page-load' });
        }).catch((e) => {
          sendSWEvent({ type: 'log', payload: loadLog });
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'error',
              content: '[logbeacon] Failed to register Service Worker',
              ...extraInfo
            }
          });
        });

        // 页面卸载事件
        window.addEventListener('beforeunload', function() {
          const extraInfo = getLogExtraInfo();
          const payload = {
            level: 'trace',
            content: '[logbeacon] page unload',
            ...extraInfo
          };
          sendSWEvent({ type: 'log', payload });
          sendSWEvent({ type: 'page-unload' });
        });
      };

      // 立即注册 Service Worker
      registerServiceWorker();
      // 前后台切换事件
      document.addEventListener('visibilitychange', async function() {
        const extraInfo = getLogExtraInfo();
        if (document.visibilityState === 'hidden') {
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] page hidden',
              ...extraInfo
            }
          });
          sendSWEvent({ type: 'page-hidden' });
        } else if (document.visibilityState === 'visible') {
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] page visible',
              ...extraInfo
            }
          });
          sendSWEvent({ type: 'page-visible' });
        }
      });

      // 错误捕获
      window.addEventListener('error', function(e) {
        const extraInfo = getLogExtraInfo();
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e.error]),
            ...extraInfo
          }
        });
      });

      window.addEventListener('unhandledrejection', function(e) {
        const extraInfo = getLogExtraInfo();
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e.reason]),
            ...extraInfo
          }
        });
      });

      // 监听内部事件，当SW不存在时，由主线程处理
      window.addEventListener('sendLog', function(e) {
      });

      // 监听外部全局脚本的事件，用于日志上报
      window.addEventListener('logbeacon:log', function(e) {
        try {
          const { level, logs } = e.detail || {};
          if (!level || !Array.isArray(logs)) {
            console.warn('[logbeacon] Invalid logbeacon:log event format. Expected: { level: string, logs: array }');
            return;
          }

          // 验证 level 是否为有效的日志级别
          const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
          if (!validLevels.includes(level)) {
            console.warn(`[logbeacon] Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
            return;
          }

          // 获取日志上下文信息和序列化日志内容
          const extraInfo = getLogExtraInfo();
          const content = serializeLogContent(logs);
          
          // 构造日志 payload
          const payload = {
            level,
            content,
            ...extraInfo
          };

          // 发送到 Service Worker 或内部事件系统
          sendSWEvent({ type: 'log', payload });
        } catch (error) {
          console.error('[logbeacon] Error processing logbeacon:log event:', error);
        }
      });

      // 监听外部全局脚本：主动触发一次日志上报（与 visibility 中 sendSWEvent 投递方式一致）
      window.addEventListener('logbeacon:flush', function() {
        try {
          sendSWEvent({ type: 'flush-now' });
        } catch (error) {
          console.error('[logbeacon] Error processing logbeacon:flush event:', error);
        }
      });
    }
  }

  // 根据 DOM 加载状态来初始化
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSWBridge);
    } else {
      initSWBridge();
    }
  }
};

/** 作为 `<script type="module">` 入口加载时立即初始化（与原先 sls/loki/beacon.js 行为一致）。 */
generateLog();
