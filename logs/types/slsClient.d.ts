/**
 * 阿里云日志服务客户端类型定义
 */

/**
 * 创建阿里云日志服务客户端
 * @param endpoint - 服务入口，例如 "ap-southeast-1.log.aliyuncs.com"
 * @param accessKeyId - 阿里云访问密钥ID
 * @param accessKeySecret - 阿里云访问密钥密码
 * @param projectName - 项目名称
 * @param logstoreName - 日志库名称
 * @returns 返回一个用于发送日志的函数
 */
export function createLogClient(
  endpoint: string,
  accessKeyId: string,
  accessKeySecret: string,
  projectName: string,
  logstoreName: string
): SendLogsFunction;

/**
 * 发送序列化后的日志数据的函数
 * @param payload - 已经序列化的日志数据
 * @returns HTTP 响应对象
 */
export type SendLogsFunction = (payload: Uint8Array) => Promise<Response>;
