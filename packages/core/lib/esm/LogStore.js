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

const DB_NAME = 'beacon-db';
const DB_VERSION = 1;

// 定义对象存储区的名称
const STORE_LOGS = 'b_dat';
const STORE_DIGEST = 'digestCache';
const STORE_META = 'meta';

/**
 * LogStore — 面向「日志 / digest / meta」的领域 API，通过 {@link LogStorageBase} 的 `ls*` 钩子由平台层实现持久化。
 * 本类不绑定具体存储引擎；浏览器实现见 `logbeacon` 包中的 `MixinLogStore`。
 */
class LogStore extends LogStorageBase {

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

export { DB_NAME, DB_VERSION, LogStore, STORE_DIGEST, STORE_LOGS, STORE_META };
//# sourceMappingURL=LogStore.js.map
