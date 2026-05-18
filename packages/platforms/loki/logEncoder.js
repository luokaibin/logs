/**
 * 将日志数组序列化为 Loki 格式
 * @param {Array} logs - 日志数组
 * @param {{ ctxId?: string, streamLabels?: Record<string, string> }} context - 编码上下文
 * @returns {Uint8Array|undefined} - 序列化后的 Loki 格式数据
 */
export default function logEncoder(logs, context) {
    const rawLabels = context?.streamLabels ?? {};
    /** @type {Record<string, string>} */
    const streamLabels = {};
    for (const [key, value] of Object.entries(rawLabels)) {
      if (!key || typeof value !== 'string' || !value.trim()) continue;
      streamLabels[key] = value;
    }
    if (!Object.keys(streamLabels).length) {
      throw new Error('Loki: streamLabels must contain at least one label');
    }

    const values = logs.map(item => {
      // Loki 需要纳秒级时间戳字符串
      const ts = (item.time ? (item.time * 1e6) : (Date.now() * 1e6)).toString();

      // 展开 extendedAttributes 到顶层
      const flattened = { ...item };
      if (item.extendedAttributes && typeof item.extendedAttributes === 'object') {
        Object.assign(flattened, item.extendedAttributes);
        delete flattened.extendedAttributes;
      }
      if (item.extendedMeta && typeof item.extendedMeta === 'object') {
        Object.assign(flattened, item.extendedMeta);
        delete flattened.extendedMeta;
      }

      // message内容建议为字符串，这里直接序列化展开后的item
      return [ts, JSON.stringify(flattened)];
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
