import Pbf from 'pbf';
import { writeLogGroup } from './sls';

/**
 * 日志上下文管理
 */
class LogContext {
  constructor() {
    /** 日志上下文前缀 */
    this.prefix = '';
    /** 日志组ID（十六进制表示） */
    this.logGroupId = 0;
  }

  /**
   * 获取上下文前缀
   * @returns 
   */
  getPrefix() {
    if (!this.prefix) {
      let uuid;
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID();
      } else {
        // 生成 16 字节的随机十六进制字符串
        const hexChars = '0123456789ABCDEF';
        uuid = '';
        for (let i = 0; i < 32; i++) {
          uuid += hexChars[Math.floor(Math.random() * 16)];
        }
      }
      this.prefix = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
    }
    return this.prefix;
  }
  /**
   * 获取日志组ID
   * @returns 
   */
  getLogGroupId() {
    this.logGroupId++;
    // 转换为十六进制字符串并大写
    return this.logGroupId.toString(16).toUpperCase();
  }

  getPackId() {
    // 组合前缀和十六进制的日志组ID
    return `${this.getPrefix()}-${this.getLogGroupId()}`;
  }

  static getInstance() {
    if (!LogContext.instance) {
      LogContext.instance = new LogContext();
    }
    return LogContext.instance;
  }
}

/**
 * 将日志数组序列化为 protobuf 格式
 * @param {Array} logs - 日志数组
 * @returns {Uint8Array} - 序列化后的二进制数据
 */
export default function logEncoder(logs) {
  if (!Array.isArray(logs)) {
    throw new Error('logs must be array!')
  }
  
  const logContext = LogContext.getInstance();
  
  // 构建日志对象
  const payload = {
    Logs: logs.map(log => {
      const { time, ...rest } = log;
      
      // 创建日志内容
      const logPayload = {
        Time: Math.floor(time / 1000),
        Contents: Object.entries(rest).reduce((acc, [Key, Value]) => {
          // 卫语句：Key 必须有效，Value 不能是 null 或 undefined
          if (!Key || Value === null || Value === undefined) {
            return acc;
          }

          const finalValue = typeof Value === 'string' ? Value : JSON.stringify(Value);

          // 过滤转换后为空或纯空格的字符串
          if (!finalValue.trim()) {
            return acc;
          }

          acc.push({ Key, Value: finalValue });
          return acc;
        }, [])
      };
      
      return logPayload;
    }),
    LogTags: [
      {
        Key: "__pack_id__",
        Value: logContext.getPackId()
      }
    ]
  };
  
  // 创建并编码日志组
  const pbf = new Pbf();
  writeLogGroup(payload, pbf);
  return pbf.finish();
}
