# React Native Logbeacon 示例

在真机/模拟器上验证 `@logbeacon/react-native`：SQLite 缓冲、聚合、去重与上报；交互按钮与 `examples/next-log-test/app/page.tsx` 对齐（info / error / 去重 / burst / 手动 flush）。

## 前置条件

1. 仓库根目录 `pnpm install`。若 pnpm 提示忽略依赖构建脚本，请对本仓库允许的包执行一次 `pnpm approve-builds`（否则 `react-native-quick-sqlite` 原生侧可能未正确安装）。
2. 构建 RN 日志包（示例依赖其 `dist`）：
   ```bash
   pnpm --filter @logbeacon/react-native build
   ```
3. （可选）联调 Next 占位接口：另开终端根目录 `pnpm --filter next-log-test dev`，浏览器包会先同步 beacon；RN 默认 beacon 为：
   - **iOS 模拟器**：`http://localhost:3100/api/beacon`
   - **Android 模拟器**：`http://10.0.2.2:3100/api/beacon`  
   真机请改为电脑的局域网 IP（且 Next dev 需监听 `0.0.0.0` 或使用隧道）。

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

首次 iOS 需在 `examples/rn-log-test/ios` 执行 `bundle exec pod install`（参见 CLI 初始化提示）。

### Android：`SDK location not found`

报错里若出现 **`ANDROID_HOME`** 或 **`local.properties` / `sdk.dir`**，与网络、代理**无关**，是本机未告诉 Gradle **Android SDK 路径**。

任选其一即可：

1. **环境变量**（当前终端或写入 `~/.zshrc`）：
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   ```
   SDK 若装在其他位置，改成实际目录（Android Studio → Settings → Android SDK 里可见）。

2. **项目级**（路径按你本机修改；该文件已在 `.gitignore` 中，勿提交）：
   ```bash
   echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
   ```
   在示例根目录 `examples/rn-log-test` 下执行。

### Android：依赖下载 / TLS 握手失败

若报错包含 `plugins.gradle.org`、`Remote host terminated the handshake`、`TLS protocol`，通常是访问 Gradle 插件仓库的网络或 Java TLS 环境问题（与「找不到 gradle-plugin 目录」不同）。`android/settings.gradle` 已配置优先 `google()` / `mavenCentral()` 再 `gradlePluginPortal()`，可减少对插件门户的直接依赖。

仍失败时可自查：**JDK 17+**（Android Studio 自带 JBR）、关闭干扰 HTTPS 的代理/VPN、或在公司网络换热点试一次；国内可考虑自行配置阿里云等 Maven 镜像（需在 `pluginManagement.repositories` 中按需添加）。

## 说明

- 使用 **pnpm** 时，`@react-native/gradle-plugin`、`@react-native/codegen` 等默认嵌套在 `react-native` 内部，Gradle/React Native 会从 **`项目根/node_modules/@react-native/...`** 解析路径。本示例已在 `devDependencies` 中**显式声明** `@react-native/gradle-plugin` 与 `@react-native/codegen`（版本均与 `react-native` 一致），`pnpm install` 后上述目录会出现在示例的 `node_modules` 下。
- Metro：**勿**把仓库根 `node_modules` 放进 `resolver.nodeModulesPaths`（否则会编到 `react-native@0.85` 等）。当前仅保留示例自身 `node_modules`，并对 `react-native` / `react` / `@babel/runtime` 使用 **`resolveRequest` + `require.resolve(..., { paths: [projectRoot] })`**；`watchFolders` 仍包含仓库根 `node_modules` 以便监视 pnpm 真实路径。仍异常时可 `pnpm start -- --reset-cache`。
- Android 已开启 `usesCleartextTraffic`，便于开发环境访问 HTTP beacon。
- 库在导入时会注册 `AppState` 生命周期（`page-hidden` 时会 flush）；界面上的 **requestFlush()** 对应 Web 的 `logbeacon:flush`。
