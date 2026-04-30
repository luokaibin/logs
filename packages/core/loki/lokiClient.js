import { gunzipSync } from 'fflate';

/**
 * 解码Loki日志数据。
 * 该函数会先解压 Gzip 数据，然后解析 Loki 的 JSON 结构，
 * 并将内嵌的日志字符串也解析为对象。
 * @param {Uint8Array} payload - 经过 gzip 压缩的日志数据
 * @returns {Object} - 解码后的 Loki 日志对象
 */
export const decodeLogs = (payload) => {
  // 1. 解压
  const decompressed = gunzipSync(payload);
  // 2. 将 Uint8Array 转换为 JSON 字符串
  const jsonString = new TextDecoder().decode(decompressed);
  // 3. 解析为 Loki 负载对象
  const lokiPayload = JSON.parse(jsonString);

  return lokiPayload;
};

/**
 * 创建 loki 日志服务客户端
 * @param {string} url - 服务入口，例如 "https://logs-prod-030.grafana.net"
 * @param {string} user - 用户名
 * @param {string} token - loki 有写入日志权限的token
 * @returns {Function} - 返回一个用于发送日志的函数
 */
export const createLogClient = (url, user, token) => {
  const LOKI_AUTH = 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64');

  /**
   * 发送序列化后的日志数据
   * @param {Uint8Array} payload - 已经序列化的日志数据
   * @returns {Promise<Object>} - 响应结果
   */
  return function sendLogs(payload) {
    return fetch(`${url}/loki/api/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Authorization': LOKI_AUTH,
      },
      body: payload,
      // @ts-ignore
      duplex: 'half',
    });
  };
};