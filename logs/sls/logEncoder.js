import Pbf from 'pbf';
import { writeLogGroup } from './sls';

/**
 * 将日志数组序列化为 protobuf 格式
 * @param {Array} logs - 日志数组
 * @returns {Uint8Array} - 序列化后的二进制数据
 */
export default function logEncoder(logs) {
  if (!Array.isArray(logs)) {
    throw new Error('logs must be array!')
  }
  
  // 构建日志对象
  const payload = {
    Logs: logs.map(log => {
      const { time, ...rest } = log;
      
      // 创建日志内容
      const logPayload = {
        Time: Math.floor(time / 1000),
        Contents: Object.entries(rest).map(([Key, Value]) => {
          // 将值转换为字符串
          return { 
            Key, 
            Value: typeof Value === 'string' ? Value : JSON.stringify(Value) 
          };
        })
      };
      
      return logPayload;
    })
  };
  
  // 创建并编码日志组
  const pbf = new Pbf();
  writeLogGroup(payload, pbf);
  return pbf.finish();
}
  
