/**
 * 将日志数组序列化为 Loki 格式
 * @param {Array} logs - 日志数组
 * @returns {Uint8Array|undefined} - 序列化后的 Loki 格式数据
 */
export default async function logEncoder(logs) {
    // 这里每条日志单独作为一条 value，上报到同一个 stream（可根据需要自定义标签）
    const streamLabels = {
      host: location.hostname,
    };
    
    const values = logs.map(item => {
      // Loki 需要纳秒级时间戳字符串
      const ts = (item.time ? (item.time * 1e6) : (Date.now() * 1e6)).toString();
      // message内容建议为字符串，这里直接序列化整个item
      return [ts, JSON.stringify(item)];
    }).filter(item => item.length === 2 && item[0] && item[1]?.trim()?.length);
    if (!values?.length) return;
    const lokiPayload = {
      streams: [
        {
          stream: streamLabels,
          values: values
        }
      ]
    };
    return new TextEncoder().encode(JSON.stringify(lokiPayload));
}