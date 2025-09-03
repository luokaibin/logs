const { RuleTester } = require('eslint');
const { expect } = require('chai');
const rule = require('../../eslint/rules/no-logs-in-component-scope.js');

describe('no-logs-in-component-scope', function() {
  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  });

  it('should pass ESLint RuleTester standard tests', function() {
    ruleTester.run('no-logs-in-component-scope', rule, {
      valid: [
        // 合理使用场景：在事件处理函数中
        {
          code: `
            function MyComponent() {
              const handleClick = () => {
                log.info('button clicked');
              };
              
              return <button onClick={handleClick}>Click me</button>;
            }
          `
        },
        // 合理使用场景：在 useEffect 中
        {
          code: `
            function MyComponent() {
              useEffect(() => {
                log.info('component mounted');
              }, []);
              
              return <div>Test</div>;
            }
          `
        },
        // 合理使用场景：在 useCallback 中
        {
          code: `
            function MyComponent() {
              const handleClick = useCallback(() => {
                log.info('clicked');
              }, []);
              
              return <button onClick={handleClick}>Click</button>;
            }
          `
        },
        // 合理使用场景：在 useMemo 中
        {
          code: `
            function MyComponent() {
              const value = useMemo(() => {
                log.info('computing value');
                return computeExpensiveValue();
              }, [dependency]);
              
              return <div>{value}</div>;
            }
          `
        },
        // 合理使用场景：在普通函数中（非组件）
        {
          code: `
            function regularFunction() {
              log.info('this is allowed');
              return 'result';
            }
          `
        },
        // TDD: 误报测试 - 大写字母开头的工具函数不应该被误报
        {
          code: `
            function UtilityFunction() {
              log.info('utility function');
              return { config: {} };
            }
          `
        },
        // TDD: 误报测试 - 返回对象的配置函数不应该被误报
        {
          code: `
            const ConfigManager = () => {
              log.info('config loaded');
              return { settings: {} };
            }
          `
        }
      ],
      
      invalid: [
        // 应该检测到的：函数组件一级作用域中的日志
        {
          code: `
            function MyComponent() {
              log.info('render'); // 这应该被检测到
              return <div>Test</div>;
            }
          `,
          errors: [{
            message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            function MyComponent() {
              
              return <div>Test</div>;
            }
          `
              }
            ]
          }]
        },
        // 应该检测到的：箭头函数组件
        {
          code: `
            const MyComponent = () => {
              log.info('render');
              return <div>Test</div>;
            }
          `,
          errors: [{
            message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            const MyComponent = () => {
              
              return <div>Test</div>;
            }
          `
              }
            ]
          }]
        },
        // 应该检测到的：自定义 hooks
        {
          code: `
            function useCustomHook() {
              log.info('hook called');
              return useState(null);
            }
          `,
          errors: [{
            message: '避免在自定义 Hook 一级作用域中直接调用日志方法。建议将日志移动到 useEffect 或条件分支中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            function useCustomHook() {
              
              return useState(null);
            }
          `
              }
            ]
          }]
        },
        // 应该检测到的：类组件
        {
          code: `
            class MyComponent extends React.Component {
              render() {
                log.info('render');
                return <div>Test</div>;
              }
            }
          `,
          errors: [{
            message: '避免在 React 类组件方法中直接调用日志方法。建议将日志移动到生命周期方法或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            class MyComponent extends React.Component {
              render() {
                
                return <div>Test</div>;
              }
            }
          `
              }
            ]
          }]
        },
        // TDD: 漏报测试 - 默认导出的匿名组件应该被检测到
        {
          code: `
            export default () => {
              log.info('default export component');
              return <div>Test</div>;
            }
          `,
          errors: [{
            message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            export default () => {
              
              return <div>Test</div>;
            }
          `
              }
            ]
          }]
        },
        // TDD: 漏报测试 - React.memo包装的组件应该被检测到
        {
          code: `
            const MemoComponent = React.memo(() => {
              log.info('memo component');
              return <div>Test</div>;
            });
          `,
          errors: [{
            message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            const MemoComponent = React.memo(() => {
              
              return <div>Test</div>;
            });
          `
              }
            ]
          }]
        },
        // TDD: 漏报测试 - PureComponent类组件应该被检测到
        {
          code: `
            class MyComponent extends PureComponent {
              render() {
                log.info('pure component render');
                return <div>Test</div>;
              }
            }
          `,
          errors: [{
            message: '避免在 React 类组件方法中直接调用日志方法。建议将日志移动到生命周期方法或事件处理函数中。',
            type: 'CallExpression',
            suggestions: [
              {
                desc: '删除错误的日志调用',
                output: `
            class MyComponent extends PureComponent {
              render() {
                
                return <div>Test</div>;
              }
            }
          `
              }
            ]
          }]
        }
      ]
    });
  });

  describe('Configuration Options', function() {
    it('should respect checkComponents: false option', function() {
      const customRuleTester = new RuleTester({
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        }
      });

      customRuleTester.run('no-logs-in-component-scope with disabled components', rule, {
        valid: [
          // 应该被允许，因为禁用了组件检测
          {
            code: `
              function MyComponent() {
                log.info('render');
                return <div>Test</div>;
              }
            `,
            options: [{ checkComponents: false }]
          }
        ],
        invalid: []
      });
    });

    it('should respect checkHooks: false option', function() {
      const customRuleTester = new RuleTester({
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        }
      });

      customRuleTester.run('no-logs-in-component-scope with disabled hooks', rule, {
        valid: [
          // 应该被允许，因为禁用了 hooks 检测
          {
            code: `
              function useCustomHook() {
                log.info('hook called');
                return useState(null);
              }
            `,
            options: [{ checkHooks: false }]
          }
        ],
        invalid: []
      });
    });

    it('should respect custom componentPatterns option', function() {
      const customRuleTester = new RuleTester({
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        }
      });

      customRuleTester.run('no-logs-in-component-scope with custom patterns', rule, {
        valid: [
          // YourComponent 不匹配 ^My[A-Z] 模式，应该被允许
          {
            code: `
              function YourComponent() {
                log.info('render');
                return 'not jsx';
              }
            `,
            options: [{ componentPatterns: ['^My[A-Z]'] }]
          }
        ],
        invalid: [
          // MyComponent 匹配 ^My[A-Z] 模式，应该被检测
          {
            code: `
              function MyComponent() {
                log.info('render');
                return <div>Test</div>;
              }
            `,
            options: [{ componentPatterns: ['^My[A-Z]'] }],
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression',
              suggestions: [
                {
                  desc: '删除错误的日志调用',
                  output: `
              function MyComponent() {
                
                return <div>Test</div>;
              }
            `
                }
              ]
            }]
          }
        ]
      });
    });
  });

  describe('Edge Cases', function() {
    it('should handle nested component functions correctly', function() {
      const customRuleTester = new RuleTester({
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        }
      });

      customRuleTester.run('nested functions', rule, {
        valid: [
          // 嵌套函数中的日志应该被允许
          {
            code: `
              function OuterComponent() {
                const handleClick = () => {
                  log.info('nested function log');
                };
                return <button onClick={handleClick}>Click</button>;
              }
            `
          }
        ],
        invalid: [
          // 组件一级作用域的日志应该被检测
          {
            code: `
              function OuterComponent() {
                log.info('component level log');
                return <div>Test</div>;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression',
              suggestions: [
                {
                  desc: '删除错误的日志调用',
                  output: `
              function OuterComponent() {
                
                return <div>Test</div>;
              }
            `
                }
              ]
            }]
          }
        ]
      });
    });

    it('should handle non-log function calls correctly', function() {
      const customRuleTester = new RuleTester({
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        }
      });

      customRuleTester.run('non-log calls', rule, {
        valid: [
          // 非 log.xxx 的调用应该被允许
          {
            code: `
              function MyComponent() {
                console.log('console log is allowed');
                someOtherFunction();
                return <div>Test</div>;
              }
            `
          }
        ],
        invalid: []
      });
    });
  });
});