/** 与历史 loglevel 数值一致，便于兼容 localStorage */
const LEVELS = Object.freeze({
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  SILENT: 5,
});

const LEVEL_NAMES = ["trace", "log", "info", "warn", "error", "silent"];

const DEFAULT_LEVEL_KEY = "loglevel";
const DEFAULT_KEYWORDS_KEY = "_logFilterKeyWords";

/**
 * 基于 console 的分级日志；level / 关键词的持久化通过外部传入的 storage 完成。
 *
 * @typedef {{ setItem(key: string, value: string): void, getItem(key: string): string | null }} LogStorage
 */
class ConsoleLogger {
  static LEVELS = LEVELS;
  static DEFAULT_LEVEL_KEY = DEFAULT_LEVEL_KEY;
  static DEFAULT_KEYWORDS_KEY = DEFAULT_KEYWORDS_KEY;

  /**
   * @param {{
   *   storage: LogStorage,
   *   forwardLog?: (level: string, args: unknown[]) => void,
   * }} options
   */
  constructor(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("ConsoleLogger requires an options object");
    }
    const { storage, forwardLog } = options;
    if (!storage || typeof storage !== "object") {
      throw new TypeError("ConsoleLogger requires options.storage");
    }
    if (typeof storage.setItem !== "function" || typeof storage.getItem !== "function") {
      throw new TypeError(
        "storage must implement setItem(key: string, value: string) and getItem(key: string)"
      );
    }
    /** @type {LogStorage} */
    this._storage = storage;
    this._forwardLog = typeof forwardLog === "function" ? forwardLog : null;
    this._boundConsole = this._createBoundConsoleMap();
    this._noop = () => {};

    this._currentLevel;
    this._keywords;

    this.trace = this._noop;
    this.debug = this._noop;
    this.info = this._noop;
    this.warn = this._noop;
    this.error = this._noop;
    this._rebuildMethods();
  }

  _getLevel() {
    if (typeof this._currentLevel === "number" && this._currentLevel >= 0 && this._currentLevel <= LEVELS.SILENT) {
      return this._currentLevel;
    }
    const raw = this._storage.getItem(ConsoleLogger.DEFAULT_LEVEL_KEY);
    if (raw == null || String(raw).trim() === "") {
      this._currentLevel = LEVELS.WARN;
      return this._currentLevel;
    }
    const n = Number(String(raw).trim());
    if (
      !Number.isInteger(n) ||
      n < LEVELS.TRACE ||
      n > LEVELS.SILENT
    ) {
      this._currentLevel = LEVELS.WARN;
      return this._currentLevel;
    }
    this._currentLevel = n;
    return this._currentLevel;
  }

  /**
   * @param {"TRACE"|"DEBUG"|"INFO"|"WARN"|"ERROR"|"SILENT"} level
   */
  setLevel(level) {
    if(LEVELS[level] === undefined) return;
    this._currentLevel = LEVELS[level];
    this._storage.setItem(ConsoleLogger.DEFAULT_LEVEL_KEY, this._currentLevel);
    this._rebuildMethods();
  }

  setKeyWords(keyWords) {
    if (typeof keyWords !== "string") return;
    this._keywords = keyWords;
    this._storage.setItem(ConsoleLogger.DEFAULT_KEYWORDS_KEY, this._keywords);
  }

  getKeyWords() {
    if (typeof this._keywords === "string") return this._keywords;
    this._keywords = this._storage.getItem(ConsoleLogger.DEFAULT_KEYWORDS_KEY);
    return this._keywords;
  }

  _shouldLog(methodName) {
    const idx = LEVEL_NAMES.indexOf(methodName);
    if (idx === -1) return true;
    return idx >= this._getLevel();
  }

  _createBoundConsoleMap() {
    const c = typeof console !== "undefined" ? console : null;
    if (!c) {
      return Object.freeze({
        trace: null,
        log: null,
        info: null,
        warn: null,
        error: null,
      });
    }
    const bind = (name, fallbackName) => {
      const candidate = c[name] || c[fallbackName];
      return typeof candidate === "function" ? candidate.bind(c) : null;
    };
    return Object.freeze({
      trace: bind("trace", "log"),
      log: bind("debug", "log"),
      info: bind("info", "log"),
      warn: bind("warn", "log"),
      error: bind("error", "log"),
    });
  }

  _rebuildMethods() {
    this.trace = this._shouldLog("trace") ? (...args) => this._emit("trace", args) : this._noop;
    this.debug = this._shouldLog("log") ? (...args) => this._emit("log", args) : this._noop;
    this.info = this._shouldLog("info") ? (...args) => this._emit("info", args) : this._noop;
    this.warn = this._shouldLog("warn") ? (...args) => this._emit("warn", args) : this._noop;
    this.error = this._shouldLog("error") ? (...args) => this._emit("error", args) : this._noop;
  }

  /**
   * @param {"trace"|"debug"|"info"|"warn"|"error"} fnName
   * @param {unknown[]} args
   */
  _emit(fnName, args) {
    const bound = this._boundConsole[fnName];
    if (typeof bound !== "function") return;
    if (this._forwardLog) {
      this._forwardLog(fnName === "log" ? "debug" : fnName, args);
    }
    if (typeof args[0] !== "string") {
      bound(...args);
      return;
    }
    const keyWords = this.getKeyWords();
    if (!keyWords) {
      bound(...args);
      return;
    }
    if (!String(args[0]).startsWith(keyWords)) return;
    bound(...args);
  }
}

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
function serializeSingleValue$1(
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
      obj[keyStr] = serializeSingleValue$1.call(this, v, options, currentDepth + 1, seen);
    }
    return obj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    const arr = [];
    for (const v of value.values()) {
      arr.push(serializeSingleValue$1.call(this, v, options, currentDepth + 1, seen));
    }
    return arr;
  }

  // 处理数组 (包括采样逻辑)
  if (Array.isArray(value)) {
    const isComplex = value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
    const rules = isComplex ? ARRAY_SAMPLING_CONFIG.complex : ARRAY_SAMPLING_CONFIG.primitive;

    // 卫语句：如果未达到采样阈值，则正常处理并提前返回
    if (value.length <= rules.threshold) {
      return value.map(item => serializeSingleValue$1.call(this, item, options, currentDepth + 1, seen));
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
      sampledResult._e[index] = serializeSingleValue$1.call(this, value[index], options, currentDepth + 1, seen);
    }

    return sampledResult;
  }

  // 处理普通对象
  if (typeof value === 'object' && value !== null) {
     // 检查是否有自定义的 toJSON 方法
    if (typeof value.toJSON === 'function') {
      return serializeSingleValue$1.call(this, value.toJSON(), options, currentDepth + 1, seen);
    }

    const result = {};
    for (const key of Object.keys(value)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        result[key] = '[敏感信息已过滤]';
      } else {
        result[key] = serializeSingleValue$1.call(this, value[key], options, currentDepth + 1, seen);
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
  const serializableObject = serializeSingleValue$1.call(this, content);

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
    error: serializeSingleValue(value.error, options, currentDepth + 1, seen),
  }));

  // PromiseRejectionEvent 处理器
  browserTypeHandlers.set(window.PromiseRejectionEvent, (value, options, currentDepth, seen) => ({
    _t: 'PromiseRejectionEvent',
    reason: serializeSingleValue(value.reason, options, currentDepth + 1, seen),
  }));

  // MessageEvent 处理器
  browserTypeHandlers.set(window.MessageEvent, (value, options, currentDepth, seen) => ({
    _t: 'MessageEvent',
    data: serializeSingleValue(value.data, options, currentDepth + 1, seen),
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
    detail: serializeSingleValue(value.detail, options, currentDepth + 1, seen),
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

const serializeSingleValue = serializeSingleValue$1.bind(browserTypeHandlers);
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

/**
 * 通过 Service Worker 或页面 `CustomEvent` 转发日志消息
 * @param {{ type: string, payload: Object }} msg - 例如 `{ type: 'log', payload: { level, content, ...getLogExtraInfo() } }`
 */
async function sendEvent(msg) {
  try {
    // 获取指定作用域的 Service Worker
    const serviceWorker = await getServiceWorker('/beacon/');
    if (!serviceWorker) {
      const event = new CustomEvent('sendLog', {
        detail: msg
      });
      window.dispatchEvent(event);
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
async function sendLog(level, logs) {
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
Object.freeze(Object.values(META_KEYS));

/** 挂载到全局对象上的属性名，可通过 globalThis[LOG_BEACON_GLOBAL_KEY] 访问 */
const LOG_BEACON_GLOBAL_KEY = "LogBeacon";

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

export { log as default };
//# sourceMappingURL=logs.js.map
