# 运行时适配：loglevel 与事件模型（Web → React Native）

本文档记录从 **Web（Service Worker + 浏览器事件）** 迁到 **React Native（单 JS 线程 + 聚合器）** 时，与 **`loglevel`** 及 **事件形态** 相关的结论，供实现与评审对齐。

---

## 1. loglevel 在 React Native 中的使用

### 1.1 与 `localStorage` 的关系

`loglevel`（v1.9.x 等）在浏览器中会尝试把**日志级别**持久化到 `window.localStorage`（key 如 `loglevel`），失败时用 cookie；在 **无 `window` 或存储不可用** 时，持久化会被 **静默跳过**，仅保留**内存中的等级**。

因此：

- **可以在 RN 中继续直接使用 `loglevel`**，不必因没有 Web Storage 而换库。
- 若需避免无意义的 `try/catch` 存储尝试，可在设置等级时使用：  
  `log.setLevel('debug', false)`  
  第二个参数为 **`false`** 表示不尝试持久化到 `localStorage`。

### 1.2 与本库自研逻辑的区别

| 来源 | 说明 |
|------|------|
| **`loglevel` 包** | 只管**等级**与 `console` 输出；RN 下通常**不跨重启**持久化等级（除非自行用 AsyncStorage 恢复后再 `setLevel`）。 |
| **`extendLoglevel`（`utils.js`）** | 关键词过滤等使用 **`window.localStorage`**，与 `loglevel` 无关；RN 侧需**单独**改为 AsyncStorage 或注入实现。 |

### 1.3 小结

继续以 **`loglevel` 作为等级与 console 分发的核心**；RN 入口中显式 `setLevel`；持久化等级与过滤关键词在业务层按需接入 **AsyncStorage**。

---

## 2. Web 端（`browser/beacon.js`）里「事件」在做什么

当前 Web 侧大致有三类与「事件」相关的用法：

| 机制 | 作用 |
|------|------|
| **`postMessage` → Service Worker** | 主线程与 SW 之间传递 `log` / `config-update` / `page-load` / `flush-now` 等结构化消息。 |
| **`CustomEvent('sendLog')` + `window.dispatchEvent`** | SW 尚未就绪时，在同一文档内用 DOM 自定义事件把同结构消息交给主线程里的降级处理（如 `LogProcessor.insertLog`）。 |
| **`window.addEventListener`** | `visibilitychange`、`beforeunload`、`error`、`unhandledrejection`；以及 **`sendLog`**、**`logbeacon:log`**、**`logbeacon:flush`** 等扩展点。 |

前后台切换、加载卸载对应的是 **`visibilitychange`**（hidden/visible）与 **`beforeunload`**，最终都转成 **`sendSWEvent`**，由 SW 内 **`LogAggregator.handleEvent`** 统一处理。

---

## 3. React Native 是否有「与浏览器相同」的原生事件？

**没有与 DOM 对等的全局模型。**

- RN **没有** `window` / `document` / `CustomEvent` / `visibilitychange` / `beforeunload` 这一套 API。
- 与「应用前后台」相关的是 **`AppState`**（`react-native`）：`'active' | 'background' | 'inactive'`，用于替代「页面前后台」语义。
- 应用退出、进程被杀时**没有**可靠的 `beforeunload`；可在进入 **background** 时尽量 **flush**（仍非 100% 保证送达）。
- **全局 JS 错误**：不是 `window.onerror`，常用 **`ErrorUtils.setGlobalHandler`**（API 可能随 RN 版本变化，需查当前文档）或 Error Boundary + 手动上报。
- **Promise 未处理拒绝**：需自行在全局或未处理 rejection 的入口挂钩子（具体 API 依 RN/Hermes 版本而定）。

若指 **「原生层向 JS 发事件」**：存在 **Native Module 事件**（如 `NativeEventEmitter` 订阅原生模块发出的通知），那是**另一套桥接模型**，与浏览器 DOM 事件不同，一般**不必**用来替代「日志聚合器」的内部派发。

---

## 4. 迁到 RN 后，是否应继续用「事件」形式？

### 4.1 结论（推荐）

| 场景 | 建议 |
|------|------|
| **聚合器与 `sendLog` 之间** | **优先不用 DOM 式事件**。改为在 RN 初始化模块里持有 **`LogAggregator`（或等价门面）实例**，直接调用 **`handleEvent({ type, payload })`** 或封装好的 **`emitLog(payload)` / `flush()`**。 |
| **与 Web 对齐的「消息形状」** | 可保留 **`type` / `payload` 与现有 `handleEvent` 一致**，仅把「投递方式」从 `postMessage` / `CustomEvent` 换成 **函数调用**。 |
| **多订阅者、强解耦** | 若确有多个模块监听同一套生命周期，可在 JS 内使用 **`EventEmitter`（Node `events` 包，RN 可用）** 或极薄 pub/sub；**不必**模拟 `window.dispatchEvent`。 |

理由简述：

- Web 用事件是因为 **主线程与 SW 是两个上下文**，必须用 `postMessage` 或同文档内的 `CustomEvent` 做桥。
- RN 迁到 **单线程内** 的聚合器后，**直接调用**更简单、类型更好推、调试更直观，也避免 polyfill `window` / `CustomEvent` 的包袱。

### 4.2 生命周期映射（实现参考）

| Web（`beacon.js`） | React Native（建议） |
|--------------------|----------------------|
| 初始化 / page-load | 应用启动、完成 `initLogBeacon` 后调用 `handleEvent({ type: 'page-load' })` 或直接 `flush` 策略所需逻辑 |
| `visibilitychange` → hidden | `AppState` 变为 `background` / `inactive`（按需区分） |
| `visibilitychange` → visible | `AppState` 变为 `active` |
| `beforeunload` | 无对等；依赖 **background 时 flush** + 定期 flush |
| `logbeacon:flush` | 导出 **`flush()`** 方法供业务调用，内部 `handleEvent({ type: 'flush-now' })` |
| `logbeacon:log` | 导出 **`logFromExternal(...)`** 或让业务继续走 **`log.debug`**（经 `core/logs`） |

---

## 5. `sendLog` 的异步语义（React Native）

对应 `logs/common/utils.js` 中的 **`sendLog`**：Web 侧通过 `postMessage` / `dispatchEvent` 投递后，主线程**不会等待** Service Worker 完成 IndexedDB 写入或网络上报。

在 RN 中建议**保持同一语义**：

| 建议 | 说明 |
|------|------|
| **默认「投递即返回」** | 将 payload **入队**或交给 **`LogAggregator.handleEvent`** 后**立即返回**，**不要**在 `sendLog` 内 **`await`** 完整链路（SQLite 提交、批量落盘、`fetch` 上报等）。 |
| **`async function` 若保留** | 内部仍**避免** `await` 重 IO；必要时仅保留与 Web 一致的「无 await」路径。 |
| **调用方** | 业务侧宜 **`void sendLog(...)`** 或**不**将日志失败当作业务关键路径；日志为**热路径**，不应阻塞用户逻辑。 |
| **例外** | 若合规等场景要求「必须落盘后再继续」，应提供**单独 API**（如 `flushAndWait()` / `persistBarrier()`），**不要**把默认 `sendLog` 改成重 `await`。 |

**结论**：RN 侧 **`sendLog` 与 Web 一致，采用「调用结束、后续异步处理」**；与 [持久化存储方案](./持久化存储方案.md) 中的批量落盘、异步 flush 策略一致。

---

## 6. 与现有文档的关系

- [当前方案存在的问题](./当前方案存在的问题.md) — SW / IndexedDB 等不适配点。  
- [LogProcessor组合式存储方案](./LogProcessor组合式存储方案.md) — 存储组合与聚合器职责。  
- [持久化存储方案](./持久化存储方案.md) — SQLite / quick-sqlite 选型。

---

## 7. 修订记录

- 首次编写：记录 **loglevel 在 RN 可用** 及 **RN 侧优先函数调用而非 DOM 事件** 的结论。
- 补充：**RN 侧 `sendLog` 投递即返回、不 await 全链路** 的语义说明。
