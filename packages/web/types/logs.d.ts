/**
 * 默认导出日志实例：分级 console、关键词过滤、可选上报；与 `@logbeacon/core/console-logger` 的 ConsoleLogger 行为一致，并附带 getOrCreateUUID。
 */
export interface EnhancedLogger {
  readonly levels: {
    readonly TRACE: 0;
    readonly DEBUG: 1;
    readonly INFO: 2;
    readonly WARN: 3;
    readonly ERROR: 4;
    readonly SILENT: 5;
  };
  getLevel(): number;
  setLevel(
    level:
      | 'trace'
      | 'debug'
      | 'info'
      | 'warn'
      | 'error'
      | 'silent'
      | number,
    persist?: boolean
  ): void;
  enableAll(): void;
  disableAll(): void;
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /**
   * 设置日志过滤关键词，以该关键词开头的日志将被过滤
   */
  setKeyWords(keyWords: string): void;
  /**
   * 获取当前设置的日志过滤关键词
   */
  getKeyWords(): string | null;
  /**
   * 获取/生成 uuid；若 window 不存在则返回空字符串
   */
  getOrCreateUUID(): string;
}

/** 默认日志实例在全局对象上的属性名（与 `packages/web/core/logs.js` 中一致） */
export declare const LOG_BEACON_GLOBAL_KEY: string;

declare const log: EnhancedLogger;

export default log;
