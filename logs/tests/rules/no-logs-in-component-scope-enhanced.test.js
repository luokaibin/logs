const { RuleTester } = require('eslint');
const { expect } = require('chai');
const rule = require('../../eslint/rules/no-logs-in-component-scope.js');

describe('no-logs-in-component-scope - Enhanced Error Messages', function() {
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

  describe('Enhanced Error Messages', function() {
    it('should provide specific error message for function components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function MyComponent() {
                log.info('render');
                return <div>Test</div>;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should provide specific error message for arrow function components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              const MyComponent = () => {
                log.info('render');
                return <div>Test</div>;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should provide specific error message for custom hooks', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function useCustomHook() {
                log.info('hook called');
                return useState(null);
              }
            `,
            errors: [{
              message: '避免在自定义 Hook 一级作用域中直接调用日志方法。建议将日志移动到 useEffect 或条件分支中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should provide specific error message for class components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
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
              type: 'CallExpression'
            }]
          }
        ]
      });
    });
  });

  describe('Component Detection Improvements', function() {
    it('should detect components with conditional JSX returns', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function ConditionalComponent({ isVisible }) {
                log.info('component render');
                return isVisible ? <div>Visible</div> : null;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should detect components with logical JSX returns', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function LogicalComponent({ condition }) {
                log.info('component render');
                return condition && <div>Content</div>;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should detect components using React.createElement', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function CreateElementComponent() {
                log.info('component render');
                return React.createElement('div', null, 'Content');
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });
  });

  describe('Performance Optimization Tests', function() {
    it('should handle large files efficiently', function() {
      const largeCode = `
        function LargeComponent() {
          log.info('render');
          
          // 模拟大量代码
          const items = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            name: \`Item \${i}\`,
            value: Math.random()
          }));
          
          return (
            <div>
              {items.map(item => (
                <div key={item.id}>{item.name}</div>
              ))}
            </div>
          );
        }
      `;
      
      const startTime = Date.now();
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: largeCode,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
      const endTime = Date.now();
      
      // 验证处理时间不超过100ms
      expect(endTime - startTime).to.be.lessThan(100);
    });

    it('should cache component detection results', function() {
      const code = `
        function Component1() {
          log.info('render1');
          return <div>Component1</div>;
        }
        
        function Component2() {
          log.info('render2');
          return <div>Component2</div>;
        }
      `;
      
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: code,
            errors: [
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              },
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              }
            ]
          }
        ]
      });
    });
  });

  describe('Auto-fix Support Tests', function() {
    it('should provide auto-fix to remove log calls in function components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function MyComponent() {
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

    it('should provide auto-fix to remove log calls in arrow function components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
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
          }
        ]
      });
    });

    it('should provide auto-fix to remove log calls in custom hooks', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
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
          }
        ]
      });
    });

    it('should provide auto-fix to remove log calls in class components', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
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
          }
        ]
      });
    });

    it('should handle multiple log calls with auto-fix', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function MultiLogComponent() {
                log.info('render start');
                const data = fetchData();
                log.warn('data fetched');
                return <div>{data}</div>;
              }
            `,
            errors: [
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression',
                suggestions: [
                  {
                    desc: '删除错误的日志调用',
                    output: `
              function MultiLogComponent() {
                
                const data = fetchData();
                log.warn('data fetched');
                return <div>{data}</div>;
              }
            `
                  }
                ]
              },
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression',
                suggestions: [
                  {
                    desc: '删除错误的日志调用',
                    output: `
              function MultiLogComponent() {
                log.info('render start');
                const data = fetchData();
                
                return <div>{data}</div>;
              }
            `
                  }
                ]
              }
            ]
          }
        ]
      });
    });
  });

  describe('Edge Cases and Complex Scenarios', function() {
    it('should handle components with multiple log calls', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function MultiLogComponent() {
                log.info('render start');
                const data = fetchData();
                log.info('data fetched');
                return <div>{data}</div>;
              }
            `,
            errors: [
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              },
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              }
            ]
          }
        ]
      });
    });

    it('should handle components with hooks and logs', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function HookComponent() {
                const [state, setState] = useState(null);
                log.info('component render');
                
                useEffect(() => {
                  setState('loaded');
                }, []);
                
                return <div>{state}</div>;
              }
            `,
            errors: [{
              message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
              type: 'CallExpression'
            }]
          }
        ]
      });
    });

    it('should handle nested component definitions', function() {
      ruleTester.run('no-logs-in-component-scope', rule, {
        valid: [],
        invalid: [
          {
            code: `
              function OuterComponent() {
                log.info('outer render');
                
                function InnerComponent() {
                  log.info('inner render');
                  return <div>Inner</div>;
                }
                
                return <div><InnerComponent /></div>;
              }
            `,
            errors: [
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              },
              {
                message: '避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。',
                type: 'CallExpression'
              }
            ]
          }
        ]
      });
    });
  });
});