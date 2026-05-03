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

export class LogStorageBase {

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
