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

      // 定义 Service Worker 注册函数
      const registerServiceWorker = () => {
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
          sendSWEvent({ type: 'log', payload: loadLog });
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] Service Worker registered successfully',
              ...extraInfo
            }
          });
          sendSWEvent({ type: 'page-load' });
        }).catch((e) => {
          sendSWEvent({ type: 'log', payload: loadLog });
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
          sendSWEvent({ type: 'log', payload });
          sendSWEvent({ type: 'page-unload' });
        });
      };

      // 立即注册 Service Worker
      registerServiceWorker();

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
          });
          sendSWEvent({ type: 'page-hidden' });
        } else if (document.visibilityState === 'visible') {
          sendSWEvent({
            type: 'log',
            payload: {
              level: 'trace',
              content: '[logbeacon] page visible',
              ...extraInfo
            }
          });
          sendSWEvent({ type: 'page-visible' });
        }
      });

      // 错误捕获
      window.addEventListener('error', function(e) {
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e]),
            ...extraInfo
          }
        });
      });

      window.addEventListener('unhandledrejection', function(e) {
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e]),
            ...extraInfo
          }
        });
      });

      // 监听内部事件，当SW不存在时，由主线程处理
      window.addEventListener('sendLog', function(e) {
        if (e.detail.type === 'log') {
          logProcessor.insertLog(e.detail.payload);
        }
      });
    }
  }

  // 根据 DOM 加载状态来初始化
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSWBridge);
    } else {
      initSWBridge();
    }
  }
};
