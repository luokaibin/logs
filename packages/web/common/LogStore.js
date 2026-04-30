import { openDB } from 'idb';
import { utf8Bytes } from "@logbeacon/core/utils"
import Pbf from 'pbf';
import {writeLogItem, readLogItem} from './log.proto.js';
import {
  STORE_LOGS,
  STORE_DIGEST,
  STORE_META,
  DB_NAME,
  DB_VERSION,
} from "@logbeacon/core/LogStore";


export const MixinLogStore = (BaseClass) => {
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
      return utf8Bytes(data);
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