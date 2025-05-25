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