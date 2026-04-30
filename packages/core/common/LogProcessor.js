import { LogStore } from './LogStore.js';
import { isSameDay, fetchPublicIPAndRegion, dedupContentKey } from './utils.js';
import { defaultTypeHandlers, serializeSingleValue } from './serializeLogContent.js';
import { META_KEYS, META_KEYS_WHITELIST } from './constants.js';

/**
 * 日志处理器类
 * 负责单条日志的处理和存储，包括去重、元数据补充等
 */
export class LogProcessor extends LogStore {
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
    this._lastUpdateTime = meta[META_KEYS.LAST_UPDATE_TIME];
    const now = Date.now();
    this.extendedMeta = Object.fromEntries(Object.entries(meta).filter(([key]) => !META_KEYS_WHITELIST.includes(key)));
    if (this._lastUpdateTime && isSameDay(this._lastUpdateTime, now)) {
      this._currentIp = meta[META_KEYS.IP];
      this._currentRegion = meta[META_KEYS.REGION];
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

    await this.setMeta(META_KEYS.LAST_UPDATE_TIME, now);
    await this.setMeta(META_KEYS.IP, this._currentIp);
    await this.setMeta(META_KEYS.REGION, this._currentRegion);

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
