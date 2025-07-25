/**
 * 日志聚合器
 * 负责日志的缓存、处理和发送
 */

import { UAParser } from 'ua-parser-js';
import { isSameDay, fetchPublicIPAndRegion } from './utils.js';
import {serializeSingleValue} from './serializeLogContent.js'
import {gzipSync} from "fflate"

/**
 * @typedef {Object} UserAgentInfo
 * @property {string} ua
 * @property {{name: string, version: string, major?: string, type?: string}} browser
 * @property {{architecture?: string}} cpu
 * @property {{model?: string, vendor?: string, type?: string}} device
 * @property {{name?: string, version?: string}} engine
 * @property {{name?: string, version?: string}} os
 */

/**
 * @typedef {Object} LogItem
 * @property {number} time - 该日志发生的时间，毫秒级时间戳
 * @property {"trace"|"debug"|"info"|"warn"|"error"} level - 日志等级
 * @property {string} content - 日志内容
 * @property {string} clientUuid - 客户端唯一ID
 * @property {UserAgentInfo} userAgent - 解析后的 userAgent 信息
 * @property {{width: number, height: number}} screen - 屏幕宽高
 * @property {{width: number, height: number}} window - 窗口宽高
 * @property {string} url - 当前页面url
 * @property {string} ip - 公网IP
 * @property {string} region - 公网IP所在地区
 */

/**
 * 日志聚合器类
 * 负责日志的缓存、处理和发送
 */
export class LogAggregator {
  /**
   * 创建日志聚合器实例
   * @param {Object} options - 配置选项
   * @param {(logs: LogItem[]) => Uint8Array} options.logEncoder - 日志编码器
   * @param {number} [options.flushInterval=300000] - 日志自动发送间隔（毫秒），默认5分钟
   * @param {number} [options.flushSize=3145728] - 日志缓冲区大小上限（字节），默认3MB
   */
  constructor(options = {}) {
    if (!options.logEncoder) {
      throw new Error('logEncoder is required!');
    }
    /**
     * 日志编码器
     * @type {(logs: LogItem[]) => Uint8Array}
     * @private
     */
    this._logEncoder = options.logEncoder;
    /**
     * 日志缓冲区，存储待发送的日志对象
     * @type {LogItem[]}
     * @private
     */
    this._logBuffer = [];

    /**
     * 日志摘要缓存，用于去重
     * @type {Map<string, number>}
     * @private
     */
    this._logDigestCache = new Map();

    /**
     * 重复日志去重时间窗口（毫秒）
     * @type {number}
     * @private
     */
    this._dedupInterval = 2000;
    
    /**
     * 当前缓冲区累计字节数
     * @type {number}
     * @private
     */
    this._logBufferBytes = 0;
    
    /**
     * 上次发送日志的时间戳
     * @type {number}
     * @private
     */
    this._lastSendTs = Date.now();
    
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
     * 上次获取IP的时间戳（毫秒）
     * @type {number}
     * @private
     */
    this._lastIpFetchTime = 0;
    
  }
  
  /**
   * 添加日志到缓冲区
   * @param {LogItem} logItem - 日志项
   * @returns {Promise<void>}
   */
  async addLog(logItem) {
    if (!logItem.content) return;
    const digest = await this._getDigest(logItem.content);
    const lastTime = this._logDigestCache.get(digest);

    if (lastTime) {
      // 时间窗口内重复，丢弃
      if (logItem.time - lastTime <= this._dedupInterval) return;
    }

    // 更新摘要时间或添加新摘要
    this._logDigestCache.set(digest, logItem.time);

    this._logBuffer.push(logItem);
    
    // 增量计算本条日志字节数
    const itemBytes = new TextEncoder().encode(JSON.stringify(logItem)).length;
    this._logBufferBytes += itemBytes;
    
    // 满足条件时自动发送日志
    if (this._logBufferBytes >= this._flushSize) {
      await this.flushLogs();
    } else if (Date.now() - this._lastSendTs > this._flushInterval) {
      // 未满足大小条件但超时
      await this.flushLogs();
    }
  }
  
  /**
   * 给日志补充信息
   * @private
   * @returns {Promise<void>}
   */
  async _enrichLog() {
    // 判断是否需要更新IP（每天只更新一次）
    const now = Date.now();
    if (!isSameDay(now, this._lastIpFetchTime)) {
      const { ip, region } = await fetchPublicIPAndRegion();
      if (ip) this._currentIp = ip;
      if (region) this._currentRegion = region;
      if (ip || region) {
        this._lastIpFetchTime = now; // IP最后的获取时间
      }
    }

    // 二次加工：统一加上解析后的 userAgent 和 IP
    if (!this._userAgent) {
      const ua = this._logBuffer[0]?.userAgent;
      if (ua) {
        this._userAgent = serializeSingleValue(UAParser(ua));
      }
    }
    
    // 给日志补充信息
    if (this._userAgent || this._currentIp || this._currentRegion) {
      for (const item of this._logBuffer) {
        if (this._userAgent) item.userAgent = this._userAgent;
        if (this._currentIp) item.ip = this._currentIp;
        if (this._currentRegion) item.region = this._currentRegion;
      }
    }
  }
  
  /**
   * 压缩并发送日志
   * @returns {Promise<void>}
   */
  async flushLogs() {
    if (this._logBuffer.length === 0) return;
    
    await this._enrichLog();

    const payload = this._logEncoder(this._logBuffer);
    if (!payload) return;
    const body = this._compressLogs(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/beacon', body);
      } else {
        await fetch('/api/beacon', {
          method: 'POST',
          body
        });
      }
    } finally {
      this.reset();
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
  reset() {
    this._logBuffer = [];
    this._logBufferBytes = 0;
    this._lastSendTs = Date.now();
    this._logDigestCache.clear();
  }
  
  /**
   * 获取当前缓冲区日志数量
   * @returns {number} 日志数量
   */
  getBufferSize() {
    return this._logBuffer.length;
  }
  
  /**
   * 获取当前缓冲区字节数
   * @returns {number} 字节数
   */
  getBufferBytes() {
    return this._logBufferBytes;
  }
  /**
   * 分类处理事件
   * @param {Object} event - 事件对象
   * @param {"log"|"page-load"|"page-visible"|"page-unload"|"page-hidden"} event.type - 事件类型
   * @param {any} event.payload - 事件负载
   */
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

  handleEvent(event) {
    switch (event.type) {
      case 'log':
        this.addLog(event.payload);
        break;
      case 'page-load':
      case 'page-visible':
        break;
      case 'page-unload':
      case 'page-hidden':
        this.flushLogs();
        break;
      default:
        // 非支持类型消息忽略
        break;
    }
  }
  /**
   * 获取单例实例
   * @param {Object} options - 配置选项
   * @param {number} [options.flushInterval=300000] - 日志自动发送间隔（毫秒），默认5分钟
   * @param {number} [options.flushSize=1048576] - 日志缓冲区大小上限（字节），默认1MB
   * @returns {LogAggregator} 日志聚合器实例
   */
  static getInstance(options) {
    if (!this._instance) {
      this._instance = new LogAggregator(options);
    }
    return this._instance;
  }
}
