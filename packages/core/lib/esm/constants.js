/**
 * @file 常量定义文件
 */

/**
 * 预先计算好的元数据键的 SHA-256 哈希值，用于在 IndexedDB 中作为键名，以增强隐私性。
 * @const {Object<string, string>}
 */
const META_KEYS = {
  IP: 'bb9af5d1915da1fbc132ced081325efcd2e63e4804f96890f42e9739677237a4',
  REGION: 'c697d2981bf416569a16cfbcdec1542b5398f3cc77d2b905819aa99c46ecf6f6',
  LAST_UPDATE_TIME: '0682cd61a299947aa5324230d6d64eb1eef0a9b612cbdd2c7ca25355fb614201',
  LOG_CONTEXT: '5d9a7a8550f5914b8895af9c0dae801a3da0a102e411c2c505efe37f06a011fa',
  BEACON_URL: '24950352bd3207a680735e5075d9c1256b9c13d1116235b31305dfb256c5470a', // for 'beaconUrl'
};

/**
 * 可作为元数据键持久化的 META_KEYS 哈希值白名单（与 {@link META_KEYS} 的 value 一一对应）。
 * @type {readonly string[]}
 */
const META_KEYS_WHITELIST = Object.freeze(Object.values(META_KEYS));

/** 挂载到全局对象上的属性名，可通过 globalThis[LOG_BEACON_GLOBAL_KEY] 访问 */
const LOG_BEACON_GLOBAL_KEY = "LogBeacon";

export { LOG_BEACON_GLOBAL_KEY, META_KEYS, META_KEYS_WHITELIST };
//# sourceMappingURL=constants.js.map
