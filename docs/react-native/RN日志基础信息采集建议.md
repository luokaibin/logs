# RN 日志基础信息采集建议

本文用于整理 React Native 场景下日志建议携带的信息，以及推荐的采集时机（持久化 / 启动时缓存 / 按日志实时获取）。

## 1. platform（iOS / Android）

- 含义：当前设备所属平台。
- 特点：非常稳定，除非更换设备平台，否则不会变化。
- 建议：可持久化；也可在启动时读取后常驻内存。

## 2. osVersion

- 含义：当前系统版本（例如 iOS 17.x、Android 14）。
- 特点：稳定性略低，用户升级系统后会变化。
- 建议：不持久化；每次 APP 启动时获取一次，缓存到内存。

## 3. appVersion（最终决策：不记录）

- 含义：应用版本号（语义化版本，如 `1.8.0`）。
- 特点：稳定性略低，用户升级 APP 后会变化。
- 说明：该字段通常需要额外库（如 `react-native-device-info`）或原生桥接，不属于 `react-native` 核心 API 直出。
- 采集策略：不记录。

## 4. buildNumber（最终决策：不记录）

- 含义：构建号 / 内部版本号（如 iOS `CFBundleVersion`、Android `versionCode`）。
- 特点：与 `appVersion` 一致，升级后变化。
- 说明：该字段通常需要额外库（如 `react-native-device-info`）或原生桥接，不属于 `react-native` 核心 API 直出。
- 采集策略：不记录。

## 5. 视图信息（最终决策）

### windowWidth / windowHeight

- 含义：当前应用窗口可用区域的宽高（通常来自 `Dimensions.get("window")`）。
- 用途：定位 UI 适配问题（小屏、大屏、分屏、横竖屏切换）。
- 注意：会受横竖屏切换、折叠屏形态变化、多窗口模式影响。
- 采集策略：每条日志打印时获取（读取当前内存中的最新值）。

### pixelRatio

- 含义：像素密度比（逻辑像素到物理像素的比例，常见 2 / 3）。
- 用途：排查图片模糊、边框细线、布局在高密度屏下显示异常等问题。
- 注意：通常较稳定，随设备型号变化，不会在同一会话频繁变化。
- 采集策略：持久化。

### fontScale

- 含义：系统字体缩放系数（用户在系统设置里调大字体后会变大）。
- 用途：排查文案截断、换行异常、控件挤压等可访问性相关问题。
- 注意：属于用户偏好设置，可能在使用期间变化（虽然频率不高）。
- 采集策略：APP 启动时获取一次并缓存到内存。

### orientation

- 含义：当前屏幕方向（竖屏 / 横屏）。
- 用途：定位仅在横屏或旋转后出现的问题。
- 注意：会随着设备旋转即时变化。
- 采集策略：每条日志打印时获取（与 `windowWidth/windowHeight` 保持一致）。

## 6. screenName / previousScreen / routeParams（最终决策：不记录）

- 含义：当前页面名、上一个页面名、路由参数。
- 特点：高频变化，且与用户操作强相关。
- 说明：该类字段依赖业务导航实现（如 `@react-navigation/*`），不属于 `react-native` 核心 API 直出。
- 采集策略：不记录。
- 补充：`routeParams` 需做脱敏与裁剪，避免上报隐私或超大对象。

## 7. launchSource（最终决策：不记录）

- 含义：APP 本次启动来源（如 normal / deeplink / push）。
- 特点：单次会话内稳定，不同启动可能不同。
- 说明：该字段通常依赖 deep link / 推送 SDK 或业务埋点链路，不属于 `react-native` 核心 API 直出。
- 采集策略：不记录。

## 8. networkType（最终决策：不记录）

- 含义：当前网络类型（如 none / wifi / cellular / unknown）。
- 特点：高频变化，用户可在会话中随时切换。
- 说明：该字段通常依赖 `@react-native-community/netinfo` 等额外库，不属于 `react-native` 核心 API 直出。
- 采集策略：不记录。

## 9. isWifi / carrier / locale / timezone（最终决策：不记录）

### isWifi

- 含义：是否处于 Wi-Fi 网络（布尔值）。
- 用途：区分 Wi-Fi 与蜂窝网络下的请求行为差异、失败率差异。
- 注意：与 `networkType` 强相关，可由其推导，但保留独立字段便于查询。

### carrier

- 含义：运营商信息（例如中国移动 / 中国联通 / 中国电信，或海外运营商名）。
- 用途：排查特定运营商网络链路问题、DNS 问题、区域性连接抖动。
- 注意：可能为空（双卡、无 SIM、系统权限限制等场景）。

### locale

- 含义：系统语言与地区设置（如 `zh-CN`、`en-US`）。
- 用途：定位国际化文案、格式化（日期/数字）与语言资源加载问题。
- 注意：用户切换系统语言后会变化。

### timezone

- 含义：设备当前时区（如 `Asia/Shanghai`）。
- 用途：排查时间显示错误、跨时区业务逻辑问题、日志时间对齐问题。
- 注意：用户手动修改时区或出行跨区时会变化。

## 已确认的分层策略（当前版本）

- 持久化层：`platform`
- 持久化层：`pixelRatio`
- 启动缓存层：`osVersion`、`fontScale`
- 实时层（按日志）：`windowWidth`、`windowHeight`、`orientation`
- 不记录：`appVersion`、`buildNumber`、`screenName`、`previousScreen`、`routeParams`、`launchSource`、`networkType`、`isWifi`、`carrier`、`locale`、`timezone`

