/**
 * @fileoverview Rule to require log messages start with [xxx] format
 * 支持字符串字面量和模板字符串的自动修复，对于其他表达式类型会提示手动修复
 */
"use strict";

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

module.exports = rule;