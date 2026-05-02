import {LogStorageBase} from "./LogStorageBase.js";

export const DB_NAME = 'beacon-db';
export const DB_VERSION = 1;

// 定义对象存储区的名称
export const STORE_LOGS = 'b_dat';
export const STORE_DIGEST = 'digestCache';
export const STORE_META = 'meta';

/**
 * LogStore — 面向「日志 / digest / meta」的领域 API，通过 {@link LogStorageBase} 的 `ls*` 钩子由平台层实现持久化。
 * 本类不绑定具体存储引擎；浏览器实现见 `logbeacon` 包中的 `MixinLogStore`。
 */
export class LogStore extends LogStorageBase {

  constructor() {
    super();
    this.lsInit(DB_NAME, DB_VERSION, [STORE_LOGS, STORE_DIGEST, STORE_META]);
  }

  // --- 日志 (b_dat) 操作 ---

  /**
   * 向数据库中添加一条日志记录。
   * @param {object} logData - 要存储的日志数据。
   * @returns {Promise<{key: StorageKey, size: number}>} 解析为新日志记录ID的 Promise。
   */
  async insertLog(logData) {
    // 注意：IndexedDB add/put 的返回值是 key
    return this.lsAdd(STORE_LOGS, logData);
  }

  /**
   * 获取数据库中所有的日志记录。
   * @returns {Promise<object[]>} 解析为所有日志记录数组的 Promise。
   */
  async getAllLogs() {
    return this.lsGetAll(STORE_LOGS);
  }

  /**
   * 获取数据库中所有的日志记录字节数。
   * @returns {Promise<number>} 解析为所有日志记录字节数的 Promise。
   */
  async getAllLogsBytes() {
    return this.lsGetStoreSize(STORE_LOGS);
  }

  /**
   * 从数据库中删除所有日志记录。
   * @returns {Promise<void>}
   */
  async clearLogs() {
    await this.lsClear(STORE_LOGS);
  }

  // --- 摘要 (digestCache) 操作 ---

  /**
   * 在数据库中设置或更新一个日志摘要及其时间戳。
   * @param {string} digest - 日志内容的摘要字符串。
   * @param {number} timestamp - 日志的时间戳。
   * @returns {Promise<string>} 解析为摘要键的 Promise。
   */
  async setDigest(digest, timestamp) {
    return this.lsPut(STORE_DIGEST, { digest, timestamp });
  }

  /**
   * 获取数据库中所有的摘要记录。
   * @returns {Promise<object[]>} 解析为所有摘要记录数组的 Promise。
   */
  async getAllDigests() {
    return this.lsGetAll(STORE_DIGEST);
  }

  /**
   * 从数据库中删除所有早于指定时间戳的旧摘要。
   * @param {number} maxAgeTimestamp - 用于判断摘要是否过期的最大时间戳。
   * @returns {Promise<void>}
   */
  async clearOldDigests(maxAgeTimestamp) {
    await this.lsDeleteMany(STORE_DIGEST, { timestamp: { $lte: maxAgeTimestamp } });
  }

  // --- 元数据 (meta) 操作 ---

  /**
   * 在数据库中设置或更新一个元数据键值对。
   * @param {string} key - 元数据的键。
   * @param {*} value - 要存储的元数据值（将被编码为二进制）。
   * @returns {Promise<string>} 解析为元数据键的 Promise。
   */
  async setMeta(key, value) {
    return this.lsPut(STORE_META, value, key);
  }

  /**
   * 从数据库中获取一个元数据值。
   * @param {string} key - 要获取的元数据的键。
   * @returns {Promise<any | null>} 解析为解码后的元数据值的 Promise，如果不存在则为 null。
   */
  async getMeta(key) {
    return this.lsGet(STORE_META, key);
  }

  /**
   * 获取数据库中所有的元数据记录。
   * @returns {Promise<Record<string, string|number>>} 解析为所有元数据记录数组的 Promise。
   */
  async getAllMeta() {
    return this.lsGetAll(STORE_META);
  }
}
