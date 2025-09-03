# no-logs-in-component-scope ESLint 规则

## 概述

`no-logs-in-component-scope` 是一个 ESLint 规则，用于检测并避免在 React 组件和自定义 Hooks 的一级作用域中直接调用日志方法，防止因频繁重渲染导致的日志数据过载。

## 目标

- **性能优化**: 避免在每次组件渲染时都调用日志方法
- **代码质量**: 引导开发者将日志放在合适的位置
- **开发体验**: 提供清晰的错误信息和重构建议

## 🚀 新特性 (v1.5.3+)

### 智能错误消息
现在规则提供**上下文相关的错误消息**，针对不同组件类型给出具体建议：

```javascript
// 函数组件
log.info('render'); 
// ❌ 错误：避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。

// 自定义 Hook
log.info('hook called');
// ❌ 错误：避免在自定义 Hook 一级作用域中直接调用日志方法。建议将日志移动到 useEffect 或条件分支中。

// 类组件
log.info('render called');
// ❌ 错误：避免在 React 类组件方法中直接调用日志方法。建议将日志移动到生命周期方法或事件处理函数中。
```

### 增强的组件检测
支持检测更多复杂的组件模式：

- ✅ **条件JSX返回**: `condition ? <div/> : null`
- ✅ **逻辑JSX返回**: `condition && <div/>`
- ✅ **React.createElement**: `React.createElement('div', null, 'Content')`
- ✅ **React.memo**: `React.memo(() => { ... })`
- ✅ **PureComponent**: `class MyComponent extends PureComponent`
- ✅ **匿名默认导出**: `export default () => { ... }`

### Auto-Fix 支持 (实验性)
规则支持**智能修复建议**，可以自动将日志调用移动到合适的位置：

```javascript
// 修复前
function MyComponent() {
  log.info('render'); // 🚫 错误
  return <div>Test</div>;
}

// 修复后
function MyComponent() {
  useEffect(() => {
    log.info('render'); // ✅ 正确
  }, []);
  return <div>Test</div>;
}
```

## 规则详情

### 检测场景

该规则会检测以下情况中的直接日志调用：

1. **React 函数组件** 一级作用域
2. **React 箭头函数组件** 一级作用域  
3. **自定义 Hooks** 一级作用域
4. **React 类组件** 方法中

### 允许的场景

以下场景中的日志调用是**允许的**：

1. **事件处理函数** (`onClick`, `onChange` 等)
2. **useEffect 回调**
3. **useCallback 回调**
4. **useMemo 回调**
5. **useLayoutEffect 回调**
6. **任何嵌套函数** (函数深度 > 1)

## 使用方法

### 基本配置

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['logs-transform'],
  rules: {
    'logs-transform/no-logs-in-component-scope': 'warn'
  }
};
```

### 使用推荐配置

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'plugin:logs-transform/recommended'  // 包含 warn 级别
  ]
};
```

## 配置选项

### 完整配置示例

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['logs-transform'],
  rules: {
    'logs-transform/no-logs-in-component-scope': ['error', {
      checkComponents: true,          // 检查 React 组件
      checkHooks: true,              // 检查自定义 Hooks
      checkClassComponents: true,    // 检查类组件
      componentPatterns: ['^[A-Z]'],  // 组件名称正则模式
      hookPatterns: ['^use[A-Z]'],    // Hook 名称正则模式
      allowedContexts: [             // 允许的上下文
        'useEffect',
        'useCallback', 
        'useMemo',
        'useLayoutEffect',
        'eventHandler'
      ]
    }]
  }
};
```

### 选项说明

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `checkComponents` | `boolean` | `true` | 是否检查 React 组件 |
| `checkHooks` | `boolean` | `true` | 是否检查自定义 Hooks |
| `checkClassComponents` | `boolean` | `true` | 是否检查类组件 |
| `componentPatterns` | `string[]` | `["^[A-Z]"]` | 组件名称的正则表达式模式数组 |
| `hookPatterns` | `string[]` | `["^use[A-Z]"]` | Hook 名称的正则表达式模式数组 |
| `allowedContexts` | `string[]` | `["useEffect", "useCallback", "useMemo", "useLayoutEffect", "eventHandler"]` | 允许使用日志的上下文 |

## 代码示例

### ❌ 错误示例

```javascript
// 函数组件 - 一级作用域中的日志
function MyComponent() {
  log.info('component rendered'); // ❌ 错误：在组件一级作用域
  return <div>Hello</div>;
}

// 箭头函数组件
const MyComponent = () => {
  log.info('component rendered'); // ❌ 错误：在组件一级作用域
  return <div>Hello</div>;
}

// 自定义 Hook
function useCustomHook() {
  log.info('hook called'); // ❌ 错误：在 Hook 一级作用域
  return useState(null);
}

// 类组件
class MyComponent extends React.Component {
  render() {
    log.info('render called'); // ❌ 错误：在类组件方法中
    return <div>Hello</div>;
  }
}

// 复杂组件模式
function ConditionalComponent({ isVisible }) {
  log.info('render'); // ❌ 错误：支持条件JSX检测
  return isVisible ? <div>Visible</div> : null;
}

function LogicalComponent({ condition }) {
  log.info('render'); // ❌ 错误：支持逻辑JSX检测
  return condition && <div>Content</div>;
}

const MemoComponent = React.memo(() => {
  log.info('render'); // ❌ 错误：支持React.memo检测
  return <div>Test</div>;
});
```

### ✅ 正确示例

```javascript
// 事件处理函数
function MyComponent() {
  const handleClick = () => {
    log.info('button clicked'); // ✅ 正确：在事件处理函数中
  };
  
  return <button onClick={handleClick}>Click me</button>;
}

// useEffect 中的日志
function MyComponent() {
  useEffect(() => {
    log.info('component mounted'); // ✅ 正确：在 useEffect 中
  }, []);
  
  return <div>Hello</div>;
}

// useCallback 中的日志
function MyComponent() {
  const fetchData = useCallback(() => {
    log.info('fetching data'); // ✅ 正确：在 useCallback 中
  }, []);
  
  return <div>Hello</div>;
}

// useMemo 中的日志
function MyComponent() {
  const value = useMemo(() => {
    log.info('computing value'); // ✅ 正确：在 useMemo 中
    return computeExpensiveValue();
  }, [dependency]);
  
  return <div>{value}</div>;
}

// 嵌套函数
function MyComponent() {
  function logUserAction(action) {
    log.info(`User action: ${action}`); // ✅ 正确：在嵌套函数中
  }
  
  return <div>Hello</div>;
}
```

## 最佳实践

### 1. 事件处理日志
```javascript
function MyComponent() {
  const handleUserAction = useCallback((action) => {
    log.info('User action:', { action, timestamp: Date.now() });
    // ... 处理逻辑
  }, []);
  
  return <button onClick={() => handleUserAction('click')}>Click</button>;
}
```

### 2. 生命周期日志
```javascript
function MyComponent({ data }) {
  useEffect(() => {
    log.info('Component mounted with data:', { data });
    
    return () => {
      log.info('Component unmounted');
    };
  }, [data]);
  
  useEffect(() => {
    if (data) {
      log.info('Data updated:', { data });
    }
  }, [data]);
  
  return <div>{data}</div>;
}
```

### 3. 自定义 Hook 日志
```javascript
function useCustomHook(value) {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    log.info('Hook effect triggered:', { value });
    // ... 处理逻辑
  }, [value]);
  
  return state;
}
```

### 4. 性能优化日志
```javascript
function PerformanceComponent({ items }) {
  const [processedItems, setProcessedItems] = useState([]);
  
  useEffect(() => {
    log.info('Processing items:', { count: items.length });
    const processed = items.map(item => ({ ...item, processed: true }));
    setProcessedItems(processed);
  }, [items]);
  
  return (
    <div>
      {processedItems.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

## 禁用规则

如果需要禁用此规则，可以在特定代码块中使用注释：

```javascript
/* eslint-disable logs-transform/no-logs-in-component-scope */
function MyComponent() {
  log.info('This log is allowed by eslint-disable');
  return <div>Hello</div>;
}
/* eslint-enable logs-transform/no-logs-in-component-scope */
```

## 排查问题

### 常见误报

如果规则在某些合理场景下误报，可以：

1. **调整配置选项**：修改 `allowedContexts` 或 `componentPatterns`
2. **使用注释禁用**：在特定代码块中临时禁用规则
3. **重构代码**：将日志调用移到嵌套函数或合适的生命周期中

### 性能考虑

- 该规则使用了优化的 AST 遍历和作用域分析，性能开销很小
- 预编译的正则表达式确保快速的模式匹配
- 建议在 CI/CD 流程中启用此规则

### 调试技巧

启用详细日志以帮助调试规则行为：

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['logs-transform'],
  rules: {
    'logs-transform/no-logs-in-component-scope': ['error', {
      checkComponents: true,
      debug: true // 启用调试模式（如果支持）
    }]
  }
};
```

## 迁移指南

### 从旧版本升级

如果你正在从 v1.5.2 或更早版本升级：

1. **错误消息变化**：现在提供更具体的错误消息和建议
2. **检测能力增强**：支持更多组件模式和复杂场景
3. **配置兼容**：现有配置完全兼容，无需修改

### TypeScript 支持

规则完全支持 TypeScript 项目：

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@typescript-eslint/eslint-plugin",
        "rules": {
          "no-logs-in-component-scope": "error"
        }
      }
    ]
  }
}
```

## 兼容性

- **ESLint**: 7.0+
- **Node.js**: 14.0+
- **React**: 16.8+ (支持 Hooks)
- **TypeScript**: 4.0+ 完全支持
- **Vue**: 3.0+ (实验性支持)
- **Angular**: 12+ (实验性支持)

## 贡献

欢迎提交问题和拉取请求来改进此规则。请确保：

1. 添加适当的测试用例
2. 遵循现有的代码风格
3. 更新相关文档

## 许可证

MIT License