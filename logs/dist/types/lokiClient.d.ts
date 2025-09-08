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
 * @returns HTTP 响应对象
 */
export type SendLogsFunction = (payload: Uint8Array) => Promise<Response>;

// 纳秒级时间戳
export type TimestampNs = string;

// JSON字符串
export type JsonString = string;

/**
 * Loki 日志流
 */
export interface LokiLogStream {
  stream: Record<string, string>;
  values: [TimestampNs, JsonString][];
}

/**
 * Loki API 的负载结构
 */
export interface LokiPayload {
  streams: LokiLogStream[];
}

/**
 * 解码Loki日志数据。
 * @param payload - 经过 gzip 压缩的日志数据
 * @returns 解码后的 Loki 日志对象
 */
export function decodeLogs(payload: Uint8Array): LokiPayload;
