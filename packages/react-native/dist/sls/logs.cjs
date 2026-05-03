'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var reactNative = require('react-native');
var reactNativeQuickSqlite = require('react-native-quick-sqlite');

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
function generateRandomPrefix$1() {
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
function getOrCreateUUID() {
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
    sessionId = generateRandomPrefix$1();
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

/** 无浏览器特化时的空处理器表；直接调用 core 导出时请使用 `.call(defaultTypeHandlers, …)` 或与 web 包一样 `.bind(handlers)` */
const defaultTypeHandlers$1 = new Map();

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

const serializeSingleValue$1 = serializeSingleValue$2.bind(defaultTypeHandlers$1);
const serializeLogContent = serializeLogContent$1.bind(defaultTypeHandlers$1);

class Database {
  static _instance = null;
  static DB_NAME = "beacon-db";
  static getInstance() {
    if (!this._instance) {
      const db = reactNativeQuickSqlite.open({ name: Database.DB_NAME });
      db.execute("PRAGMA journal_mode = WAL;");
      db.execute("PRAGMA synchronous = NORMAL;");
      db.execute("PRAGMA temp_store = MEMORY;");
      this._instance = db;
    }
    return this._instance;
  }
}

const DB = Database.getInstance();

function assertValidKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new TypeError("localStorage key must be a non-empty string");
  }
}

function assertValidValue(value) {
  if (typeof value !== "string") {
    throw new TypeError("localStorage value must be a string");
  }
}

function getFirstRow(result) {
  if (!result?.rows) return null;
  if (Array.isArray(result.rows)) return result.rows[0] ?? null;
  if (Array.isArray(result.rows._array)) return result.rows._array[0] ?? null;
  if (typeof result.rows.item === "function" && result.rows.length > 0) {
    return result.rows.item(0);
  }
  return null;
}

class LocalStorage {
  /** @type {LocalStorage | null} */
  static _instance = null;
  /** @type {string} */
  static TABLE_NAME = "localStorage";
  constructor() {
    DB.execute(`
      CREATE TABLE IF NOT EXISTS ${LocalStorage.TABLE_NAME} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) WITHOUT ROWID;
    `);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    assertValidKey(key);
    assertValidValue(value);
    DB.execute(
      `
      INSERT INTO ${LocalStorage.TABLE_NAME}(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
      `,
      [key, value, Date.now()]
    );
  }

  /**
   * @param {string} key
   * @returns {string | null}
   */
  getItem(key) {
    assertValidKey(key);
    const result = DB.execute(`SELECT value FROM ${LocalStorage.TABLE_NAME} WHERE key = ? LIMIT 1;`, [key]);
    const row = getFirstRow(result);
    return row ? row.value : null;
  }

  /**
   * 获取全部键值对，返回对象形式：{ [key]: value }
   * @returns {Record<string, string>}
   */
  getAll() {
    const result = DB.execute(`SELECT key, value FROM ${LocalStorage.TABLE_NAME};`);
    const rows = Array.isArray(result?.rows) ? result.rows : (result?.rows?._array || []);
    const all = Object.create(null);
    for (const row of rows) {
      if (row && typeof row.key === "string" && typeof row.value === "string") {
        all[row.key] = row.value;
      }
    }
    return all;
  }

  /**
   * @param {string} key
   */
  removeItem(key) {
    assertValidKey(key);
    DB.execute(`DELETE FROM ${LocalStorage.TABLE_NAME} WHERE key = ?;`, [key]);
  }

  clear() {
    DB.execute(`DELETE FROM ${LocalStorage.TABLE_NAME};`);
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new LocalStorage();
    }
    return this._instance;
  }
}

const localStorage = LocalStorage.getInstance();

/**
 * @file 常量定义文件
 */

/**
 * 预先计算好的元数据键的 SHA-256 哈希值，用于在 IndexedDB 中作为键名，以增强隐私性。
 * @const {Object<string, string>}
 */
const META_KEYS$1 = {
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
const META_KEYS_WHITELIST = Object.freeze(Object.values(META_KEYS$1));

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

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0);
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
        var c = i, k = 9;
        while (--k)
            c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();
// CRC32
var crc = function () {
    var c = -1;
    return {
        p: function (d) {
            // closures have awful performance
            var cr = c;
            for (var i = 0; i < d.length; ++i)
                cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
            c = cr;
        },
        d: function () { return ~c; }
    };
};
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
// write bytes
var wbytes = function (d, b, v) {
    for (; v; ++b)
        d[b] = v, v >>>= 8;
};
// gzip header
var gzh = function (c, o) {
    var fn = o.filename;
    c[0] = 31, c[1] = 139, c[2] = 8, c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0, c[9] = 3; // assume Unix
    if (o.mtime != 0)
        wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1000));
    if (fn) {
        c[3] = 8;
        for (var i = 0; i <= fn.length; ++i)
            c[i + 10] = fn.charCodeAt(i);
    }
};
// gzip header length
var gzhl = function (o) { return 10 + (o.filename ? o.filename.length + 1 : 0); };
/**
 * Compresses data with GZIP
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
function gzipSync(data, opts) {
    if (!opts)
        opts = {};
    var c = crc(), l = data.length;
    c.p(data);
    var d = dopt(data, opts, gzhl(opts), 8), s = d.length;
    return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d;
}
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }

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
   * @returns {Promise<{size: number}>}
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
   * @returns {Promise<void>}
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

const DB_NAME = 'beacon-db';
const DB_VERSION = 1;

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
    this.lsInit(DB_NAME, DB_VERSION, [STORE_LOGS$1, STORE_DIGEST$1, STORE_META$1]);
  }

  // --- 日志 (b_dat) 操作 ---

  /**
   * 向数据库中添加一条日志记录。
   * @param {object} logData - 要存储的日志数据。
   * @returns {Promise<{size: number}>}
   */
  async insertLog(logData) {
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
   * @returns {Promise<void>}
   */
  async setDigest(digest, timestamp) {
    await this.lsPut(STORE_DIGEST$1, { digest, timestamp });
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
   * @returns {Promise<void>}
   */
  async setMeta(key, value) {
    await this.lsPut(STORE_META$1, value, key);
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
 * 日志处理器类
 * 负责单条日志的处理和存储，包括去重、元数据补充等
 */
class LogProcessor extends LogStore {
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
    this._lastUpdateTime = meta[META_KEYS$1.LAST_UPDATE_TIME];
    const now = Date.now();
    this.extendedMeta = Object.fromEntries(Object.entries(meta).filter(([key]) => !META_KEYS_WHITELIST.includes(key)));
    if (this._lastUpdateTime && isSameDay(this._lastUpdateTime, now)) {
      this._currentIp = meta[META_KEYS$1.IP];
      this._currentRegion = meta[META_KEYS$1.REGION];
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

    await this.setMeta(META_KEYS$1.LAST_UPDATE_TIME, now);
    await this.setMeta(META_KEYS$1.IP, this._currentIp);
    await this.setMeta(META_KEYS$1.REGION, this._currentRegion);

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
}

const SHIFT_LEFT_32$1 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32$1 = 1 / SHIFT_LEFT_32$1;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
const TEXT_DECODER_MIN_LENGTH$1 = 12;
const utf8TextDecoder$1 = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8');

const PBF_VARINT$1  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
const PBF_FIXED64$1 = 1; // 64-bit: double, fixed64, sfixed64
const PBF_BYTES$1   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
const PBF_FIXED32$1 = 5; // 32-bit: float, fixed32, sfixed32

let Pbf$1 = class Pbf {
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
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getUint32(this.pos + 4, true) * SHIFT_LEFT_32$1;
        this.pos += 8;
        return val;
    }

    readSFixed64() {
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getInt32(this.pos + 4, true) * SHIFT_LEFT_32$1;
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

        return readVarintRemainder$1(val, isSigned, this);
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

        if (end - pos >= TEXT_DECODER_MIN_LENGTH$1 && utf8TextDecoder$1) {
            // longer strings are fast with the built-in browser TextDecoder API
            return utf8TextDecoder$1.decode(this.buf.subarray(pos, end));
        }
        // short strings are fast with our custom implementation
        return readUtf8$1(this.buf, pos, end);
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
        return this.type === PBF_BYTES$1 ? this.readVarint() + this.pos : this.pos + 1;
    }

    /** @param {number} val */
    skip(val) {
        const type = val & 0x7;
        if (type === PBF_VARINT$1) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === PBF_BYTES$1) this.pos = this.readVarint() + this.pos;
        else if (type === PBF_FIXED32$1) this.pos += 4;
        else if (type === PBF_FIXED64$1) this.pos += 8;
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
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32$1), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeSFixed64(val) {
        this.realloc(8);
        this.dataView.setInt32(this.pos, val & -1, true);
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32$1), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeVarint(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint$1(val, this);
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
        this.pos = writeUtf8$1(this.buf, str, this.pos);
        const len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength$1(startPos, len, this);

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

        if (len >= 0x80) makeRoomForExtraLength$1(startPos, len, this);

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
        this.writeTag(tag, PBF_BYTES$1);
        this.writeRawMessage(fn, obj);
    }

    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedVarint$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSVarint$1, arr);
    }
    /**
     * @param {number} tag
     * @param {boolean[]} arr
     */
    writePackedBoolean(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedBoolean$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFloat(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFloat$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedDouble(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedDouble$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed32$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed32$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed64$1, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed64$1, arr);
    }

    /**
     * @param {number} tag
     * @param {Uint8Array} buffer
     */
    writeBytesField(tag, buffer) {
        this.writeTag(tag, PBF_BYTES$1);
        this.writeBytes(buffer);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32$1);
        this.writeFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32$1);
        this.writeSFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64$1);
        this.writeFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64$1);
        this.writeSFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT$1);
        this.writeVarint(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT$1);
        this.writeSVarint(val);
    }
    /**
     * @param {number} tag
     * @param {string} str
     */
    writeStringField(tag, str) {
        this.writeTag(tag, PBF_BYTES$1);
        this.writeString(str);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFloatField(tag, val) {
        this.writeTag(tag, PBF_FIXED32$1);
        this.writeFloat(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeDoubleField(tag, val) {
        this.writeTag(tag, PBF_FIXED64$1);
        this.writeDouble(val);
    }
    /**
     * @param {number} tag
     * @param {boolean} val
     */
    writeBooleanField(tag, val) {
        this.writeVarintField(tag, +val);
    }
};
/**
 * @param {number} l
 * @param {boolean | undefined} s
 * @param {Pbf} p
 */
function readVarintRemainder$1(l, s, p) {
    const buf = p.buf;
    let h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum$1(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

/**
 * @param {number} low
 * @param {number} high
 * @param {boolean} [isSigned]
 */
function toNum$1(low, high, isSigned) {
    return isSigned ? high * 0x100000000 + (low >>> 0) : ((high >>> 0) * 0x100000000) + (low >>> 0);
}

/**
 * @param {number} val
 * @param {Pbf} pbf
 */
function writeBigVarint$1(val, pbf) {
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

    if (val >= 0x10000000000000000 || val < -18446744073709552e3) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow$1(low, high, pbf);
    writeBigVarintHigh$1(high, pbf);
}

/**
 * @param {number} high
 * @param {number} low
 * @param {Pbf} pbf
 */
function writeBigVarintLow$1(low, high, pbf) {
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
function writeBigVarintHigh$1(high, pbf) {
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
function makeRoomForExtraLength$1(startPos, len, pbf) {
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
function writePackedVarint$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSVarint$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFloat$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedDouble$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);
}
/**
 * @param {boolean[]} arr
 * @param {Pbf} pbf
 */
function writePackedBoolean$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed32$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed32$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed64$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed64$1(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]);
}

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

/**
 * @param {Uint8Array} buf
 * @param {number} pos
 * @param {number} end
 */
function readUtf8$1(buf, pos, end) {
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
function writeUtf8$1(buf, str, pos) {
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

function writeLog(obj, pbf) {
    if (obj.Time) pbf.writeVarintField(1, obj.Time);
    if (obj.Contents) for (const item of obj.Contents) pbf.writeMessage(2, writeLogContent, item);
    if (obj.TimeNs) pbf.writeFixed32Field(4, obj.TimeNs);
}
function writeLogContent(obj, pbf) {
    if (obj.Key) pbf.writeStringField(1, obj.Key);
    if (obj.Value) pbf.writeStringField(2, obj.Value);
}
function writeLogTag(obj, pbf) {
    if (obj.Key) pbf.writeStringField(1, obj.Key);
    if (obj.Value) pbf.writeStringField(2, obj.Value);
}
function writeLogGroup(obj, pbf) {
    if (obj.Logs) for (const item of obj.Logs) pbf.writeMessage(1, writeLog, item);
    if (obj.Reserved) pbf.writeStringField(2, obj.Reserved);
    if (obj.Topic) pbf.writeStringField(3, obj.Topic);
    if (obj.Source) pbf.writeStringField(4, obj.Source);
    if (obj.LogTags) for (const item of obj.LogTags) pbf.writeMessage(6, writeLogTag, item);
}

/**
 * 将日志数组序列化为 protobuf 格式
 * @param {Array} logs - 日志数组
 * @param {string} ctxId - 日志上下文ID
 * @returns {Uint8Array|undefined} - 序列化后的二进制数据
 */
function logEncoder(logs, ctxId) {
  if (!Array.isArray(logs)) {
    throw new Error('logs must be array!')
  }

  const LogTags = [];
  
  if (ctxId) {
    LogTags.push({
      Key: "__pack_id__",
      Value: ctxId
    });
  }
  // 构建日志对象
  const payload = {
    Logs: logs.map(log => {
      const { time, ...rest } = log;
      
      // 展开 extendedAttributes 到顶层
      const flattened = { ...rest };
      if (rest.extendedAttributes && typeof rest.extendedAttributes === 'object') {
        Object.assign(flattened, rest.extendedAttributes);
        delete flattened.extendedAttributes;
      }
      if (rest.extendedMeta && typeof rest.extendedMeta === 'object') {
        Object.assign(flattened, rest.extendedMeta);
        delete flattened.extendedMeta;
      }

      // 创建日志内容
      const logPayload = {
        Time: Math.floor(time / 1000),
        Contents: Object.entries(flattened).reduce((acc, [Key, Value]) => {
          // 卫语句：Key 必须有效，Value 不能是 null 或 undefined
          if (!Key || Value === null || Value === undefined || Value === '') {
            return acc;
          }

          const finalValue = typeof Value === 'string' ? Value : JSON.stringify(Value);

          // 过滤转换后为空或纯空格的字符串
          if (!finalValue.trim()) {
            return acc;
          }

          acc.push({ Key, Value: finalValue });
          return acc;
        }, [])
      };
      
      return logPayload;
    }).filter(item => !!item?.Contents?.length && !!item?.Time),
    LogTags: LogTags
  };
  if (!payload.Logs?.length) return;
  console.log('格式化完成 payload', payload);
  // 创建并编码日志组
  const pbf = new Pbf$1();
  writeLogGroup(payload, pbf);
  return pbf.finish();
}

/**
 * 日志聚合器
 * 负责日志的缓存、处理和发送
 */


/**
 * @typedef {Object} LogItem
 * @property {number} time - 该日志发生的时间，毫秒级时间戳
 * @property {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @property {string} content - 日志内容
 * @property {string} clientUuid - 客户端唯一ID
 * @property {string} sessionId - 浏览器会话唯一ID，存储在sessionStorage中
 * @property {string} referrer - 当前页面的 referrer
 * @property {{width: number, height: number}} screen - 屏幕宽高
 * @property {{width: number, height: number}} window - 窗口宽高
 * @property {string} url - 当前页面url
 * @property {string} ip - 公网IP
 * @property {string} region - 公网IP所在地区
 * @property {Object.<string, string>} [extendedAttributes] - 外部扩展的基础属性，key-value均为字符串
 */

/**
 * 日志聚合器类
 * 继承自LogProcessor，负责日志的批量聚合、处理和发送
 */
let LogAggregator$1 = class LogAggregator extends LogProcessor {
  /**
   * 创建日志聚合器实例
   * @param {Object} options - 配置选项
   * @param {number} [options.flushInterval=300000] - 日志自动发送间隔（毫秒），默认5分钟
   * @param {number} [options.flushSize=3145728] - 日志缓冲区大小上限（字节），默认3MB
   * @param {number} [options.dedupInterval=3000] - 重复日志去重时间窗口（毫秒）
   */
  constructor(options = {}) {
    super(options);
    /**
     * 日志缓冲区，存储待发送的日志对象 null 说明是冷启动
     * @type {LogItem[]|null}
     * @private
     */
    this._logBuffer = null;
    
    /**
     * 当前缓冲区累计字节数
     * @type {number|null}
     * @private
     */
    this._logBufferBytes = null;
    
    /**
     * 日志自动发送间隔（毫秒）
     * @type {number}
     * @private
     */
    this._flushInterval = options.flushInterval || 5 * 60 * 1000; // 默认5分钟
    
    /**
     * 日志缓冲区大小上限（字节）
     * @type {number}
     * @private
     */
    this._flushSize = options.flushSize || 3 * 1024 * 1024; // 默认3MB

    /**
     * 日志上下文 - 用于标识日志批次，格式为 `${prefix}-${logGroupId}` 禁止直接使用
     * @type {string|null}
     * @private
     */
    this._logContext = null;

    /**
     * 日志上报接口地址
     * @type {string|null}
     * @private
     */
    this._beaconUrl = null;
  }
  
  /**
   * 获取 beaconUrl
   * @private
   * @returns {Promise<string>}
   */
  async _getBeaconUrl() {
    if (this._beaconUrl) {
      return this._beaconUrl;
    }
    const storedUrl = await this.getMeta(META_KEYS$1.BEACON_URL);
    if (storedUrl) {
      this._beaconUrl = storedUrl;
      return storedUrl;
    }
    return '/api/beacon'; // 默认地址
  }

  /**
   * 更新 beaconUrl 配置
   * @private
   * @param {string} url - 新的 beaconUrl
   * @returns {Promise<void>}
   */
  async _updateBeaconUrl(url) {
    if (!url) return;
    this._beaconUrl = url;
    await this.applyExtendedMetaIfChanged(META_KEYS$1.BEACON_URL, url);
  }

  /**
   * 生成日志上下文
   * @private
   * @returns {Promise<string>}
   */
  async _generateLogContext() {
    let logContext = this._logContext;
    let prefix = logContext?.split('-')?.[0];
    let logGroupId = logContext?.split('-')?.[1];
    if (logContext && prefix && logGroupId) {
      const newLogGroupId = parseInt(logGroupId, 16) + 1;
      this._logContext = `${prefix}-${newLogGroupId.toString(16).toUpperCase()}`;
      await this.setMeta(META_KEYS$1.LOG_CONTEXT, this._logContext);
      return this._logContext;
    }
    let [dbLogContext, lastUpdateTime] = await Promise.all([
      this.getMeta(META_KEYS$1.LOG_CONTEXT),
      this.getMeta(META_KEYS$1.LAST_UPDATE_TIME),
    ]);
    prefix = dbLogContext?.split('-')?.[0];
    logGroupId = dbLogContext?.split('-')?.[1];
    const now = Date.now();
    if (prefix && logGroupId && lastUpdateTime && isSameDay(lastUpdateTime, now)) {

      const newLogGroupId = parseInt(logGroupId, 16) + 1;
      this._logContext = `${prefix}-${newLogGroupId.toString(16).toUpperCase()}`;
      await this.setMeta(META_KEYS$1.LOG_CONTEXT, this._logContext);
      return this._logContext;
    }

    prefix = generateRandomPrefix();
    logGroupId = 1;
    this._logContext = `${prefix}-${logGroupId.toString(16).toUpperCase()}`;
    await this.setMeta(META_KEYS$1.LOG_CONTEXT, this._logContext);
    return this._logContext;
  }
  /**
   * 获取日志缓冲区
   * @private
   * @returns {Promise<LogItem[]>}
   */
  async _getLogBuffer() {
    if (this._logBuffer) {
      return this._logBuffer;
    }
    const {logs, logsBytes} = await this._loadAndDecodeLogsFromDB();
    this._logBuffer = logs;
    this._logBufferBytes = logsBytes;
    return this._logBuffer;
  }

  /**
   * 从DB加载并解码所有日志
   * @private
   * @returns {Promise<{logs: LogItem[], logsBytes: number}>}
   */
  async _loadAndDecodeLogsFromDB() {
    const logsBytes = await this.getAllLogsBytes();
    const logs = await this.getAllLogs();
    console.log('从DB加载并解码所有日志', logs, logsBytes);
    return {logs, logsBytes};
  }
  /**
   * 添加日志到缓冲区
   * @private
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<{logBufferBytes: number, log: LogItem}|null>}
   */
  async _addLogToBuffer(logItem) {
    const logBuffer = await this._getLogBuffer();
    const res = await this.insertLog(logItem);
    if (!res) return null;
    const {log, size} = res;
    logBuffer.push(log);
    
    this._logBufferBytes += size;
    return {
      logBufferBytes: this._logBufferBytes,
      log
    }
  }
  /**
   * 清空日志缓冲区 和 缓存区大小记录
   * @private
   * @returns {Promise<void>}
   */
  async _clearLogBuffer() {
    this._logBuffer = [];
    this._logBufferBytes = 0;
    await this.clearLogs();
  }

  /** 
   * 获取最早的一条日志
   * @returns {Promise<LogItem|null>} - 最早的一条日志，如果不存在则返回 null
   */
  async getFirstLog() {
    const logs = await this._getLogBuffer();
    return logs[0];
  }
  
  /**
   * 添加日志到缓冲区并检查是否触发发送
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<void>}
   */
  async addLog(logItem) {
    const added = await this._addLogToBuffer(logItem);
    if (!added) return; // 如果因为去重等原因未添加，则直接返回

    const firstLog = await this.getFirstLog();
    if (!firstLog) return; // 缓冲区为空，不处理

    // 满足条件时自动发送日志
    if (added.logBufferBytes >= this._flushSize) {
      await this.flushLogs();
    } else if (Date.now() - firstLog.time > this._flushInterval) {
      // 未满足大小条件但超时
      await this.flushLogs();
    }
  }
  
  /**
   * 压缩并发送日志
   * @returns {Promise<void>}
   */
  async flushLogs() {
    const {logs: logBuffer} = await this._loadAndDecodeLogsFromDB();
    if (!logBuffer || logBuffer.length === 0) return;
    const ctxId = await this?._generateLogContext?.();
    console.log('ctxId', ctxId, logBuffer);
    const payload = logEncoder(logBuffer, ctxId);
    if (!payload) return;
    const body = this._compressLogs(payload);
    const beaconUrl = await this._getBeaconUrl();
    try {
      await fetch(beaconUrl, {
        method: 'POST',
        body,
      });
      await this.reset();
    } catch (e) {
      console.error('flushLogs error', e);
    }
  }
  
  /**
   * 压缩日志数据
   * @private
   * @param {Uint8Array} payload - 要压缩的日志数据
   * @returns {Uint8Array} 压缩后的数据
   */
  _compressLogs(payload) {
    const body = gzipSync(payload);
    return body;
  }
  
  /**
   * 重置日志聚合器状态
   */
  async reset() {
    await this._clearLogBuffer();
    await this._clearLogDigestCache();
  }
  
  /**
   * 分类处理事件
   * @param {Object} event - 事件对象
   * @param {"log"|"page-load"|"page-visible"|"page-unload"|"page-hidden"|"flush-now"} event.type - 事件类型；flush-now 表示强制上报或外部主动要求立即上报
   * @param {any} event.payload - 事件负载
   */
  

  async handleEvent(event) {
    switch (event.type) {
      case 'log':
        await this.addLog(event.payload);
        break;
      case 'config-update':
        if (event.payload && event.payload.beaconUrl) {
          await this._updateBeaconUrl(event.payload.beaconUrl);
        }
        break;
      case 'page-load':
      case 'page-visible':
        break;
      case 'page-unload':
      case 'page-hidden':
      case 'flush-now':
        await this.flushLogs();
        break;
    }
  }
};

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
    return pbf.readFields(readLogItemField, {time: 0, level: "", content: "", clientUuid: "", userAgent: "", screen: "", window: "", url: "", ip: "", region: "", referrer: "", sessionId: "", extendedAttributes: {}, extendedMeta: {}}, end);
}
function readLogItemField(tag, obj, pbf) {
    if (tag === 1) obj.time = pbf.readVarint(true);
    else if (tag === 2) obj.level = pbf.readString();
    else if (tag === 3) obj.content = pbf.readString();
    else if (tag === 4) obj.clientUuid = pbf.readString();
    else if (tag === 5) obj.userAgent = pbf.readString();
    else if (tag === 6) obj.screen = pbf.readString();
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
    if (obj.userAgent) pbf.writeStringField(5, obj.userAgent);
    if (obj.screen) pbf.writeStringField(6, obj.screen);
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


// 定义对象存储区的名称
const STORE_LOGS = 'b_dat';
const STORE_DIGEST = 'digestCache';
const STORE_META = 'meta';

/** @param {unknown} result */
function sqliteFirstRow(result) {
  if (!result?.rows) return null;
  if (Array.isArray(result.rows)) return result.rows[0] ?? null;
  if (Array.isArray(result.rows._array)) return result.rows._array[0] ?? null;
  if (typeof result.rows.item === "function" && result.rows.length > 0) {
    return result.rows.item(0);
  }
  return null;
}

/** @param {unknown} result */
function sqliteAllRows(result) {
  if (!result?.rows) return [];
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.rows._array)) return result.rows._array;
  if (
    typeof result.rows.length === "number" &&
    typeof result.rows.item === "function"
  ) {
    const list = [];
    for (let i = 0; i < result.rows.length; i += 1) {
      list.push(result.rows.item(i));
    }
    return list;
  }
  return [];
}

const MixinLogStore = (BaseClass) => {
  /**
   * LogStore — RN 侧通过 `react-native-quick-sqlite`（`../db/database.js`）持久化日志与元数据。
   * 摘要去重窗口仅 2～3s（见 LogProcessor），Web 上因 SW 可能被回收才持久化 digest；RN 用 `_digestMemoryCache`（内存 Map），不建 digestCache 表。
   * `b_dat` / `meta` 走 SQLite；digest 走 `_digestMemoryCache`。与 core `ls*` 契约对齐。
   */
  return class extends BaseClass {
    constructor(...args) {
      super(...args);
      /**
       * 摘要 → 时间戳（仅内存，与 `setDigest` / `getAllDigests` / `clearOldDigests` 对齐）。
       * @type {Map<string, number>}
       * @private
       */
      this._digestMemoryCache = new Map();
      this._initRuntimeExtendedMeta();
    }

    /**
     * 初始化运行期扩展元数据（仅设置一次）。
     * 通过 `applyExtendedMetaIfChanged` 进行增量写入，不阻塞构造流程。
     * @private
     */
    _initRuntimeExtendedMeta() {
      if (typeof this.applyExtendedMetaIfChanged !== "function") return;
      const os_info = JSON.stringify(serializeSingleValue$1({
        platform: reactNative.Platform.OS,
        osVersion: reactNative.Platform.Version,
        fontScale: reactNative.PixelRatio.getFontScale(),
        pixelRatio: reactNative.PixelRatio.get(),
      }));
      this.applyExtendedMetaIfChanged("os_info", os_info);
    }

    /**
     * 初始化 SQLite 表结构（与 `../db/database.js` 共用同一 DB 文件）。
     * - `b_dat`：高频追加、`value` 为 BLOB（protobuf）；上报时整表读出后清空，仅主键自增即可，无需额外索引。（若本地已是旧版 TEXT 表，需迁移或清库后重建。）
     * - `meta`：key/value 皆为 TEXT，读写频率一般，WITHOUT ROWID 适合小 KV。
     * - digestCache：RN 不建表，短窗口去重在内存处理即可。
     */
    lsInit(dbName, dbVersion, storeNames) {

      DB.execute(`
        CREATE TABLE IF NOT EXISTS ${STORE_LOGS} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value BLOB NOT NULL
        );
      `);

      DB.execute(`
        CREATE TABLE IF NOT EXISTS ${STORE_META} (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        ) WITHOUT ROWID;
      `);
    }

    /**
     * 累加各条 `value` 负载字节数（与 Web 侧游标累加语义一致；不含 SQLite 页/索引开销）。
     * 日志表 `value` 为 BLOB，`LENGTH(value)` 即为字节长度，可用聚合一次算出。
     * @param {string} storeName
     * @returns {Promise<number>}
     */
    async lsGetStoreSize(storeName) {
      if (storeName === STORE_LOGS) {
        const result = DB.execute(
          `SELECT COALESCE(SUM(LENGTH(value)), 0) AS total FROM ${STORE_LOGS};`,
        );
        const row = sqliteFirstRow(result);
        const raw = row != null ? (row.total ?? row.TOTAL) : undefined;
        const n = raw !== undefined ? Number(raw) : 0;
        return Number.isFinite(n) ? n : 0;
      }
      throw new Error(
        `${this.constructor.name}.lsGetStoreSize: unsupported store ${storeName}`,
      );
    }

    // --- 日志 (b_dat) 操作 ---

    /**
     * 向数据库中添加一条日志记录。
     * @param {object} logData - 要存储的日志数据。
     * @returns {Promise<{ size: number }>}
     */
    async lsAdd(storeName, value) {
      if (storeName === STORE_LOGS) {
        const blob = this.encodeLog(value);
        DB.execute(`INSERT INTO ${STORE_LOGS} (value) VALUES (?);`, [blob]);
        return {
          size: blob.byteLength,
        };
      }
      throw new Error(
        `${this.constructor.name}.lsAdd: unsupported store ${storeName}`,
      );
    }

    /**
     * 获取数据库中所有的日志记录。
     * @returns {Promise<object[]>} 解析为所有日志记录数组的 Promise。
     */
    async lsGetAll(storeName) {
      if (storeName === STORE_DIGEST) {
        return Array.from(this._digestMemoryCache, ([digest, timestamp]) => ({
          digest,
          timestamp,
        }));
      }
      if (storeName === STORE_META) {
        const result = DB.execute(`SELECT key, value FROM ${STORE_META};`);
        const rows = sqliteAllRows(result);
        const allMeta = Object.create(null);
        for (const row of rows) {
          if (row && typeof row.key === "string" && row.value != null) {
            allMeta[row.key] = String(row.value);
          }
        }
        return allMeta;
      }
      if (storeName === STORE_LOGS) {
        const result = DB.execute(
          `SELECT id, value FROM ${STORE_LOGS} ORDER BY id ASC;`,
        );
        const rows = sqliteAllRows(result);
        const logs = [];
        for (const row of rows) {
          if (row?.value != null) {
            logs.push(this.decodeLog(row));
          }
        }
        return logs;
      }
      throw new Error(
        `${this.constructor.name}.lsGetAll: unsupported store ${storeName}`,
      );
    }

    /**
     * 从数据库中删除所有日志记录。
     * @returns {Promise<void>}
     */
    async lsClear(storeName) {
      if (storeName === STORE_LOGS) {
        DB.execute(`DELETE FROM ${STORE_LOGS};`);
        return;
      }
      throw new Error(
        `${this.constructor.name}.lsClear: unsupported store ${storeName}`,
      );
    }

    // --- 摘要 (digestCache) 操作 ---

    /**
     * 在数据库中设置或更新一个日志摘要及其时间戳。
     * @param {string} digest - 日志内容的摘要字符串。
     * @param {number} timestamp - 日志的时间戳。
     * @returns {Promise<void>}
     */
    async lsPut(storeName, value, key) {
      if (storeName === STORE_META) {
        if (typeof key !== "string" || key.length === 0) {
          throw new TypeError(
            `${this.constructor.name}.lsPut(META): key must be a non-empty string`,
          );
        }
        DB.execute(
          `
          INSERT INTO ${STORE_META} (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value;
          `,
          [key, String(value)],
        );
        return;
      }
      if (storeName === STORE_DIGEST) {
        const digest = value?.digest;
        const timestamp = value?.timestamp;
        if (typeof digest === "string" && Number.isFinite(timestamp)) {
          this._digestMemoryCache.set(digest, timestamp);
        }
        return;
      }
      throw new Error(
        `${this.constructor.name}.lsPut: unsupported store ${storeName}`,
      );
    }

    /**
     * 从数据库中获取一个元数据值。
     * @param {string} key - 要获取的元数据的键。
     * @returns {Promise<any | null>} 解析为解码后的元数据值的 Promise，如果不存在则为 null。
     */
    async lsGet(storeName, key) {
      if (storeName === STORE_META) {
        const result = DB.execute(
          `SELECT value FROM ${STORE_META} WHERE key = ? LIMIT 1;`,
          [key],
        );
        const row = sqliteFirstRow(result);
        return row?.value != null ? String(row.value) : null;
      }
      throw new Error(
        `${this.constructor.name}.lsGet: unsupported store ${storeName}`,
      );
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
      for (const d of [...this._digestMemoryCache.keys()]) {
        const ts = this._digestMemoryCache.get(d);
        if (ts !== undefined && ts <= lte) {
          this._digestMemoryCache.delete(d);
        }
      }
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
     * 解码日志（原始字节或 SQLite 行 `{ id, value }` / IndexedDB 存下的单行结构）。
     * @param {Uint8Array | ArrayBuffer | { value?: BufferSource }} log
     * @returns {LogItem}
     */
    decodeLog(log) {
      let bytes = log;
      if (log != null && typeof log === 'object') {
        const isBinary =
          log instanceof ArrayBuffer || ArrayBuffer.isView(log);
        if (!isBinary) {
          const v = log.value;
          if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
            bytes = v;
          }
        }
      }
      const pbf = new Pbf(bytes);
      return readLogItem(pbf);
    }
  }
};

/** 打包时由 Rollup `resolveId` 解析到 `@logbeacon/core/LogAggregator-sls` 或 `LogAggregator-loki`（视构建变体而定）。 */

const LogAggregator = MixinLogStore(LogAggregator$1);

let taskChain = Promise.resolve();
/** @type {LogAggregator | null} */
let aggregator = null;

function getAggregator() {
  if (!aggregator) {
    aggregator = new LogAggregator({
      flushInterval: 5 * 60 * 1000,
      flushSize: 3 * 1024 * 1024,
    });
  }
  return aggregator;
}

/**
 * 将消息放入串行任务链，保证日志按投递顺序处理。
 * @param {{ type: string, payload?: any }} message
 * @returns {Promise<void>}
 */
function enqueueMessage(message) {
  const run = async () => {
    if (!message || typeof message !== "object") return;
    await getAggregator().handleEvent(message);
  };
  taskChain = taskChain.then(run, run);
  return taskChain.catch((error) => {
    console.error("[logbeacon] enqueue message failed:", error);
  });
}

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

const genReadableUUID = () => {
  let uuid;
  return () => {
    if (uuid) return uuid;
    const getOrCreateUUID$1 = getOrCreateUUID.bind(localStorage);
    uuid = getOrCreateUUID$1();
    return uuid;
  }
};

const readClientUUID = genReadableUUID();

/**
 * @returns {RNLogExtraInfo}
 */
function getLogExtraInfo() {
  const extraInfo = getLogExtraInfo$1();
  const { width, height } = reactNative.Dimensions.get("window");
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
function sendLog(level, logs) {
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

let listenerRegistered = false;
let currentAppState = reactNative.AppState.currentState || "active";

/**
 * 注册 RN 生命周期监听（幂等，只注册一次）。
 * - 启动时投递 page-load
 * - active -> 非 active：投递 page-hidden（触发 flush）
 * - 非 active -> active：投递 page-visible
 */
function setupLifecycleListeners() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  enqueueMessage({ type: "page-load" });

  reactNative.AppState.addEventListener("change", (nextAppState) => {
    const prev = currentAppState;
    currentAppState = nextAppState;

    if (prev !== "active" && nextAppState === "active") {
      enqueueMessage({ type: "page-visible" });
      return;
    }

    if (prev === "active" && (nextAppState === "inactive" || nextAppState === "background")) {
      enqueueMessage({ type: "page-hidden" });
    }
  });
}

/**
 * 指定日志上报接口地址（与 Web `data-beacon-url` 触发的 `config-update` 一致）。
 * @param {string} beaconUrl
 * @returns {Promise<void>}
 */
function setBeaconUrl(beaconUrl) {
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

exports.default = log;
exports.setBeaconUrl = setBeaconUrl;
//# sourceMappingURL=logs.cjs.map
