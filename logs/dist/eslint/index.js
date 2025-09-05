'use strict';

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

/**
 * @fileoverview Rule to avoid direct log calls in React component scope
 */

const MESSAGE_ID$2 = "noLogsInComponentScope";

/** @type {import('eslint').Rule.RuleModule} */
var noLogsInComponentScope = {
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
      [MESSAGE_ID$2]: "避免在 {{contextType}}一级作用域中直接调用日志方法。建议将日志移动到 {{suggestions}}。",
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
            const suggestions = getSuggestions(node);
            
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

/**
 * @fileoverview Rule to prefer log.xxx over console.xxx
 */

const MESSAGE_ID$1 = "preferLogOverConsole";
const DEFAULT_IMPORT_SOURCE = "logbeacon";
const DEFAULT_IMPORT_NAME = "log";

const DEFAULT_METHOD_MAP = {
  log: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  trace: "trace"
};

/** @type {import('eslint').Rule.RuleModule} */
var preferLogOverConsole = {
  meta: {
    type: "suggestion",
    docs: {
      description: "建议使用 log.xxx 而不是 console.xxx",
      category: "Best Practices",
      recommended: true,
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          importSource: { type: "string" },
          importName: { type: "string" },
          methodMap: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      [MESSAGE_ID$1]: `请使用 log 对象进行日志输出，支持的方法有: 
- log.trace————用来跟踪代码执行流程、用户行为
- log.debug————用来调试代码
- log.info————用来记录一般信息
- log.warn————用来记录警告信息
- log.error————用来记录错误信息`
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const importSource = options.importSource || DEFAULT_IMPORT_SOURCE;
    const importName = options.importName || DEFAULT_IMPORT_NAME;
    const methodMap = { ...DEFAULT_METHOD_MAP, ...(options.methodMap || {}) };
    
    // 跟踪导入状态
    let importInfo = {
      hasImport: false,
      lastImportNode: null,
      isESM: true // 默认假设是ESM
    };
    
    // 检查是否有解构赋值的console
    let destructuredConsole = new Set();
    
    return {
      // 检查导入语句
      ImportDeclaration(node) {
        if (node.source.value === importSource) {
          const hasDefaultImport = node.specifiers.some(spec => 
            spec.type === "ImportDefaultSpecifier" && 
            spec.local.name === importName);
          
          if (hasDefaultImport) {
            importInfo.hasImport = true;
          }
        }
        // 记录最后一个导入语句
        importInfo.lastImportNode = node;
      },
      
      // 检查 CommonJS require
      "VariableDeclarator[init.callee.name='require']"(node) {
        if (node.init.arguments[0].value === importSource) {
          if (node.id.type === "Identifier" && node.id.name === importName) {
            importInfo.hasImport = true;
            importInfo.isESM = false;
          }
        }
      },
      
      // 检查console的解构赋值
      "VariableDeclarator[init.name='console']"(node) {
        if (node.id.type === "ObjectPattern") {
          node.id.properties.forEach(prop => {
            if (prop.key.name && Object.keys(methodMap).includes(prop.key.name)) {
              destructuredConsole.add(prop.value.name);
            }
          });
        }
      },
      
      // 检测 console.xxx 调用
      "CallExpression[callee.object.name='console']"(node) {
        const method = node.callee.property.name;
        
        if (Object.keys(methodMap).includes(method)) {
          context.report({
            node,
            messageId: MESSAGE_ID$1,
            fix(fixer) {
              const fixes = [];
              
              // 根据映射替换方法
              const logMethod = methodMap[method];
              fixes.push(fixer.replaceText(node.callee, `${importName}.${logMethod}`));
              
              // 如果需要，添加导入语句
              if (!importInfo.hasImport) {
                if (importInfo.lastImportNode) {
                  // 在最后一个导入语句后添加
                  fixes.push(
                    fixer.insertTextAfter(
                      importInfo.lastImportNode, 
                      `\nimport ${importName} from "${importSource}";`
                    )
                  );
                } else if (context.sourceCode.ast.body.length > 0) {
                  // 在文件开头添加
                  fixes.push(
                    fixer.insertTextBefore(
                      context.sourceCode.ast.body[0], 
                      `import ${importName} from "${importSource}";\n\n`
                    )
                  );
                }
                importInfo.hasImport = true;
              }
              
              return fixes;
            }
          });
        }
      },
      
      // 检测解构后的console方法调用
      CallExpression(node) {
        if (node.callee.type === "Identifier" && 
            destructuredConsole.has(node.callee.name)) {
          
          // 找到对应的原始console方法
          let originalMethod = null;
          for (const [method, value] of Object.entries(methodMap)) {
            if (node.callee.name === method) {
              originalMethod = method;
              break;
            }
          }
          
          if (originalMethod) {
            context.report({
              node,
              messageId: MESSAGE_ID$1,
              fix(fixer) {
                const fixes = [];
                
                // 替换为log方法
                const logMethod = methodMap[originalMethod];
                fixes.push(fixer.replaceText(node.callee, `${importName}.${logMethod}`));
                
                // 如果需要，添加导入语句
                if (!importInfo.hasImport) {
                  if (importInfo.isESM) {
                    if (importInfo.lastImportNode) {
                      fixes.push(
                        fixer.insertTextAfter(
                          importInfo.lastImportNode, 
                          `\nimport ${importName} from "${importSource}";`
                        )
                      );
                    } else if (context.sourceCode.ast.body.length > 0) {
                      fixes.push(
                        fixer.insertTextBefore(
                          context.sourceCode.ast.body[0], 
                          `import ${importName} from "${importSource}";\n\n`
                        )
                      );
                    }
                  } else {
                    // CommonJS 导入
                    if (context.sourceCode.ast.body.length > 0) {
                      fixes.push(
                        fixer.insertTextBefore(
                          context.sourceCode.ast.body[0], 
                          `const ${importName} = require("${importSource}");\n\n`
                        )
                      );
                    }
                  }
                  importInfo.hasImport = true;
                }
                
                return fixes;
              }
            });
          }
        }
      }
    };
  }
};

/**
 * @fileoverview Rule to require log messages start with [xxx] format
 * 支持字符串字面量和模板字符串的自动修复，对于其他表达式类型会提示手动修复
 */

const MESSAGE_ID = "requireLogMessagePrefix";

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "要求日志消息以 [文案] 格式开头（支持字符串字面量和模板字符串自动修复）",
      category: "Best Practices",
      recommended: true,
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          ignoreMethods: {
            type: "array",
            items: { type: "string" },
            default: [],
            description: "忽略的方法名列表，不传递则检查所有方法"
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      [MESSAGE_ID]: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
      [`${MESSAGE_ID}NoFix`]: '日志消息应该以 "[文案]" 格式开头，请手动添加前缀。支持字符串字面量和模板字符串的自动修复。'
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const ignoreMethods = options.ignoreMethods || [];
    
    // 检测是否是 log.xxx 调用
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
    
    // 检查是否是被忽略的方法
    function isIgnoredMethod(node) {
      const methodName = node.callee.property.name;
      return ignoreMethods.includes(methodName);
    }
    
    // 检查字符串是否以[xxx]格式开头
    function hasValidPrefix(str) {
      if (typeof str !== 'string') return false;
      // 空字符串跳过检查
      if (str.length === 0) return true;
      // 正则表达式：以[开头，中间可以是任何内容（包括空格），但不能是空括号，以]结尾
      return /^\[[^\]]+\]/.test(str);
    }
    
    return {
      CallExpression(node) {
        // 检查是否是 log.xxx 调用
        if (!isLogCall(node)) return;
        
        // 检查是否被忽略
        if (isIgnoredMethod(node)) return;
        
        // 检查第一个参数 - 支持字符串字面量、模板字符串和其他表达式
        const firstArg = node.arguments[0];
        if (!firstArg) return;
        
        // 处理字符串字面量
        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          if (!hasValidPrefix(firstArg.value)) {
            context.report({
              node,
              messageId: MESSAGE_ID,
              fix(fixer) {
                // 自动修复：在字符串前添加[文案]
                const originalValue = firstArg.value;
                const newValue = `[文案]${originalValue}`;
                // 保持原始字符串的引号格式
                const quote = firstArg.raw.charAt(0);
                return fixer.replaceText(firstArg, `${quote}${newValue}${quote}`);
              }
            });
          }
        }
        // 处理模板字符串
        else if (firstArg.type === 'TemplateLiteral') {
          const firstQuasi = firstArg.quasis[0];
          if (firstQuasi && !hasValidPrefix(firstQuasi.value.raw)) {
            context.report({
              node,
              messageId: MESSAGE_ID,
              fix(fixer) {
                // 自动修复：在模板字符串的第一个quasi前添加[文案]
                const originalCode = context.getSourceCode().getText(firstArg);
                const newCode = originalCode.replace(/^`/, '`[文案]');
                return fixer.replaceText(firstArg, newCode);
              }
            });
          }
        }
        // 处理其他非字面量表达式（变量、成员表达式、二元表达式等）
        else {
          context.report({
            node,
            messageId: `${MESSAGE_ID}NoFix`
          });
        }
      }
    };
  }
};

var requireLogMessagePrefix = rule;

var eslint = {
  rules: {
    "no-logs-in-component-scope": noLogsInComponentScope,
    "prefer-log-over-console": preferLogOverConsole,
    "require-log-message-prefix": requireLogMessagePrefix
  },
  configs: {
    recommended: {
      plugins: ["logs-transform"],
      rules: {
        "logs-transform/no-logs-in-component-scope": "warn",
        "logs-transform/prefer-log-over-console": "warn",
        "logs-transform/require-log-message-prefix": "warn"
      }
    }
  }
};

var index = /*@__PURE__*/getDefaultExportFromCjs(eslint);

module.exports = index;
