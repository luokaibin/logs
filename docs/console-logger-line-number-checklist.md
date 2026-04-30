# ConsoleLogger 行号保留验收清单

目标：确认 `packages/core/common/ConsoleLogger.js` 在保留 level/filter/forwardLog 能力的同时，控制台来源行号表现与 `logs/core/logs.js` 持平。

## 1) 基础场景：来源行号是否指向业务文件

- 在业务代码里准备如下调用：
  - `log.debug("line-check-debug")`
  - `log.info("line-check-info")`
  - `log.warn("line-check-warn")`
  - `log.error("line-check-error")`
- 打开浏览器 DevTools Console，观察每条日志右侧来源。
- 通过：来源应落在业务调用文件（或其 sourcemap 映射后位置），不应稳定固定在日志库内部同一行。

## 2) 级别控制：低级别日志被抑制且不影响行号表现

- 执行：`log.setLevel("WARN")`
- 再次打印 `debug/info/warn/error`。
- 通过：
  - `debug/info` 不打印；
  - `warn/error` 正常打印；
  - `warn/error` 来源仍指向业务调用点。

## 3) 关键词过滤：命中过滤时来源保持正确

- 执行：`log.setKeyWords("[BIZ]")`
- 打印：
  - `log.info("[BIZ] keyword-hit")`
  - `log.info("[OTHER] keyword-miss")`
- 通过：
  - `keyword-hit` 打印；
  - `keyword-miss` 不打印；
  - `keyword-hit` 的来源仍指向业务调用点。

## 4) 日志转发：forwardLog 不应破坏控制台定位

- 保持已有 `forwardLog`（例如 `sendLog`）开启。
- 打印 `debug/info/warn/error` 并确认控制台显示。
- 通过：
  - 转发链路仍收到日志；
  - 控制台来源不退化为日志库内部固定行。

## 5) 横向对比：与旧实现对齐

- 在同一页面、同一浏览器中，对比：
  - 旧 `logs/core/logs.js` 导出的 `log`
  - 新 `packages/web/core/logs.js` 导出的 `log`
- 通过：两者在“来源定位到业务调用点”的表现上持平（允许偶发 1-2 行偏差，但不能长期固定到库内部）。

## 6) 回归项：功能不回退

- 确认下列能力正常：
  - `setLevel` 持久化读写正常；
  - `setKeyWords/getKeyWords` 行为一致；
  - 非字符串首参数日志（对象、Error）不被错误拦截；
  - `trace/debug/info/warn/error` API 仍可直接调用。

