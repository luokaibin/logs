/**
 * @fileoverview Rule to avoid direct log calls in React component scope
 */
"use strict";

const MESSAGE_ID = "noLogsInComponentScope";

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "避免在 React 组件一级作用域中直接调用日志方法",
      category: "Best Practices",
      recommended: true,
    },
    schema: [{
      type: "object",
      properties: {
        checkComponents: {
          type: "boolean",
          default: true,
          description: "是否检查 React 组件"
        },
        checkHooks: {
          type: "boolean", 
          default: true,
          description: "是否检查自定义 Hooks"
        },
        checkClassComponents: {
          type: "boolean",
          default: true,
          description: "是否检查类组件"
        },
        componentPatterns: {
          type: "array",
          items: {
            type: "string"
          },
          default: ["^[A-Z]"],
          description: "组件名称的正则表达式模式"
        },
        hookPatterns: {
          type: "array",
          items: {
            type: "string"
          },
          default: ["^use[A-Z]"],
          description: "Hook 名称的正则表达式模式"
        },
        allowedContexts: {
          type: "array",
          items: {
            type: "string",
            enum: ["useEffect", "useCallback", "useMemo", "useLayoutEffect", "eventHandler"]
          },
          default: ["useEffect", "useCallback", "useMemo", "useLayoutEffect", "eventHandler"],
          description: "允许使用日志的上下文"
        }
      },
      additionalProperties: false
    }],
    messages: {
      [MESSAGE_ID]: "避免在 {{contextType}}一级作用域中直接调用日志方法。建议将日志移动到 {{suggestions}}。",
      "noLogsInFunctionComponent": "避免在 React 组件一级作用域中直接调用日志方法。建议将日志移动到 useEffect、useCallback 或事件处理函数中。",
      "noLogsInHook": "避免在自定义 Hook 一级作用域中直接调用日志方法。建议将日志移动到 useEffect 或条件分支中。",
      "noLogsInClassComponent": "避免在 React 类组件方法中直接调用日志方法。建议将日志移动到生命周期方法或事件处理函数中。"
    },
    hasSuggestions: true,
  },
  create(context) {
    const options = (context.options && context.options[0]) || {};
    
    // 配置选项，设置默认值
    const config = {
      checkComponents: options.checkComponents !== false,
      checkHooks: options.checkHooks !== false,
      checkClassComponents: options.checkClassComponents !== false,
      componentPatterns: options.componentPatterns || ["^[A-Z]"],
      hookPatterns: options.hookPatterns || ["^use[A-Z]"],
      allowedContexts: options.allowedContexts || ["useEffect", "useCallback", "useMemo", "useLayoutEffect", "eventHandler"]
    };
    
    // 预编译正则表达式
    const componentRegexes = config.componentPatterns.map(pattern => new RegExp(pattern));
    const hookRegexes = config.hookPatterns.map(pattern => new RegExp(pattern));
    
    // 跟踪函数声明和作用域
    let functionStack = [];
    
    // 检查是否是日志调用
    function isLogCall(node) {
      if (node.type !== 'CallExpression') return false;
      
      const callee = node.callee;
      if (callee.type !== 'MemberExpression') return false;
      
      const object = callee.object;
      const property = callee.property;
      
      return object.type === 'Identifier' && 
             object.name === 'log' &&
             property.type === 'Identifier' &&
             ['trace', 'debug', 'info', 'warn', 'error'].includes(property.name);
    }
    
    // 检查函数是否是 React 组件
    function isReactComponent(node) {
      if (!node || !config.checkComponents) return false;
      
      // 首先检查是否返回JSX - 这是React组件的核心特征
      if (!hasJsxReturnStatement(node)) {
        // 如果没有JSX返回，但使用了React Hooks，也可能是组件
        if (!usesReactHooks(node)) {
          return false;
        }
      }
      
      // 检查函数名模式（可选，但如果有JSX或Hooks使用则可以放宽要求）
      return hasValidComponentName(node) || hasJsxReturnStatement(node) || usesReactHooks(node);
    }
    
    // 检查函数体是否包含JSX返回语句
    function hasJsxReturnStatement(node) {
      if (!node.body || !node.body.body) return false;
      
      function isJsxElement(node) {
        if (!node) return false;
        
        // JSX元素
        if (node.type === 'JSXElement') return true;
        
        // JSX片段  
        if (node.type === 'JSXFragment') return true;
        
        // React.createElement调用
        if (node.type === 'CallExpression' && 
            node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'React' &&
            node.callee.property.name === 'createElement') {
          return true;
        }
        
        // 条件表达式中的JSX
        if (node.type === 'ConditionalExpression') {
          return isJsxElement(node.consequent) || isJsxElement(node.alternate);
        }
        
        // 逻辑表达式中的JSX (如 condition && <div/>)
        if (node.type === 'LogicalExpression') {
          return isJsxElement(node.left) || isJsxElement(node.right);
        }
        
        return false;
      }
      
      // 查找返回语句
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          if (isJsxElement(statement.argument)) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    // 检查函数是否使用React Hooks
    function usesReactHooks(node) {
      if (!node.body || !node.body.body) return false;
      
      const hookPatterns = [
        'useState', 'useEffect', 'useContext', 'useReducer',
        'useCallback', 'useMemo', 'useRef', 'useLayoutEffect',
        'useImperativeHandle', 'useDebugValue'
      ];
      
      // 使用访问过的节点Set避免循环引用
      const visited = new WeakSet();
      
      function checkNode(node) {
        if (!node || visited.has(node)) return false;
        visited.add(node);
        
        if (node.type === 'CallExpression' && 
            node.callee && 
            node.callee.type === 'Identifier' &&
            hookPatterns.includes(node.callee.name)) {
          return true;
        }
        
        // 只检查特定的子节点，避免深度递归
        const childrenToCheck = [];
        
        if (node.type === 'ExpressionStatement' && node.expression) {
          childrenToCheck.push(node.expression);
        }
        if (node.type === 'VariableDeclaration' && node.declarations) {
          childrenToCheck.push(...node.declarations);
        }
        if (node.type === 'VariableDeclarator' && node.init) {
          childrenToCheck.push(node.init);
        }
        
        return childrenToCheck.some(checkNode);
      }
      
      return node.body.body.some(checkNode);
    }
    
    // 检查函数名是否符合组件命名模式
    function hasValidComponentName(node) {
      let functionName = null;
      
      // 函数声明
      if (node.type === 'FunctionDeclaration' && node.id) {
        functionName = node.id.name;
      }
      
      // 变量声明中的箭头函数
      if (node.type === 'ArrowFunctionExpression') {
        const parent = node.parent;
        if (parent && parent.type === 'VariableDeclarator' && parent.id) {
          functionName = parent.id.name;
        }
      }
      
      if (!functionName) return false;
      
      // 检查是否匹配任意的组件模式
      return componentRegexes.some(regex => regex.test(functionName));
    }
    
    // 检查函数是否是自定义 Hook
    function isCustomHook(node) {
      if (!node || !config.checkHooks) return false;
      
      let functionName = null;
      
      // 函数声明：以 use 开头，后面跟大写字母
      if (node.type === 'FunctionDeclaration' && node.id) {
        functionName = node.id.name;
      }
      
      // 箭头函数：变量声明中的箭头函数，以 use 开头
      if (node.type === 'ArrowFunctionExpression') {
        const parent = node.parent;
        if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) {
          functionName = parent.id.name;
        }
      }
      
      if (!functionName) return false;
      
      // 检查是否匹配任意的 hook 模式
      return hookRegexes.some(regex => regex.test(functionName));
    }
    
    // 检查是否在类组件的方法中
    function isInClassComponent(node) {
      if (!config.checkClassComponents) return false;
      
      // 查找父级 ClassDeclaration
      let current = node;
      while (current) {
        if (current.type === 'ClassDeclaration') {
          return isReactClassComponent(current);
        }
        current = current.parent;
      }
      return false;
    }
    
    // 检查类是否为React组件
    function isReactClassComponent(classNode) {
      const superClass = classNode.superClass;
      if (!superClass) return false;
      
      // 检查各种React基类
      if (superClass.type === 'Identifier') {
        // 直接继承: Component, PureComponent
        return ['Component', 'PureComponent'].includes(superClass.name);
      }
      
      // 成员表达式继承: React.Component, React.PureComponent
      if (superClass.type === 'MemberExpression') {
        const object = superClass.object;
        const property = superClass.property;
        
        if (object.type === 'Identifier' && object.name === 'React' &&
            property.type === 'Identifier') {
          return ['Component', 'PureComponent'].includes(property.name);
        }
      }
      
      return false;
    }
    
    // 检查是否在允许的上下文中（如 useEffect, useCallback 等）
    function isInAllowedContext(node) {
      // 检查是否在回调函数中
      let current = node;
      let functionDepth = 0;
      
      while (current) {
        if (current.type === 'FunctionExpression' || 
            current.type === 'ArrowFunctionExpression') {
          functionDepth++;
          
          // 检查是否是 useEffect, useCallback, useMemo 等的回调
          const parent = current.parent;
          if (parent && parent.type === 'CallExpression') {
            const callee = parent.callee;
            if (callee.type === 'Identifier') {
              const hookName = callee.name;
              if (config.allowedContexts.includes(hookName)) {
                return true;
              }
            }
          }
          
          // 检查是否是事件处理函数（嵌套函数）
          if (config.allowedContexts.includes('eventHandler') && functionDepth > 1) {
            return true;
          }
        }
        current = current.parent;
      }
      
      return false;
    }
    
    // 检查是否应该报告错误并返回报告信息
    function getReportInfo(node) {
      if (functionStack.length === 0) return null;
      
      const currentFunction = functionStack[functionStack.length - 1];
      
      // 检查是否在组件、Hook 或类组件中
      const inComponent = isReactComponent(currentFunction);
      const inHook = isCustomHook(currentFunction);
      const inClassComponent = isInClassComponent(node);
      
      if (!inComponent && !inHook && !inClassComponent) {
        return null;
      }
      
      // 检查是否在允许的上下文中
      if (isInAllowedContext(node)) {
        return null;
      }
      
      // 确定报告类型和消息，优先级：类组件 > Hook > 函数组件
      if (inClassComponent) {
        return {
          messageId: 'noLogsInClassComponent',
          contextType: 'React 类组件方法',
          suggestions: '生命周期方法或事件处理函数中'
        };
      } else if (inHook) {
        return {
          messageId: 'noLogsInHook',
          contextType: '自定义 Hook',
          suggestions: 'useEffect 或条件分支中'
        };
      } else if (inComponent) {
        return {
          messageId: 'noLogsInFunctionComponent',
          contextType: 'React 组件',
          suggestions: 'useEffect、useCallback 或事件处理函数中'
        };
      }
      
      return null;
    }
    
    // 生成修复建议
    function getSuggestions(node, reportInfo) {
      const suggestions = [];
      
      // 简单的auto-fix：直接删除错误位置的日志调用
      suggestions.push({
        desc: '删除错误的日志调用',
        fix(fixer) {
          // 查找包含日志调用的ExpressionStatement并删除整个语句
          let currentNode = node;
          while (currentNode) {
            if (currentNode.type === 'ExpressionStatement') {
              return fixer.remove(currentNode);
            }
            currentNode = currentNode.parent;
          }
          // 如果找不到ExpressionStatement，回退到删除节点本身
          return fixer.remove(node);
        }
      });
      
      return suggestions;
    }
    
    return {
      // 进入函数时记录
      ":function"(node) {
        functionStack.push(node);
      },
      
      // 离开函数时移除
      ":function:exit"(node) {
        functionStack.pop();
      },
      
      // 检测调用表达式
      CallExpression(node) {
        if (isLogCall(node)) {
          const reportInfo = getReportInfo(node);
          if (reportInfo) {
            const suggestions = getSuggestions(node, reportInfo);
            
            context.report({
              node,
              messageId: reportInfo.messageId,
              data: {
                contextType: reportInfo.contextType,
                suggestions: reportInfo.suggestions
              },
              suggest: suggestions
            });
          }
        }
      }
    };
  }
};