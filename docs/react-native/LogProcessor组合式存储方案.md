# LogProcessor 组合式存储方案

本文档细化 **方案 B**：`LogProcessor` **不再继承** `LogStore`，改为 **组合**（持有 `LogStore` 实例并委托调用），以便在 Web / React Native 及后续存储后端之间扩展，并与「打包期按平台分割依赖」的策略一致。

---

## 1. 背景与目标

### 1.1 现状问题

当前继承关系为：

```
LogAggregator → LogProcessor → LogStore
```

- `LogProcessor` 通过 **继承** 获得 `LogStore` 的全部持久化能力（`insertLog`、`getMeta`、`getAllLogs` 等）。
- `LogStore` 的实现 **强绑定 IndexedDB + `idb`**，与 RN 所需的 SQLite 无法在同一继承链上无痛替换。
- 继承导致「换存储」等价于 **换父类或复制子类**，不利于单测注入 mock、也不利于多后端并存（例如仅替换存储做 A/B）。

### 1.2 目标

| 目标 | 说明 |
|------|------|
| **组合优于继承** | `LogProcessor` 只负责编解码、去重、元数据补全等业务逻辑；**持久化**由可替换的 `LogStore` 完成。 |
| **显式契约** | 用文档 + 类型（JSDoc / TypeScript）定义 **`LogStore` 接口**，各平台实现该接口即可。 |
| **依赖注入** | 通过构造函数 `options.store` 传入实例；缺省时由**各平台入口**提供默认实现（而非在通用模块里写死 IndexedDB）。 |
| **打包分割** | Web 入口只引用 IndexedDB 实现；RN 入口只引用 SQLite 实现，**不在同一 bundle 内混装两套驱动**（配合独立入口与 Rollup 配置）。 |

---

## 2. 目标架构

### 2.1 继承与组合关系（重构后）

```
LogAggregator → LogProcessor（组合 LogStore）
                    └── this._store: LogStore 接口实现
```

- **`LogAggregator` 仍继承 `LogProcessor`**：聚合、flush、编码器等逻辑不变；仅底层对存储的访问全部经 `LogProcessor` 转发到 `this._store`（或由 `LogProcessor` 提供与原 API 兼容的薄包装）。
- **`LogStore`**：改为 **接口 + 多实现**（如 `LogStoreIndexedDB`、`LogStoreSQLite`），**互不继承 `LogProcessor`**。

### 2.2 职责划分

| 层级 | 职责 |
|------|------|
| **LogStore** | 仅持久化：日志行（二进制）、digest 表、meta KV；`hydrateState` 等读回能力。 |
| **LogProcessor** | 业务：去重（digest 时间窗）、`completeLog`（UA/IP/region）、`encodeLog` / `decodeLog`、与 `_getMeta` 相关的缓存逻辑；**不**关心具体是 IndexedDB 还是 SQLite。 |
| **LogAggregator** | 缓冲策略、flush、`logEncoder`、gzip、上报；继续调用 `insertLog` / `getAllLogs` / `getMeta` / `clearLogs` 等 **由 LogProcessor 暴露的稳定 API**（内部再委托 `_store`）。 |

---

## 3. LogStore 接口（契约）

以下与现有 `logs/common/LogStore.js` 对外行为对齐，实现方需保证语义一致（命名可在重构时微调，但需在 PR 中列出对照表）。

### 3.1 必选方法

| 方法 | 作用 |
|------|------|
| `insertLog(logData)` | 写入一条已编码日志（当前为 `Uint8Array` protobuf）；返回与现网一致（如自增 id）。 |
| `getAllLogs()` | 读出全部待处理日志记录（与现网 decode 流程兼容）。 |
| `clearLogs()` | 清空日志表（flush 成功后调用）。 |
| `setDigest(digest, timestamp)` | 去重摘要写入。 |
| `getAllDigests()` | 读出全部 digest（或供构建内存 Map）。 |
| `clearOldDigests(maxAgeTimestamp)` | 按时间清理过期 digest。 |
| `setMeta(key, value)` | 元数据写入（键为 `META_KEYS` 等字符串；值为可被编码的类型）。 |
| `getMeta(key)` | 读取单 key。 |
| `getAllMeta()` | 读取全部 meta（与 `_getMeta` 冷启动恢复一致）。 |
| `hydrateState()`（可选但推荐） | 与现网一致：并行恢复 logs、digests、deviceInfo、logContext 等，供 SW 冷启动。 |

### 3.2 实现类示例名（仅作引用）

- Web：**`LogStoreIndexedDB`**（由当前 `LogStore.js` 逻辑迁移）。
- RN：**`LogStoreSQLite`**（基于 `react-native-quick-sqlite`，表结构另文/另 PR 定义）。

---

## 4. LogProcessor 改造要点

### 4.1 构造函数

```text
constructor(options = {})
  options.store  —— 必填或由平台入口注入默认实现
  options.dedupInterval 等 —— 保持现有语义
```

- **禁止**在通用 `LogProcessor.js` 顶层 `import` 具体 `LogStoreIndexedDB`，避免 RN bundle 误打包 `idb`。  
- 默认 store 的创建放在 **`sls/beacon-sw.js` / 浏览器入口** 或 **`rn/xxx.js` 入口** 中完成，再 `new LogProcessor({ store, ... })`。

### 4.2 方法委托关系

原 `this.getAllDigests()`、`this.setMeta()` 等若来自父类，改为：

- `this._store.getAllDigests()` 等。

原 `LogProcessor.insertLog(logItem)` 流程保持不变：

1. `dedupLog` → 2. `completeLog` → 3. `encodeLog` → 4. **写入**由 `this._store.insertLog(data)` 完成（替代 `super.insertLog(data)`）。

### 4.3 命名注意

- **存储层** `insertLog`：当前语义为「写入已编码二进制行」。
- **处理器层** `insertLog(logItem)`：完整业务入口。  
若后续混淆，可将存储层方法重命名为 `appendEncodedLog` / `putLogBlob` 等，并在本文件「迁移对照表」中更新。

---

## 5. LogAggregator 与其它调用方

### 5.1 LogAggregator

- 继续使用 `this.insertLog`、`this.getAllLogs`、`this.getMeta`、`this.clearLogs` 等——这些应保留为 **`LogProcessor` 上的公共方法**，内部一律转调 `this._store`，避免 `LogAggregator` 直接依赖 `LogStore` 类型。
- `reset()` → `_clearLogBuffer` / `_clearLogDigestCache` 中凡触及存储的，经 `LogProcessor` 已封装的方法访问 `_store`。

### 5.2 其它文件

- `browser/beacon.js`、`beacon-sw` 内若直接 `new LogProcessor()` / `new LogAggregator()`，需改为传入 **`store` 实例**，或由工厂函数 `createWebLogAggregator()` 封装默认 `IndexedDB` store。

---

## 6. 与打包策略的配合

| 环节 | 说明 |
|------|------|
| **入口分裂** | Web SW / beacon 入口只 `import` Web 版 store 工厂；RN 入口只 `import` SQLite 版。 |
| **Rollup** | `LogProcessor` / `LogAggregator` 打为共享逻辑时，**不包含**具体 `idb` 或 `react-native-quick-sqlite`；二者仅出现在各平台入口 bundle。 |
| **peerDependencies** | `idb`、`react-native-quick-sqlite` 仍建议由宿主声明，库内只做 peer + `external`。 |

组合方案与「显式 `./store/web`、`./store/react-native` 子路径导出」可同时使用：入口文件选择对应 store 实现，再组装 `LogProcessor`。

---

## 7. 迁移顺序建议

1. 将现有 `LogStore` 类重命名/迁移为 **`LogStoreIndexedDB`**（或保留文件名 `LogStore.js` 仅作 Web 实现，视仓库习惯而定）。
2. 定义 **`LogStore` 接口文档**（本文第 3 节）+ JSDoc `@typedef` 或 TypeScript `interface`。
3. 改造 **`LogProcessor`**：组合 `_store`，替换所有 `super.*` 存储调用为 `this._store.*`。
4. 跑通 **现有浏览器 / SW** 全链路（回归测试与手工验证）。
5. 实现 **`LogStoreSQLite`** 与 RN 入口，单独打包验证。
6. （可选）为 `LogProcessor` 增加 **存储 mock** 单元测试。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 遗漏某处仍调用 `super` 导致运行时报错 | 重构 PR 中全局检索 `super.`；补充最小 E2E。 |
| 默认 `store` 未传导致空引用 | 构造函数内对 `options.store` 做断言，错误信息指明由平台入口注入。 |
| 单例 `LogAggregator.getInstance` 跨平台混用 | 文档约定单例仅在同一 JS 运行时（同一 SW 或同一 RN 进程）内有效。 |

---

## 9. 相关文档

- [当前方案存在的问题](./当前方案存在的问题.md)
- [持久化存储方案](./持久化存储方案.md)（SQLite / quick-sqlite 选型）
