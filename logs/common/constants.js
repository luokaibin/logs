/**
 * @file 常量定义文件
 */

/**
 * 预先计算好的元数据键的 SHA-256 哈希值，用于在 IndexedDB 中作为键名，以增强隐私性。
 * @const {Object<string, string>}
 */
export const META_KEYS = {
  USER_AGENT: 'd1a7b01b334e95fcda7fcdfb8db01454c05cc42a7227e6fb9ef0a9e77a39f12c',
  IP: 'bb9af5d1915da1fbc132ced081325efcd2e63e4804f96890f42e9739677237a4',
  REGION: 'c697d2981bf416569a16cfbcdec1542b5398f3cc77d2b905819aa99c46ecf6f6',
  LAST_UPDATE_TIME: '0682cd61a299947aa5324230d6d64eb1eef0a9b612cbdd2c7ca25355fb614201',
  LOG_CONTEXT: '5d9a7a8550f5914b8895af9c0dae801a3da0a102e411c2c505efe37f06a011fa',
  DEVICE_INFO: '21a3e33a692087232505500814a270279612f026e66e2125133d81b402177fe3', // for 'deviceInfo'
};
