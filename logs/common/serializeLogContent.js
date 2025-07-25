// 默认的数组采样规则
const ARRAY_SAMPLING_CONFIG = {
  primitive: {
    threshold: 20, // 对简单数组保持宽松的阈值
    head: 10,      // 保留足够的上下文
    tail: 4,
    middle: 3
  },
  complex: {
    threshold: 10, // 对复杂数组使用严格的阈值
    head: 5,       // 采用更保守的采样数
    tail: 3,
    middle: 2
  },
};

// 序列化后日志字符串的最大长度
const MAX_LOG_LENGTH = 100000;

/**
 * 将任何 JavaScript 内容序列化为截断后的 JSON 字符串。
 * @param {any} content - 需要序列化的内容。
 * @returns {string} 序列化后的 JSON 字符串。
 */
function serializeLogContent(content) {
  const serializableObject = serializeSingleValue(content);

  try {
    const result = JSON.stringify(serializableObject);

    // 截断过长的结果
    return result.length > MAX_LOG_LENGTH ? result.slice(0, MAX_LOG_LENGTH) + '...' : result;
  } catch (e) {
    // Fallback for any unexpected stringify errors
    return `[序列化失败: ${e.message}]`;
  }
}

/**
 * 递归地将值转换为可 JSON 序列化的格式。
 * @param {any} value - 需要序列化的值。
 * @param {object} [options={maxDepth: 10, sensitiveKeys: [...]}] - 序列化选项。
 * @param {number} [options.maxDepth=10] - 最大序列化深度。
 * @param {string[]} [options.sensitiveKeys=['password', 'token', 'secret', 'auth']] - 敏感信息的键名。
 * @param {number} [currentDepth=0] - 当前序列化深度，用于递归。
 * @param {WeakSet} [seen=new WeakSet()] - 用于检测循环引用的集合，用于递归。
 * @returns {any} 可序列化的值。
 */
function serializeSingleValue(
  value,
  options = {
    maxDepth: 10,
    sensitiveKeys: ['password', 'token', 'secret', 'auth'],
  },
  currentDepth = 0,
  seen = new WeakSet(),
) {
  const { maxDepth, sensitiveKeys } = options;
  const type = typeof value;

  // 处理原始类型和 null
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(type)) {
    return value;
  }

  // 处理 BigInt
  if (type === 'bigint') {
    return `${value.toString()}n`;
  }

  // 处理 Symbol
  if (type === 'symbol') {
    return value.toString();
  }
  
  // 处理函数
  if (type === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  // --- 对象类型处理开始 ---

  // 检查循环引用
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[循环引用]';
    }
    seen.add(value);
  }

  // 检查最大深度
  if (currentDepth >= maxDepth) {
    return `[达到最大深度: ${Object.prototype.toString.call(value)}]`;
  }

  // 处理特殊对象类型
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\nStack: ${value.stack || ''}`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) {
      const keyStr = typeof k === 'object' && k !== null ? '[object]' : String(k);
      obj[keyStr] = serializeSingleValue(v, options, currentDepth + 1, seen);
    }
    return obj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    const arr = [];
    for (const v of value.values()) {
      arr.push(serializeSingleValue(v, options, currentDepth + 1, seen));
    }
    return arr;
  }

  // 处理数组 (包括采样逻辑)
  if (Array.isArray(value)) {
    const isComplex = value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
    const rules = isComplex ? ARRAY_SAMPLING_CONFIG.complex : ARRAY_SAMPLING_CONFIG.primitive;

    // 卫语句：如果未达到采样阈值，则正常处理并提前返回
    if (value.length <= rules.threshold) {
      return value.map(item => serializeSingleValue(item, options, currentDepth + 1, seen));
    }

    // --- 采样逻辑开始 ---
    const sampledResult = { _t: 'arr', _l: value.length, _e: {} };
    const indices = new Set();

    // Head
    for (let i = 0; i < rules.head && i < value.length; i++) {
      indices.add(i);
    }
    // Tail
    for (let i = 0; i < rules.tail && value.length - 1 - i >= 0; i++) {
      indices.add(value.length - 1 - i);
    }
    // Middle
    const midStart = Math.floor(value.length / 2 - rules.middle / 2);
    for (let i = 0; i < rules.middle && midStart + i < value.length; i++) {
      indices.add(midStart + i);
    }

    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    for (const index of sortedIndices) {
      sampledResult._e[index] = serializeSingleValue(value[index], options, currentDepth + 1, seen);
    }

    return sampledResult;
  }
  
  // 处理 DOM 元素 (浏览器环境)
  if (typeof window !== 'undefined' && value instanceof window.Element) {
    return `<${value.tagName.toLowerCase()} class="${value.className}" id="${value.id}">`;
  }

  // 处理普通对象
  if (typeof value === 'object' && value !== null) {
     // 检查是否有自定义的 toJSON 方法
    if (typeof value.toJSON === 'function') {
      return serializeSingleValue(value.toJSON(), options, currentDepth + 1, seen);
    }

    const result = {};
    for (const key of Object.keys(value)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        result[key] = '[敏感信息已过滤]';
      } else {
        result[key] = serializeSingleValue(value[key], options, currentDepth + 1, seen);
      }
    }
    return result;
  }

  // 兜底处理
  return String(value);
}

export {
  serializeLogContent,
  serializeSingleValue
};