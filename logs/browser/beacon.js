import { getServiceWorker, sendLog, getLogExtraInfo, sendEvent } from '../common/utils.js';
import { LogProcessor } from '../common/LogProcessor.js';
import {gzipSync} from "fflate"

export const generateLog = (logEncoder) => {
  function initSWBridge() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const logProcessor = new LogProcessor();
      
      // 发送事件
      const sendSWEvent = async (event) => {
        const serviceWorker = await getServiceWorker('/beacon/');
        if (!serviceWorker) return;
        serviceWorker.postMessage(event);
      };

      // 注册 Service Worker（以 module 方式）
      window.addEventListener('load', function() {
        const extraInfo = getLogExtraInfo();
        const loadLog = {
          level: 'trace',
          content: '[logbeacon] page load',
          ...extraInfo
        };
        // 指定 Service Worker 的路径和作用域
        navigator.serviceWorker.register('/beacon/beacon-sw.js', { 
          type: 'module',
          scope: '/beacon/' // 明确指定作用域
        }).finally(() => {
          const msg = {
            type: 'log',
            payload: loadLog
          };
          sendEvent(msg)
          sendLog('trace', ['[logbeacon] Service Worker registered successfully']);
          sendSWEvent({ type: 'page-load' });
        });

        // 页面卸载事件
        window.addEventListener('beforeunload', async function() {
          // 由于页面卸载事件是同步的，没有充足的时间解析或从indexDB中读取元数据，所以这条日志缺少以下信息
          // 日志中没有解析后的ua信息
          // 日志中没有ip信息
          // 日志中没有region信息
          // 日志中没有上下文ID
          const extraInfo = getLogExtraInfo();
          const payload = {
            level: 'trace',
            content: '[logbeacon] page unload',
            ...extraInfo
          };
          const data = await logEncoder([payload]);

          if (data) return
          const compressedData = gzipSync(data);
          if (compressedData && compressedData.length > 0) {
            navigator.sendBeacon('/api/beacon', compressedData);
          }
        });

        // 前后台切换事件
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'hidden') {
            sendLog('trace', ['[logbeacon] page hidden']);
            sendSWEvent({ type: 'page-hidden' });
          } else if (document.visibilityState === 'visible') {
            sendLog('trace', ['[logbeacon] page visible']);
            sendSWEvent({ type: 'page-visible' });
          }
        });
        /**
         * 监听 `error` 事件，捕获 JavaScript 运行时错误
         * 监听 `unhandledrejection` 事件,捕获未处理的 Promise 异常
         * 对于 `error` 和 `unhandledrejection` 事件，捕获到的错误先处理成标准格式，然后尝试发送给service worker，如果service worker状态异常就调用navigator.sendBeacon()进行日志上报
         */
        window.addEventListener('error', function(e) {
          sendLog('error', [e]);
        });
        window.addEventListener('unhandledrejection', function(e) {
          sendLog('error', [e]);
        });
        window.addEventListener('sendLog', function(e) {
          if (e.detail.type === 'log') {
            console.log("sw 不存在，主线程存储日志", e.detail.payload)
            logProcessor.insertLog(e.detail.payload);
          }
        });
      });
    }
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSWBridge);
    } else {
      // 如果 document 已经加载完成，立即初始化
      initSWBridge();
    }
  }
}
