import { getLogExtraInfo } from '../common/utils.js';
import {serializeLogContent} from '../common/serializeLogContent.js';
import { LogProcessor } from '../common/LogProcessor.js';

export const generateLog = (logEncoder) => {
  function initSWBridge() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const logProcessor = new LogProcessor();
      let serviceWorker;
      // 发送事件
      const sendSWEvent = (msg) => {
        if (serviceWorker) {
          return serviceWorker.postMessage(msg);
        }
        const event = new CustomEvent('sendLog', {
          detail: msg
        });
        window.dispatchEvent(event);
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
        }).then((registration) => {
          serviceWorker = registration.active;
          sendSWEvent({
            type: 'log',
            payload: loadLog
          })
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] Service Worker registered successfully',
              ...extraInfo
            }
          })
          sendSWEvent({ type: 'page-load' });
        }).catch((e) => {
          sendSWEvent({
            type: 'log',
            payload: loadLog
          });
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'error',
              content: '[logbeacon] Failed to register Service Worker',
              ...extraInfo
            }
          });
        });

        // 页面卸载事件
        window.addEventListener('beforeunload', function() {
          const extraInfo = getLogExtraInfo();
          const payload = {
            level: 'trace',
            content: '[logbeacon] page unload',
            ...extraInfo
          };
          const msg = {
            type: 'log',
            payload: payload
          };
          sendSWEvent(msg);
        });

        // 前后台切换事件
        document.addEventListener('visibilitychange', async function() {
          const extraInfo = getLogExtraInfo();
          if (document.visibilityState === 'hidden') {
            sendSWEvent({
              type: 'log',
              payload: {
                level: 'trace',
                content: '[logbeacon] page hidden',
                ...extraInfo
              }
            })
            sendSWEvent({ type: 'page-hidden' });
          } else if (document.visibilityState === 'visible') {
            sendSWEvent({
              type: 'log',
              payload: {
                level: 'trace',
                content: '[logbeacon] page visible',
                ...extraInfo
              }
            })
            sendSWEvent({ type: 'page-visible' });
          }
        });
        /**
         * 监听 `error` 事件，捕获 JavaScript 运行时错误
         * 监听 `unhandledrejection` 事件,捕获未处理的 Promise 异常
         * 对于 `error` 和 `unhandledrejection` 事件，捕获到的错误先处理成标准格式，然后尝试发送给service worker，如果service worker状态异常就调用navigator.sendBeacon()进行日志上报
         */
        window.addEventListener('error', function(e) {
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'error',
              content: serializeLogContent([e]),
              ...extraInfo
            }
          })
        });
        window.addEventListener('unhandledrejection', function(e) {
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'error',
              content: serializeLogContent([e]),
              ...extraInfo
            }
          })
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
