import { getServiceWorker, sendLog } from '../common/utils.js';
import { LogAggregator } from '../common/LogAggregator.js';

export const generateLog = (logEncoder) => {
  function initSWBridge() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const logAggregator = LogAggregator.getInstance({
        logEncoder,
        flushInterval: 5 * 60 * 1000,
        flushSize: 2 * 1024 * 1024,
      });
      
      // 发送事件
      const sendSWEvent = async (event) => {
        const serviceWorker = await getServiceWorker('/beacon/');
        if (!serviceWorker) {
          const customEvent = new CustomEvent('sendLog', {
            detail: event
          });
          window.dispatchEvent(customEvent);
        } else {
          serviceWorker.postMessage(event);
        }
        if (serviceWorker && logAggregator.getBufferSize() > 0) {
          logAggregator.flushLogs();
        }
      };

      // 注册 Service Worker（以 module 方式）
      window.addEventListener('load', function() {
        // 指定 Service Worker 的路径和作用域
        navigator.serviceWorker.register('/beacon/beacon-sw.js', { 
          type: 'module',
          scope: '/beacon/' // 明确指定作用域
        }).finally(() => {
          sendSWEvent({ type: 'page-load' });
        });

        // 页面卸载事件
        window.addEventListener('beforeunload', function() {
          sendSWEvent({ type: 'page-unload' });
        });

        // 前后台切换事件
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'hidden') {
            sendSWEvent({ type: 'page-hidden' });
          } else if (document.visibilityState === 'visible') {
            sendSWEvent({ type: 'page-visible' });
          }
        });
        /**
         * TODO
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
          logAggregator.handleEvent(e.detail);
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
