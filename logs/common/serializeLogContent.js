/**
 * 日志内容序列化
 * @param {any[]} args - 需要序列化的参数数组
 * @returns {string} 序列化后的字符串
 */
function serializeLogContent(args) {
  return args.map(arg => serializeSingleValue(arg)).join(" ");
}

/**
 * 序列化单个值
 * @param {any} value - 需要序列化的值
 * @param {Object} options - 序列化选项
 * @param {number} options.maxDepth - 最大序列化深度，默认为 10
 * @param {number} options.maxLength - 序列化结果最大长度，默认为 10000
 * @param {string[]} options.sensitiveKeys - 敏感信息的键名，默认为 ['password', 'token', 'secret']
 * @param {number} [currentDepth=0] - 当前序列化深度
 * @returns {string} 序列化后的字符串
 */
function serializeSingleValue(value, options = {}, currentDepth = 0) {
  const {
    maxDepth = 10,
    maxLength = 10000,
    sensitiveKeys = ['password', 'token', 'secret', 'auth']
  } = options;
  
  // 处理 undefined 和 null
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  
  // 处理原始类型
  const type = typeof value;
  if (
    type === 'string' || 
    type === 'number' || 
    type === 'boolean'
  ) {
    return String(value);
  }
  
  // 处理 BigInt
  if (type === 'bigint') {
    return `${value.toString()}n`;
  }
  
  // 处理 Symbol
  if (type === 'symbol') {
    return value.toString();
  }
  
  // 如果已达到最大深度，返回类型信息
  if (currentDepth >= maxDepth) {
    return `[${Object.prototype.toString.call(value)}]`;
  }
  
  // 处理 Error 对象
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\nStack: ${value.stack || ''}`;
  }
  
  // 处理日期对象
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // 处理正则表达式
  if (value instanceof RegExp) {
    return value.toString();
  }
  
  // 处理函数
  if (type === 'function') {
    const fnStr = value.toString();
    return `Function: ${value.name || 'anonymous'} ${fnStr.slice(0, 100)}${fnStr.length > 100 ? '...' : ''}`;
  }
  
  // 处理特殊集合类型
  if (typeof Map !== 'undefined' && value instanceof Map) {
    const obj = {};
    value.forEach((v, k) => {
      // 将 Map 的键转换为字符串
      const keyStr = typeof k === 'object' && k !== null ? '[object]' : String(k);
      obj[keyStr] = v;
    });
    return serializeSingleValue(obj, options, currentDepth + 1);
  }
  
  if (typeof Set !== 'undefined' && value instanceof Set) {
    return serializeSingleValue(Array.from(value.values()), options, currentDepth + 1);
  }
  
  // 处理数组
  if (Array.isArray(value)) {
    const items = value.map(item => serializeSingleValue(item, options, currentDepth + 1));
    const result = `[${items.join(', ')}]`;
    return result.length > maxLength ? result.slice(0, maxLength) + '...' : result;
  }
  
  // 处理 DOM 元素 (浏览器环境)
  if (typeof window !== 'undefined' && typeof Element !== 'undefined' && value instanceof Element) {
    return `<${value.tagName.toLowerCase()}${value.id ? ` id="${value.id}"` : ''}${value.className ? ` class="${value.className}"` : ''}>`;
  }
  
  // 处理对象
  try {
    // 检查是否有自定义的 toJSON 方法
    if (value !== null && typeof value.toJSON === 'function') {
      return serializeSingleValue(value.toJSON(), options, currentDepth + 1);
    }
    
    // 使用 JSON.stringify 但处理循环引用和敏感信息
    const seen = new WeakSet();
    const result = JSON.stringify(value, function(key, val) {
      // 过滤敏感信息
      if (sensitiveKeys.includes(key.toLowerCase())) {
        return '[敏感信息已过滤]';
      }
      
      // 处理循环引用
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[循环引用]';
        }
        seen.add(val);
      }
      
      return val;
    }, 2);
    
    // 截断过长的结果
    return result.length > maxLength ? result.slice(0, maxLength) + '...' : result;
  } catch (e) {
    // JSON.stringify 失败，尝试 toString
    try {
      if (value !== null && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        return value.toString();
      }
    } catch (e2) {
      // 如果 toString 也失败，使用 Object.prototype.toString
      return Object.prototype.toString.call(value);
    }
    
    // 最后的备选方案
    return String(value);
  }
}

export {
  serializeLogContent,
  serializeSingleValue
}