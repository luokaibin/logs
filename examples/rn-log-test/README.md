# React Native Logbeacon 示例

在真机/模拟器上验证 `@logbeacon/react-native`：nitro-sqlite 本地缓冲、聚合、去重与上报。交互按钮与 [`examples/next-log-test/app/page.tsx`](../next-log-test/app/page.tsx) 对齐（info / error / 去重 / burst / 手动 flush）。

**默认变体**：`@logbeacon/react-native/loki`，联调 [`beacon-decode-server`](../beacon-decode-server)（`:3101`）。

## 前置条件

1. 仓库根目录：

   ```bash
   pnpm install
   ```

   若 pnpm 提示忽略 native 构建脚本，执行 `pnpm approve-builds` 并允许 `react-native-nitro-modules`、`react-native-nitro-sqlite` 等。

   本示例使用 **React Native 0.78.3**（与 `react-native-nitro-modules` 在 Android 上的最低推荐版本对齐，无需 patch）。

2. 构建 RN 日志包（示例依赖其 `dist`）：

   ```bash
   pnpm --filter @logbeacon/react-native build
   ```

3. 启动解码接收端（默认 `BEACON_BACKEND=loki`）：

   ```bash
   pnpm --filter beacon-decode-server start
   ```

   解码结果追加到 `examples/beacon-decode-server/decoded-output.ndjson`。

## 运行

```bash
pnpm --filter rn-log-test start
```

另开终端：

```bash
pnpm --filter rn-log-test ios
# 或
pnpm --filter rn-log-test android
```

根目录也可：`pnpm run dev:rn`（先 build 核心包再启动 Metro）。

首次 iOS 需在 `examples/rn-log-test/ios` 执行：

```bash
bundle install && bundle exec pod install
```

### 默认 Beacon URL

| 环境 | URL |
|------|-----|
| iOS 模拟器 | `http://localhost:3101/api/beacon` |
| Android 模拟器 | `http://10.0.2.2:3101/api/beacon` |
| 真机 | 在 App 内改为电脑局域网 IP，如 `http://192.168.x.x:3101/api/beacon` |

连通性自检（手机浏览器或 curl）：

```bash
curl -sS http://127.0.0.1:3101/api/beacon/health
```

## 测试场景

| 按钮 | 行为 |
|------|------|
| 发送 info 测试日志 | `log.info(...)` |
| 发送 error 测试日志 | `log.error(new Error(...))` |
| 去重测试 | 相同 `dedup-test-${Date.now()}` 连发 2 条 `info` |
| 连发 6 条 | 6 条不同内容的 `info` |
| requestFlush() | 立即触发上报 |

调试输出：Metro / 原生 Console 中带 `[log store]`、`[log aggregator]`、`[logbeacon]` 等前缀。

## 切换 SLS

1. 在 `App.tsx` 将 import 改为 `@logbeacon/react-native/sls`，并更新界面 `BACKEND_LABEL`。
2. 重新构建核心包：`pnpm --filter @logbeacon/react-native build`
3. 重启 Metro（建议 `pnpm start -- --reset-cache`）。
4. 解码服务需匹配：`BEACON_BACKEND=sls pnpm --filter beacon-decode-server start`

## Android 排障

**SDK location not found**：设置 `ANDROID_HOME` 或创建 `android/local.properties`（已 gitignore）：

```bash
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

**Gradle / TLS / 依赖下载失败**（如 `fresco:drawee` + `Remote host terminated the handshake`）：

- 多为访问 `repo.maven.apache.org` 网络或 TLS 问题，**不是** Nitro / 日志包代码问题。
- 示例 `android/settings.gradle` 已配置阿里云 Maven 镜像；改完后执行：
  ```bash
  cd android && ./gradlew --stop && ./gradlew clean && cd ..
  pnpm --filter rn-log-test android
  ```
- 需 **JDK 17+**（推荐 Android Studio 自带 JBR）；仍失败可换热点、关代理/VPN 后重试，或浏览器访问  
  `https://maven.aliyun.com/repository/public` 确认网络。

## Metro / monorepo

- `watchFolders` 包含 `packages/` 与仓库根 `node_modules`（仅监视）。
- `nodeModulesPaths` **仅**示例自身 `node_modules`，避免解析到仓库根其他 RN 版本。
- `@logbeacon/react-native/loki` 与 `/sls` 在 `metro.config.js` 中显式映射到 `packages/react-native/dist/*/logs.js`（Metro 对 `exports` 子路径支持有限）。
- 异常时：`pnpm --filter rn-log-test start -- --reset-cache`

## 版本要求

| 依赖 | 版本 |
|------|------|
| `react` | 19.x（RN 0.78 要求） |
| `react-native` | ≥ 0.78.0（本示例 0.78.3） |
| `react-native-nitro-modules` | ≥ 0.35.0 |
| `react-native-nitro-sqlite` | ≥ 9.0.0 |

## 说明

- `newArchEnabled=true`（nitro 依赖新架构）。
- Android 已开启 `usesCleartextTraffic` 便于 HTTP beacon 开发。
- iOS `NSAllowsLocalNetworking` 已开启，可访问 localhost / 局域网。
- 导入时注册 `AppState` 生命周期（退后台会 flush）。
