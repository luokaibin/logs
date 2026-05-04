/**
 * 日志聚合器
 * 负责日志的缓存、处理和发送
 */

import { META_KEYS } from './constants.js';
import { isSameDay, generateRandomPrefix } from './utils.js';
import { gzipSync } from 'fflate';
import { LogProcessor } from './LogProcessor.js';
/** 打包时由 Rollup `resolveId` 解析到 `@logbeacon/platforms/sls-encoder` 或 `loki-encoder`（占位符，非 npm 包名）。 */
import logEncoder from 'logbeacon-internal:log-encoder';

/**
 * @typedef {Object} LogItem
 * @property {number} time - 该日志发生的时间，毫秒级时间戳
 * @property {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @property {string} content - 日志内容
 * @property {string} clientUuid - 客户端唯一ID
 * @property {string} sessionId - 浏览器会话唯一ID，存储在sessionStorage中
 * @property {string} referrer - 当前页面的 referrer
 * @property {{width: number, height: number}} screen - 屏幕宽高
 * @property {{width: number, height: number}} window - 窗口宽高
 * @property {string} url - 当前页面url
 * @property {string} ip - 公网IP
 * @property {string} region - 公网IP所在地区
 * @property {Object.<string, string>} [extendedAttributes] - 外部扩展的基础属性，key-value均为字符串
 */

/**
 * 日志聚合器类
 * 继承自LogProcessor，负责日志的批量聚合、处理和发送
 */
export class LogAggregator extends LogProcessor {
  /**
   * 创建日志聚合器实例
   * @param {Object} options - 配置选项
   * @param {number} [options.flushInterval=300000] - 日志自动发送间隔（毫秒），默认5分钟
   * @param {number} [options.flushSize=3145728] - 日志缓冲区大小上限（字节），默认3MB
   * @param {number} [options.dedupInterval=3000] - 重复日志去重时间窗口（毫秒）
   */
  constructor(options = {}) {
    super(options);
    /**
     * 日志缓冲区，存储待发送的日志对象 null 说明是冷启动
     * @type {LogItem[]|null}
     * @private
     */
    this._logBuffer = null;
    
    /**
     * 当前缓冲区累计字节数
     * @type {number|null}
     * @private
     */
    this._logBufferBytes = null;
    
    /**
     * 日志自动发送间隔（毫秒）
     * @type {number}
     * @private
     */
    this._flushInterval = options.flushInterval || 5 * 60 * 1000; // 默认5分钟
    
    /**
     * 日志缓冲区大小上限（字节）
     * @type {number}
     * @private
     */
    this._flushSize = options.flushSize || 3 * 1024 * 1024; // 默认3MB

    /**
     * 日志上下文 - 用于标识日志批次，格式为 `${prefix}-${logGroupId}` 禁止直接使用
     * @type {string|null}
     * @private
     */
    this._logContext = null;

    /**
     * 日志上报接口地址
     * @type {string|null}
     * @private
     */
    this._beaconUrl = null;
  }
  
  /**
   * 获取 beaconUrl
   * @private
   * @returns {Promise<string>}
   */
  async _getBeaconUrl() {
    if (this._beaconUrl) {
      return this._beaconUrl;
    }
    const storedUrl = await this.getMeta(META_KEYS.BEACON_URL);
    if (storedUrl) {
      this._beaconUrl = storedUrl;
      return storedUrl;
    }
    return '/api/beacon'; // 默认地址
  }

  /**
   * 更新 beaconUrl 配置
   * @private
   * @param {string} url - 新的 beaconUrl
   * @returns {Promise<void>}
   */
  async _updateBeaconUrl(url) {
    if (!url) return;
    this._beaconUrl = url;
    await this.applyExtendedMetaIfChanged(META_KEYS.BEACON_URL, url);
  }

  /**
   * 生成日志上下文
   * @private
   * @returns {Promise<string>}
   */
  async _generateLogContext() {
    let logContext = this._logContext;
    let prefix = logContext?.split('-')?.[0];
    let logGroupId = logContext?.split('-')?.[1];
    if (logContext && prefix && logGroupId) {
      const newLogGroupId = parseInt(logGroupId, 16) + 1;
      this._logContext = `${prefix}-${newLogGroupId.toString(16).toUpperCase()}`;
      await this.setMeta(META_KEYS.LOG_CONTEXT, this._logContext);
      return this._logContext;
    }
    let [dbLogContext, lastUpdateTime] = await Promise.all([
      this.getMeta(META_KEYS.LOG_CONTEXT),
      this.getMeta(META_KEYS.LAST_UPDATE_TIME),
    ]);
    prefix = dbLogContext?.split('-')?.[0];
    logGroupId = dbLogContext?.split('-')?.[1];
    const now = Date.now();
    if (prefix && logGroupId && lastUpdateTime && isSameDay(lastUpdateTime, now)) {

      const newLogGroupId = parseInt(logGroupId, 16) + 1;
      this._logContext = `${prefix}-${newLogGroupId.toString(16).toUpperCase()}`;
      await this.setMeta(META_KEYS.LOG_CONTEXT, this._logContext);
      return this._logContext;
    }

    prefix = generateRandomPrefix();
    logGroupId = 1;
    this._logContext = `${prefix}-${logGroupId.toString(16).toUpperCase()}`;
    await this.setMeta(META_KEYS.LOG_CONTEXT, this._logContext);
    return this._logContext;
  }
  /**
   * 获取日志缓冲区
   * @private
   * @returns {Promise<LogItem[]>}
   */
  async _getLogBuffer() {
    if (this._logBuffer) {
      return this._logBuffer;
    }
    const {logs, logsBytes} = await this._loadAndDecodeLogsFromDB();
    this._logBuffer = logs;
    this._logBufferBytes = logsBytes;
    return this._logBuffer;
  }

  /**
   * 从DB加载并解码所有日志
   * @private
   * @returns {Promise<{logs: LogItem[], logsBytes: number}>}
   */
  async _loadAndDecodeLogsFromDB() {
    const logsBytes = await this.getAllLogsBytes();
    const logs = await this.getAllLogs();
    console.log('从DB加载并解码所有日志', logs.length);
    return {logs, logsBytes};
  }
  /**
   * 添加日志到缓冲区
   * @private
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<{logBufferBytes: number, log: LogItem}|null>}
   */
  async _addLogToBuffer(logItem) {
    const logBuffer = await this._getLogBuffer();
    const res = await this.insertLog(logItem);
    if (!res) return null;
    const {log, size} = res;
    logBuffer.push(log);
    
    this._logBufferBytes += size;
    return {
      logBufferBytes: this._logBufferBytes,
      log
    }
  }
  /**
   * 清空日志缓冲区 和 缓存区大小记录
   * @private
   * @returns {Promise<void>}
   */
  async _clearLogBuffer() {
    this._logBuffer = [];
    this._logBufferBytes = 0;
    await this.clearLogs();
  }

  /** 
   * 获取最早的一条日志
   * @returns {Promise<LogItem|null>} - 最早的一条日志，如果不存在则返回 null
   */
  async getFirstLog() {
    const logs = await this._getLogBuffer();
    return logs[0];
  }
  
  /**
   * 添加日志到缓冲区并检查是否触发发送
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<void>}
   */
  async addLog(logItem) {
    const added = await this._addLogToBuffer(logItem);
    if (!added) return; // 如果因为去重等原因未添加，则直接返回

    const firstLog = await this.getFirstLog();
    if (!firstLog) return; // 缓冲区为空，不处理

    // 满足条件时自动发送日志
    if (added.logBufferBytes >= this._flushSize) {
      await this.flushLogs();
    } else if (Date.now() - firstLog.time > this._flushInterval) {
      // 未满足大小条件但超时
      await this.flushLogs();
    }
  }
  
  /**
   * 压缩并发送日志
   * @returns {Promise<void>}
   */
  async flushLogs() {
    const {logs: logBuffer} = await this._loadAndDecodeLogsFromDB();
    if (!logBuffer || logBuffer.length === 0) return;
    const ctxId = await this?._generateLogContext?.();
    const payload = logEncoder(logBuffer, ctxId);
    if (!payload) return;
    const body = this._compressLogs(payload);
    const beaconUrl = await this._getBeaconUrl();
    try {
      console.log('日志上报', beaconUrl);
      await fetch(beaconUrl, {
        method: 'POST',
        body,
      });
      await this.reset();
    } catch (e) {
      console.error('flushLogs error', e);
    }
  }
  
  /**
   * 压缩日志数据
   * @private
   * @param {Uint8Array} payload - 要压缩的日志数据
   * @returns {Uint8Array} 压缩后的数据
   */
  _compressLogs(payload) {
    const body = gzipSync(payload);
    return body;
  }
  
  /**
   * 重置日志聚合器状态
   */
  async reset() {
    await this._clearLogBuffer();
    await this._clearLogDigestCache();
  }
  
  /**
   * 分类处理事件
   * @param {Object} event - 事件对象
   * @param {"log"|"page-load"|"page-visible"|"page-unload"|"page-hidden"|"flush-now"} event.type - 事件类型；flush-now 表示强制上报或外部主动要求立即上报
   * @param {any} event.payload - 事件负载
   */
  

  async handleEvent(event) {
    switch (event.type) {
      case 'log':
        await this.addLog(event.payload);
        break;
      case 'config-update':
        if (event.payload && event.payload.beaconUrl) {
          await this._updateBeaconUrl(event.payload.beaconUrl);
        }
        break;
      case 'page-load':
      case 'page-visible':
        break;
      case 'page-unload':
      case 'page-hidden':
      case 'flush-now':
        await this.flushLogs();
        break;
      default:
        // 非支持类型消息忽略
        break;
    }
  }
}
