# Next.js Logbeacon 示例

用于在本地验证 `logbeacon`（SLS 浏览器端 beacon + Service Worker）是否能正常注册、写 IndexedDB、接收 `logbeacon:log` / `logbeacon:flush` 事件。

## 前置条件

1. 已安装依赖：`pnpm install`（在 monorepo 根目录）
2. 已构建浏览器包：`pnpm --filter @logbeacon/web build`  
   会生成 `packages/web/dist/sls/beacon.js` 与 `beacon-sw.js`。

## 开发与访问

```bash
pnpm --filter next-log-test dev
```

浏览器打开 <http://localhost:3100>。

`predev` / `prebuild` 会自动执行 `sync-beacon`，将上述两个文件复制到本项目的 `public/beacon/`。

## 说明

- Beacon 脚本在根布局中以 `beforeInteractive` 注入，与官方文档推荐的全局脚本用法一致。
- Service Worker 作用域为 `/beacon/`，静态文件需能通过 `/beacon/beacon-sw.js` 访问（由 `public/beacon` 满足）。
