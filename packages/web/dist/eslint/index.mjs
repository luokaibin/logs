function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

/**
 * @fileoverview Rule to prefer log.xxx over console.xxx
 */

const MESSAGE_ID = "preferLogOverConsole";
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
      [MESSAGE_ID]: `请使用 log 对象进行日志输出，支持的方法有: 
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
            messageId: MESSAGE_ID,
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
              messageId: MESSAGE_ID,
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

var eslint = {
  rules: {
    "prefer-log-over-console": preferLogOverConsole
  },
  configs: {
    recommended: {
      plugins: ["logs-transform"],
      rules: {
        "logs-transform/prefer-log-over-console": "warn"
      }
    }
  }
};

var index = /*@__PURE__*/getDefaultExportFromCjs(eslint);

export { index as default };
