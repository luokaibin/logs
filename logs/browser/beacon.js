import { getLogExtraInfo, getServiceWorker } from '../common/utils.js';
import {serializeLogContent} from '../common/serializeLogContent.js';
import { LogProcessor } from '../common/LogProcessor.js';

export const generateLog = () => {
  const currentScript = document.currentScript;
  function initSWBridge() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const logProcessor = new LogProcessor();
      const initInfo = {
        currentScript,
        serviceWorker: null,
      }

      // 发送事件
      const sendSWEvent = (msg) => {
        if (initInfo.serviceWorker) {
          return initInfo.serviceWorker.postMessage(msg);
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
        }).then(async (registration) => {
          if (registration.active) {
            initInfo.serviceWorker = registration.active
          } else {
            initInfo.serviceWorker = await getServiceWorker();
          }

          // 读取 beacon-url 配置并发送
          if (initInfo.currentScript) {
            const beaconUrl = initInfo.currentScript.getAttribute('data-beacon-url');
            if (beaconUrl) {
              sendSWEvent({
                type: 'config-update',
                payload: {
                  beaconUrl,
                },
              });
            }
          }

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
        const extraInfo = getLogExtraInfo();
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e.error]),
            ...extraInfo
          }
        });
      });

      window.addEventListener('unhandledrejection', function(e) {
        const extraInfo = getLogExtraInfo();
        sendSWEvent({
          type: 'log',
          payload: {
            level: 'error',
            content: serializeLogContent([e.reason]),
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

      // 监听外部全局脚本的事件，用于日志上报
      window.addEventListener('logbeacon:log', function(e) {
        try {
          const { level, logs } = e.detail || {};
          if (!level || !Array.isArray(logs)) {
            console.warn('[logbeacon] Invalid logbeacon:log event format. Expected: { level: string, logs: array }');
            return;
          }

          // 验证 level 是否为有效的日志级别
          const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
          if (!validLevels.includes(level)) {
            console.warn(`[logbeacon] Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
            return;
          }

          // 获取日志上下文信息和序列化日志内容
          const extraInfo = getLogExtraInfo();
          const content = serializeLogContent(logs);
          
          // 构造日志 payload
          const payload = {
            level,
            content,
            ...extraInfo
          };

          // 发送到 Service Worker 或内部事件系统
          sendSWEvent({ type: 'log', payload });
        } catch (error) {
          console.error('[logbeacon] Error processing logbeacon:log event:', error);
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
