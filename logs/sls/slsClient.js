import crypto from 'crypto';
import { gunzipSync } from 'fflate'

/**
 * 创建阿里云日志服务客户端
 * @param {string} endpoint - 服务入口，例如 "ap-southeast-1.log.aliyuncs.com"
 * @param {string} accessKeyId - 阿里云访问密钥ID
 * @param {string} accessKeySecret - 阿里云访问密钥密码
 * @param {string} projectName - 项目名称
 * @param {string} logstoreName - 日志库名称
 * @returns {Function} - 返回一个用于发送日志的函数
 */
export const createLogClient = (endpoint, accessKeyId, accessKeySecret, projectName, logstoreName) => {
  const credentials = {
    accessKeyId,
    accessKeySecret,
  };

  /**
   * 获取规范化的头信息
   * @param {Object} headers - 请求头
   * @returns {string} - 规范化的头信息字符串
   */
  function getCanonicalizedHeaders(headers) {
    const keys = Object.keys(headers);
    const prefixKeys = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.startsWith('x-log-') || key.startsWith('x-acs-')) {
        prefixKeys.push(key);
      }
    }

    prefixKeys.sort();

    var result = '';
    for (let i = 0; i < prefixKeys.length; i++) {
      const key = prefixKeys[i];
      result += `${key}:${String(headers[key]).trim()}\n`;
    }

    return result;
  }

  /**
   * 格式化值
   * @param {*} value - 需要格式化的值
   * @returns {string} - 格式化后的字符串
   */
  function format(value) {
    if (typeof value === 'undefined') {
      return '';
    }
    return String(value);
  }

  /**
   * 获取规范化的资源路径
   * @param {string} path - 请求路径
   * @param {Object} queries - 查询参数
   * @returns {string} - 规范化的资源路径
   */
  function getCanonicalizedResource(path, queries) {
    var resource = `${path}`;
    const keys = Object.keys(queries);
    const pairs = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
      const key = keys[i];
      pairs[i] = `${key}=${format(queries[key])}`;
    }

    pairs.sort();
    const querystring = pairs.join('&');
    if (querystring) {
      resource += `?${querystring}`;
    }

    return resource;
  }

  /**
   * 生成签名
   * @param {string} verb - 请求方法
   * @param {string} path - 请求路径
   * @param {Object} queries - 查询参数
   * @param {Object} headers - 请求头
   * @param {Object} credentials - 认证信息
   * @returns {string} - 签名字符串
   */
  const sign = (verb, path, queries, headers, credentials) => {
    const contentMD5 = headers['content-md5'] || '';
    const contentType = headers['content-type'] || '';
    const date = headers['date'];
    const canonicalizedHeaders = getCanonicalizedHeaders(headers);
    const canonicalizedResource = getCanonicalizedResource(path, queries);
    const signString = `${verb}\n${contentMD5}\n${contentType}\n` +
      `${date}\n${canonicalizedHeaders}${canonicalizedResource}`;
    const signature = crypto.createHmac('sha1', credentials.accessKeySecret).update(signString).digest('base64');

    return `LOG ${credentials.accessKeyId}:${signature}`;
  }

  /**
   * 发送序列化后的日志数据
   * @param {Uint8Array} payload - 已经序列化的日志数据
   * @returns {Promise<Object>} - 响应结果
   */
  return async function sendLogs(payload) {
    // const body = gunzipSync(payload);
    const body = payload;
    // 构建完整的请求头
    const headers = {
      'content-type': 'application/x-protobuf',
      'date': new Date().toUTCString(),
      'x-log-apiversion': '0.6.0',
      'x-log-signaturemethod': 'hmac-sha1',
      'x-log-bodyrawsize': body.length.toString(),
      'content-length': body.length.toString(),
      'content-md5': crypto.createHash('md5').update(body).digest('hex').toUpperCase(),
    };
    
    // 构建请求路径
    const path = `/logstores/${logstoreName}/shards/lb`;
    
    // 生成签名并添加到请求头
    const signature = sign('POST', path, {}, headers, credentials);
    headers['authorization'] = signature;
    
    // 构建完整的请求 URL
    const url = `http://${projectName}.${endpoint}${path}`;
    
    // 发送请求
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body
    });
    return response;
  };
};