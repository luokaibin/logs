/**
 * Loki 日志服务客户端类型定义
 */

/**
 * 创建 Loki 日志服务客户端
 * @param url - 服务入口，例如 "https://logs-prod-030.grafana.net"
 * @param user - 用户名
 * @param token - loki 有写入日志权限的token
 * @returns 返回一个用于发送日志的函数
 */
export function createLogClient(
  url: string,
  user: string,
  token: string
): SendLogsFunction;

/**
 * 发送序列化后的日志数据的函数
 * @param payload - 已经序列化的日志数据
 * @returns 响应结果，包含 HTTP 响应对象
 */
export type SendLogsFunction = (payload: Uint8Array) => Promise<Response>;
