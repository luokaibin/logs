import { openDB } from 'idb';

const DB_NAME = 'beacon-db';
const DB_VERSION = 2;

// 定义对象存储区的名称
const STORE_LOGS = 'b_dat';
const STORE_DIGEST = 'digestCache';
const STORE_META = 'meta';

/**
 * LogStore - 一个用于管理 IndexedDB 中日志持久化的基类。
 * 它处理数据库初始化、模式升级，并为日志、摘要和元数据
 * 提供原子化的 CRUD 操作方法。
 */
export class LogStore {
  /**
   * @private
   * @type {Promise<import('idb').IDBPDatabase> | null}
   */
  _dbPromise = null;

  constructor() {
    this._initDB();
  }

  /**
   * 初始化 IndexedDB 数据库连接和模式。
   * @private
   */
  _initDB() {
    this._dbPromise = openDB(DB_NAME, DB_VERSION, {
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
      this._initDB();
    }
    return this._dbPromise;
  }

  /**
   * 将数据编码为用于二进制存储的 Uint8Array。
   * @private
   * @param {string} data - 要编码的数据。
   * @returns {Uint8Array} 编码后的二进制数据。
   */
  _encode(data) {
    return new TextEncoder().encode(data);
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
  async insertLog(logData) {
    const db = await this._getDB();
    // 注意：IndexedDB add/put 的返回值是 key
    return db.add(STORE_LOGS, logData);
  }

  /**
   * 获取数据库中所有的日志记录。
   * @returns {Promise<object[]>} 解析为所有日志记录数组的 Promise。
   */
  async getAllLogs() {
    const db = await this._getDB();
    return db.getAll(STORE_LOGS);
  }

  /**
   * 从数据库中删除所有日志记录。
   * @returns {Promise<void>}
   */
  async clearLogs() {
    const db = await this._getDB();
    await db.clear(STORE_LOGS);
  }

  // --- 摘要 (digestCache) 操作 ---

  /**
   * 在数据库中设置或更新一个日志摘要及其时间戳。
   * @param {string} digest - 日志内容的摘要字符串。
   * @param {number} timestamp - 日志的时间戳。
   * @returns {Promise<string>} 解析为摘要键的 Promise。
   */
  async setDigest(digest, timestamp) {
    const db = await this._getDB();
    return db.put(STORE_DIGEST, { digest, timestamp });
  }

  /**
   * 获取数据库中所有的摘要记录。
   * @returns {Promise<object[]>} 解析为所有摘要记录数组的 Promise。
   */
  async getAllDigests() {
    const db = await this._getDB();
    return db.getAll(STORE_DIGEST);
  }

  /**
   * 从数据库中删除所有早于指定时间戳的旧摘要。
   * @param {number} maxAgeTimestamp - 用于判断摘要是否过期的最大时间戳。
   * @returns {Promise<void>}
   */
  async clearOldDigests(maxAgeTimestamp) {
    const db = await this._getDB();
    const tx = db.transaction(STORE_DIGEST, 'readwrite');
    const index = tx.store.index('by_timestamp');
    let cursor = await index.openCursor(IDBKeyRange.upperBound(maxAgeTimestamp));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // --- 元数据 (meta) 操作 ---

  /**
   * 在数据库中设置或更新一个元数据键值对。
   * @param {string} key - 元数据的键。
   * @param {*} value - 要存储的元数据值（将被编码为二进制）。
   * @returns {Promise<string>} 解析为元数据键的 Promise。
   */
  async setMeta(key, value) {
    const db = await this._getDB();
    const encodedValue = this._encode(value);
    return db.put(STORE_META, encodedValue, key);
  }

  /**
   * 从数据库中获取一个元数据值。
   * @param {string} key - 要获取的元数据的键。
   * @returns {Promise<any | null>} 解析为解码后的元数据值的 Promise，如果不存在则为 null。
   */
  async getMeta(key) {
    const db = await this._getDB();
    const encodedValue = await db.get(STORE_META, key);
    return this._decode(encodedValue);
  }

  /**
   * 获取数据库中所有的元数据记录。
   * @returns {Promise<Record<string, string|number>>} 解析为所有元数据记录数组的 Promise。
   */
  async getAllMeta() {
    const db = await this._getDB();
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

  /**
   * 从 IndexedDB 中恢复所有状态，用于 Service Worker 冷启动。
   * @returns {Promise<{logs: object[], digests: object[], deviceInfo: object|null, logContext: object|null}>} 一个包含所有已恢复状态的对象。
   */
  async hydrateState() {
    const [logs, digests, deviceInfo, logContext] = await Promise.all([
      this.getAllLogs(),
      this.getAllDigests(),
      this.getMeta('deviceInfo'),
      this.getMeta('logContext'),
    ]);

    return { logs, digests, deviceInfo, logContext };
  }
}
