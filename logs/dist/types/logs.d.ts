import type { Logger } from 'loglevel';

/**
 * 扩展的日志对象接口，在标准 loglevel 基础上添加了关键词过滤功能
 */
export interface EnhancedLogger extends Logger {
  /**
   * 设置日志过滤关键词，以该关键词开头的日志将被过滤
   * @param keyWords 过滤关键词
   */
  setKeyWords(keyWords: string): void;
  
  /**
   * 获取当前设置的日志过滤关键词
   * @returns 当前设置的过滤关键词，如果未设置则返回 null
   */
  getKeyWords(): string | null;
}

/**
 * 增强版日志对象，扩展了 loglevel 并添加了过滤和转发功能
 */
declare const log: EnhancedLogger;

export default log;
