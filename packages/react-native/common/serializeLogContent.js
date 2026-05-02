import {
  serializeSingleValue as serializeSingleValueOrigin,
  serializeLogContent as serializeLogContentOrigin,
} from '@logbeacon/core/serializeLogContent';
// 策略模式：为浏览器环境中的特定对象类型定义专门的处理器
const browserTypeHandlers = new Map();
if (typeof window !== 'undefined') {
  // ErrorEvent 处理器
  browserTypeHandlers.set(window.ErrorEvent, (value, options, currentDepth, seen) => ({
    _t: 'ErrorEvent',
    message: value.message,
    filename: value.filename,
    lineno: value.lineno,
    colno: value.colno,
    error: serializeSingleValue(value.error, options, currentDepth + 1, seen),
  }));

  // PromiseRejectionEvent 处理器
  browserTypeHandlers.set(window.PromiseRejectionEvent, (value, options, currentDepth, seen) => ({
    _t: 'PromiseRejectionEvent',
    reason: serializeSingleValue(value.reason, options, currentDepth + 1, seen),
  }));

  // MessageEvent 处理器
  browserTypeHandlers.set(window.MessageEvent, (value, options, currentDepth, seen) => ({
    _t: 'MessageEvent',
    data: serializeSingleValue(value.data, options, currentDepth + 1, seen),
    origin: value.origin,
    lastEventId: value.lastEventId,
    source: '[WindowProxy]', // source 是一个 window proxy, 不能直接序列化
  }));

  // CloseEvent 处理器
  browserTypeHandlers.set(window.CloseEvent, (value, options, currentDepth, seen) => ({
    _t: 'CloseEvent',
    code: value.code,
    reason: value.reason,
    wasClean: value.wasClean,
  }));

  // CustomEvent 处理器
  browserTypeHandlers.set(window.CustomEvent, (value, options, currentDepth, seen) => ({
    _t: 'CustomEvent',
    type: value.type,
    detail: serializeSingleValue(value.detail, options, currentDepth + 1, seen),
    bubbles: value.bubbles,
    cancelable: value.cancelable,
    composed: value.composed,
  }));

  // KeyboardEvent 处理器
  browserTypeHandlers.set(window.KeyboardEvent, (value, options, currentDepth, seen) => ({
    _t: 'KeyboardEvent',
    type: value.type,
    key: value.key,
    code: value.code,
    ctrlKey: value.ctrlKey,
    shiftKey: value.shiftKey,
    altKey: value.altKey,
    metaKey: value.metaKey,
    repeat: value.repeat,
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // InputEvent 处理器
  browserTypeHandlers.set(window.InputEvent, (value, options, currentDepth, seen) => ({
    _t: 'InputEvent',
    type: value.type,
    inputType: value.inputType,
    data: value.data,
    isComposing: value.isComposing,
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // StorageEvent 处理器
  browserTypeHandlers.set(window.StorageEvent, (value, options, currentDepth, seen) => ({
    _t: 'StorageEvent',
    type: value.type,
    key: value.key,
    newValue: value.newValue,
    oldValue: value.oldValue,
    url: value.url,
    storageArea: '[Storage]', // storageArea 是 Storage 对象，不能直接序列化
    bubbles: value.bubbles,
    cancelable: value.cancelable,
  }));

  // Element（含 HTML / SVG 等 DOM 节点）
  browserTypeHandlers.set(window.Element, (value) =>
    `<${value.tagName.toLowerCase()} class="${value.className}" id="${value.id}">`,
  );
}

export const serializeSingleValue = serializeSingleValueOrigin.bind(browserTypeHandlers);
export const serializeLogContent = serializeLogContentOrigin.bind(browserTypeHandlers);