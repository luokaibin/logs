import Pbf from 'pbf';
import { writeLogGroup } from './sls';

/**
 * 将日志数组序列化为 protobuf 格式
 * @param {Array} logs - 日志数组
 * @returns {Uint8Array|undefined} - 序列化后的二进制数据
 */
export default async function logEncoder(logs) {
  if (!Array.isArray(logs)) {
    throw new Error('logs must be array!')
  }
  
  const packId = await this?._generateLogContext?.();
  const pack = packId ? {
    key: "__pack_id__",
    value: packId
  } : undefined;
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
    }).filter(item => !!item?.Contents?.length && !!item?.Time),
    LogTags: [
      pack
    ]
  };
  if (!payload.Logs?.length) return;
  console.log("SLS日志", payload, packId)
  // 创建并编码日志组
  const pbf = new Pbf();
  writeLogGroup(payload, pbf);
  return pbf.finish();
}
