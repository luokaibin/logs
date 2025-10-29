import Pbf from 'pbf';
import { writeLogGroup } from './sls';

/**
 * 将日志数组序列化为 protobuf 格式
 * @param {Array} logs - 日志数组
 * @param {string} ctxId - 日志上下文ID
 * @returns {Uint8Array|undefined} - 序列化后的二进制数据
 */
export default function logEncoder(logs, ctxId) {
  if (!Array.isArray(logs)) {
    throw new Error('logs must be array!')
  }

  const LogTags = [];
  
  if (ctxId) {
    LogTags.push({
      Key: "__pack_id__",
      Value: ctxId
    });
  }
  // 构建日志对象
  const payload = {
    Logs: logs.map(log => {
      const { time, ...rest } = log;
      
      // 展开 extendedAttributes 到顶层
      const flattened = { ...rest };
      if (rest.extendedAttributes && typeof rest.extendedAttributes === 'object') {
        Object.assign(flattened, rest.extendedAttributes);
        delete flattened.extendedAttributes;
      }
      
      // 创建日志内容
      const logPayload = {
        Time: Math.floor(time / 1000),
        Contents: Object.entries(flattened).reduce((acc, [Key, Value]) => {
          // 卫语句：Key 必须有效，Value 不能是 null 或 undefined
          if (!Key || Value === null || Value === undefined || Value === '') {
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
    LogTags: LogTags
  };
  if (!payload.Logs?.length) return;
  // 创建并编码日志组
  const pbf = new Pbf();
  writeLogGroup(payload, pbf);
  return pbf.finish();
}
