import { LogStore } from './LogStore.js';
import { isSameDay, fetchPublicIPAndRegion } from './utils.js';
import { UAParser } from 'ua-parser-js';
import {serializeSingleValue} from './serializeLogContent.js'
import Pbf from 'pbf';
import {writeLogItem, readLogItem} from './log.proto.js';
import {META_KEYS} from "./constants.js"
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
    this._dedupInterval = options.dedupInterval || 2000;

    /**
     * 解析后的userAgent对象
     * @type {UserAgentInfo|null}
     * @private
     */
    this._userAgent = null;
    
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
  }

  /**
   * 计算字符串的SHA-256摘要
   * @param {string} str - 输入字符串
   * @returns {Promise<string>} - 摘要的十六进制字符串
   * @private
   */
  async _getDigest(str) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // 将ArrayBuffer转换为十六进制字符串
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
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
   * 获取元数据，包括 User Agent、IP、地理位置和日志上下文。
   * 该方法会优先从内存缓存中读取，如果缓存不存在或已过期（非同一天），则会重新获取并更新缓存和 IndexedDB。
   * @private
   * @param {string} ua - 原始的 User Agent 字符串。
   * @returns {Promise<{ua: string, ip: string, region: string}>} 一个包含元数据解析结果的对象。
   * @property {string} ua - 经过 ua-parser-js 解析和序列化后的 User Agent 信息字符串。
   * @property {string} ip - 获取到的客户端公网 IP 地址。
   * @property {string} region - 根据 IP 地址解析出的客户端地理区域信息。
   * @property {string} lastUpdateTime - 元数据最后更新时间。
   */
  async _getMeta(ua) {
    if (this._userAgent && this._currentIp && this._currentRegion) {
      return {
        ua: this._userAgent,
        ip: this._currentIp,
        region: this._currentRegion,
        lastUpdateTime: this._lastUpdateTime,
      };
    }
    const meta = await this.getAllMeta();
    this._lastUpdateTime = meta[META_KEYS.LAST_UPDATE_TIME];
    const now = Date.now();
    if (this._lastUpdateTime && isSameDay(this._lastUpdateTime, now)) {
      this._userAgent = meta[META_KEYS.USER_AGENT];
      this._currentIp = meta[META_KEYS.IP];
      this._currentRegion = meta[META_KEYS.REGION];
      return {
        ua: this._userAgent,
        ip: this._currentIp,
        region: this._currentRegion,
        lastUpdateTime: this._lastUpdateTime,
      };
    }

    
    const { ip, region } = await fetchPublicIPAndRegion();
    this._currentIp = ip;
    this._currentRegion = region;
    this._userAgent = JSON.stringify(serializeSingleValue(UAParser(ua)));
    this._lastUpdateTime = now;

    await this.setMeta(META_KEYS.LAST_UPDATE_TIME, now);
    await this.setMeta(META_KEYS.USER_AGENT, this._userAgent);
    await this.setMeta(META_KEYS.IP, this._currentIp);
    await this.setMeta(META_KEYS.REGION, this._currentRegion);

    return {
      ua: this._userAgent,
      ip: this._currentIp,
      region: this._currentRegion,
      lastUpdateTime: this._lastUpdateTime,
    };
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
    const data = this.encodeLog(log);
    await super.insertLog(data);
    return {log, size: data.length};
  }
  /**
   * 日志去重
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<LogItem|null>} - 去重后的日志项，如果去重成功则返回 null
   */
  async dedupLog(logItem) {
    const digest = await this._getDigest(logItem.content);
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
    const { ua, ip, region } = await this._getMeta(logItem.userAgent);
    logItem.userAgent = ua;
    logItem.ip = ip;
    logItem.region = region;
    return logItem;
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
