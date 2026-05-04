import Pbf from 'pbf';
import { PixelRatio, Platform } from "react-native";
import { DB } from "../db/database.js";
import {writeLogItem, readLogItem} from './log.proto.js';
import { serializeSingleValue } from "./serializeLogContent.js";
import {
  STORE_LOGS,
  STORE_DIGEST,
  STORE_META,
} from "@logbeacon/core/LogStore";

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

export const MixinLogStore = (BaseClass) => {
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
      const os_info = JSON.stringify(serializeSingleValue({
        platform: Platform.OS,
        osVersion: Platform.Version,
        fontScale: PixelRatio.getFontScale(),
        pixelRatio: PixelRatio.get(),
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
      void dbName;
      void dbVersion;
      void storeNames;

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
        // 必须得到「长度 = 负载字节数」的独立 ArrayBuffer，再交给 JSI：
        // 1) `new Uint8Array(blob).buffer` 的 backing 可能比 byteLength 大（对齐），native 若按 buffer 全长绑 BLOB 会写入脏尾或堆异常；
        // 2) 无 `console.log(buffer)` 时偶发闪退、加上就正常，属于「延长引用/改变 GC 时机」掩盖了上述生命周期问题，不能依赖 console。
        // const buffer =
        //   blob.byteLength === 0
        //     ? new ArrayBuffer(0)
        //     : blob.buffer instanceof ArrayBuffer
        //       ? blob.buffer.slice(
        //           blob.byteOffset,
        //           blob.byteOffset + blob.byteLength,
        //         )
        //       : new Uint8Array(blob).buffer.slice(0, blob.byteLength);
        const buffer = new Uint8Array(blob).buffer.slice(0, blob.byteLength);
        console.log("写入 buffer", buffer);
        DB.execute(`INSERT INTO ${STORE_LOGS} (value) VALUES (?);`, [buffer]);
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
        void key;
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
      if (log != null && typeof log === "object") {
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