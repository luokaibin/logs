# @logs-transform/eslint-plugin

ESLint 插件，用于规范项目中的日志使用方式，提供自动修复功能来优化日志代码质量。

## 安装

```bash
npm install @logs-transform/eslint-plugin --save-dev
```

## 配置

在 `.eslintrc.js` 中配置：

```javascript
// .eslintrc.js
module.exports = {
  plugins: ["logs-transform"],
  rules: {
    "logs-transform/prefer-log-over-console": "warn",
    "logs-transform/no-logs-in-component-scope": "warn",
    "logs-transform/require-log-message-prefix": "warn",
  },
};
```

对于 `.eslintrc.json` 用户，请移除注释和尾随逗号：

```json
{
  "plugins": ["logs-transform"],
  "rules": {
    "logs-transform/prefer-log-over-console": "warn",
    "logs-transform/no-logs-in-component-scope": "warn",
    "logs-transform/require-log-message-prefix": "warn"
  }
}
```

或者使用推荐配置：

```javascript
// .eslintrc.js
module.exports = {
  extends: ["plugin:logs-transform/recommended"],
};
```

对于 `.eslintrc.json` 用户：

```json
{
  "extends": ["plugin:logs-transform/recommended"]
}
```

## 规则详情

### 1. prefer-log-over-console

**目的**：建议使用 `log.xxx` 而不是 `console.xxx`

**说明**：自动将 `console` 调用转换为 `log` 调用，并自动添加必要的导入语句。

**支持的日志方法**：

- `log.trace` - 用来跟踪代码执行流程、用户行为
- `log.debug` - 用来调试代码
- `log.info` - 用来记录一般信息
- `log.warn` - 用来记录警告信息
- `log.error` - 用来记录错误信息

**配置选项**：

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    "logs-transform/prefer-log-over-console": [
      "warn",
      {
        importSource: "logbeacon", // 默认："logbeacon"
        importName: "log", // 默认："log"
        methodMap: {
          // 方法映射关系
          log: "debug",
          debug: "debug",
          info: "info",
          warn: "warn",
          error: "error",
          trace: "trace",
        },
      },
    ],
  },
};
```

对于 `.eslintrc.json` 用户，请移除注释和尾随逗号：

```json
{
  "rules": {
    "logs-transform/prefer-log-over-console": [
      "warn",
      {
        "importSource": "logbeacon",
        "importName": "log",
        "methodMap": {
          "log": "debug",
          "debug": "debug",
          "info": "info",
          "warn": "warn",
          "error": "error",
          "trace": "trace"
        }
      }
    ]
  }
}
```

**自动修复示例**：

```javascript
// ❌ 错误
console.info("用户登录");

// ✅ 自动修复后
import log from "logbeacon";
log.info("用户登录");
```

### 2. no-logs-in-component-scope

**目的**：避免在 React 组件一级作用域中直接调用日志方法

**说明**：防止在组件渲染时执行不必要的日志记录，建议将日志移动到合适的生命周期或事件处理函数中。

**检查范围**：

- React 函数组件
- 自定义 Hooks
- React 类组件方法

**配置选项**：

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    "logs-transform/no-logs-in-component-scope": [
      "warn",
      {
        checkComponents: true, // 检查 React 组件
        checkHooks: true, // 检查自定义 Hooks
        checkClassComponents: true, // 检查类组件
        componentPatterns: ["^[A-Z]"], // 组件名称匹配模式
        hookPatterns: ["^use[A-Z]"], // Hook 名称匹配模式
        allowedContexts: [
          // 允许使用日志的上下文
          "useEffect",
          "useCallback",
          "useLayoutEffect",
          "eventHandler",
        ],
      },
    ],
  },
};
```

对于 `.eslintrc.json` 用户，请移除注释和尾随逗号：

```json
{
  "rules": {
    "logs-transform/no-logs-in-component-scope": [
      "warn",
      {
        "checkComponents": true,
        "checkHooks": true,
        "checkClassComponents": true,
        "componentPatterns": ["^[A-Z]"],
        "hookPatterns": ["^use[A-Z]"],
        "allowedContexts": [
          "useEffect",
          "useCallback",
          "useMemo",
          "useLayoutEffect",
          "eventHandler"
        ]
      }
    ]
  }
}
```

**错误示例**：

```javascript
// ❌ 错误：在组件一级作用域中调用日志
function UserProfile({ userId }) {
  log.info("[组件]渲染用户信息"); // 每次渲染都会执行

  return <div>User: {userId}</div>;
}

// ❌ 错误：在 Hook 一级作用域中调用日志
function useUserData(userId) {
  log.debug("[Hook]获取用户数据"); // 每次调用都会执行

  return userData;
}
```

**正确示例**：

```javascript
import log from "logbeacon";

// ✅ 正确：在 useEffect 中调用日志
function UserProfile({ userId }) {
  useEffect(() => {
    log.info("[组件]用户信息已加载");
  }, [userId]);

  return <div>User: {userId}</div>;
}

// ✅ 正确：在事件处理函数中调用日志
function LoginForm() {
  const handleSubmit = () => {
    log.info("[事件]用户提交登录表单");
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### 3. require-log-message-prefix

**目的**：要求日志消息以 `[文案]` 格式开头

**说明**：统一日志消息格式，便于日志分类和检索。支持字符串字面量和模板字符串的自动修复，对于其他表达式类型会提示手动添加前缀。

**配置选项**：

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    "logs-transform/require-log-message-prefix": [
      "warn",
      {
        ignoreMethods: ["debug", "trace"], // 忽略特定方法
      },
    ],
  },
};
```

对于 `.eslintrc.json` 用户，请移除注释和尾随逗号：

```json
{
  "rules": {
    "logs-transform/require-log-message-prefix": [
      "warn",
      {
        "ignoreMethods": ["debug", "trace"]
      }
    ]
  }
}
```

**自动修复示例**：

```javascript
// ❌ 错误：字符串字面量
log.info("用户登录成功");

// ✅ 自动修复后
log.info("[文案]用户登录成功");

// ❌ 错误：模板字符串
log.info(`用户${userId}登录`);

// ✅ 自动修复后
log.info(`[文案]用户${userId}登录`);

// ❌ 错误：变量/表达式（无法自动修复，需要手动添加前缀）
log.info(message);
log.info(errorObject);
log.info(123);

// ✅ 已有正确格式
log.warn("[用户]密码错误");
log.error("[网络]请求超时");
```

**支持的表达式类型**：

- **字符串字面量** - 自动修复 ✅
  ```javascript
  log.info("消息"); // → log.info("[文案]消息");
  ```

- **模板字符串** - 自动修复 ✅ 
  ```javascript
  log.info(`用户${name}登录`); // → log.info(`[文案]用户${name}登录`);
  ```

- **变量/表达式** - 手动修复提示 ⚠️
  ```javascript
  log.info(message);     // 需要手动添加前缀
  log.info(errorObj);    // 需要手动添加前缀
  log.info(123);         // 需要手动添加前缀
  ```

**有效的前缀格式**：

- `[用户]` ✅
- `[网络请求]` ✅
- `[数据处理]` ✅
- `[]` ❌ 空内容
- `[ ]` ❌ 仅空白字符

## 推荐配置

```javascript
// .eslintrc.js
module.exports = {
  plugins: ["logs-transform"],
  extends: ["plugin:logs-transform/recommended"],
  rules: {
    // 自定义配置
    "logs-transform/prefer-log-over-console": "error",
    "logs-transform/no-logs-in-component-scope": [
      "warn",
      {
        allowedContexts: ["useEffect", "eventHandler"],
      },
    ],
    "logs-transform/require-log-message-prefix": [
      "warn",
      {
        ignoreMethods: ["debug"],
      },
    ],
  },
};
```

## 最佳实践

1. **统一日志接口**：使用 `log.xxx` 替代 `console.xxx`
2. **合理的日志位置**：避免在组件渲染期间执行日志
3. **标准化日志格式**：使用 `[分类]` 前缀便于检索
4. **适当的日志级别**：
   - `trace`: 详细的执行流程跟踪
   - `debug`: 开发调试信息
   - `info`: 一般业务信息
   - `warn`: 警告信息
   - `error`: 错误信息

## 与其他工具集成

该插件与 `logbeacon` 日志收集系统完美集成，提供完整的客户端日志解决方案。

## License

MIT
