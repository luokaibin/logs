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
export class ConsoleLogger {
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
