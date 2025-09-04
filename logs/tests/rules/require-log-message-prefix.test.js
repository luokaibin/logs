import { RuleTester } from 'eslint';
import rule from '../../eslint/rules/require-log-message-prefix.js';

describe('require-log-message-prefix', function() {
  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  });

  // TDD 第一步：基本功能测试
  it('should detect log calls without [xxx] prefix', function() {
    ruleTester.run('require-log-message-prefix', rule, {
      valid: [
        // 正确的[xxx]格式
        {
          code: `log.info('[文案]用户登录成功');`
        },
        {
          code: `log.error('[错误]网络连接失败');`
        },
        {
          code: `log.warn('[警告]内存使用过高');`
        },
        // 非字符串参数应该跳过检查
        {
          code: `log.info(userInfo);`
        },
        {
          code: `log.error(new Error('something'));`
        }
      ],
      invalid: [
        // 缺少[xxx]前缀
        {
          code: `log.info('用户登录成功');`,
          output: `log.info('[文案]用户登录成功');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        {
          code: `log.error('网络连接失败');`,
          output: `log.error('[文案]网络连接失败');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        }
      ]
    });
  });

  // TDD 第二步：测试 ignoreMethods 配置
  it('should respect ignoreMethods configuration', function() {
    const customRuleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    });

    customRuleTester.run('require-log-message-prefix with ignoreMethods', rule, {
      valid: [
        // 被忽略的方法不需要前缀
        {
          code: `log.debug('调试信息');`,
          options: [{ ignoreMethods: ['debug'] }]
        },
        {
          code: `log.trace('跟踪信息');`,
          options: [{ ignoreMethods: ['debug', 'trace'] }]
        }
      ],
      invalid: [
        // 不在忽略列表中的方法仍然需要前缀
        {
          code: `log.info('用户登录');`,
          output: `log.info('[文案]用户登录');`,
          options: [{ ignoreMethods: ['debug'] }],
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        }
      ]
    });
  });

  // TDD 第三步：测试各种[xxx]格式
  it('should accept various [xxx] prefix formats', function() {
    const customRuleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    });

    customRuleTester.run('various prefix formats', rule, {
      valid: [
        // 各种有效的[xxx]格式
        { code: `log.info('[文案]用户登录成功');` },
        { code: `log.info('[用户行为]点击了按钮');` },
        { code: `log.info('[系统]启动完成');` },
        { code: `log.info('[API]请求发送');` },
        { code: `log.info('[UI]页面渲染完成');` },
        // 多字符的[xxx]格式
        { code: `log.info('[网络请求]获取用户数据');` },
        { code: `log.info('[错误处理]捕获异常');` }
      ],
      invalid: [
        // 无效的格式
        {
          code: `log.info('[]用户登录成功');`, // 空的[]
          output: `log.info('[文案][]用户登录成功');`, // 会在前面添加[文案]
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        {
          code: `log.info('[  ]用户登录成功');`, // 只有空白字符的[]
          output: `log.info('[文案][  ]用户登录成功');`, // 会在前面添加[文案]
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        {
          code: `log.info('[文案');`, // 不完整的[
          output: `log.info('[文案][文案');`, // 会在前面添加[文案]
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        {
          code: `log.info('文案]用户登录成功');`, // 缺少[
          output: `log.info('[文案]文案]用户登录成功');`, // 会在前面添加[文案]
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        }
      ]
    });
  });

  // TDD 第四步：测试自动修复功能
  it('should provide auto-fix suggestions', function() {
    const customRuleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    });

    customRuleTester.run('auto-fix functionality', rule, {
      valid: [],
      invalid: [
        {
          code: `log.info('用户登录成功');`,
          output: `log.info('[文案]用户登录成功');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        {
          code: `log.error('网络连接失败');`,
          output: `log.error('[文案]网络连接失败');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        }
      ]
    });
  });
  
  // TDD 第五步：测试边界场景
  it('should handle edge cases correctly', function() {
    const customRuleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    });

    customRuleTester.run('edge cases', rule, {
      valid: [
        // 空字符串应该跳过检查
        { code: `log.info('');` },
        // 只有[xxx]的字符串
        { code: `log.info('[文案]');` },
        // 复杂的[xxx]格式
        { code: `log.info('[用户行为:登录]用户成功登录系统');` },
        // 模板字面量应该跳过检查
        { code: `log.info(\`用户\${name}登录\`);` },
        // 变量引用应该跳过检查
        { code: `log.info(message);` },
        // 数字字面量应该跳过检查
        { code: `log.info(123);` },
        // 布尔值应该跳过检查
        { code: `log.info(true);` },
        // null应该跳过检查
        { code: `log.info(null);` },
        // 对象应该跳过检查
        { code: `log.info({user: 'test'});` }
      ],
      invalid: [
        // 单字符消息
        {
          code: `log.info('A');`,
          output: `log.info('[文案]A');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        },
        // 包含特殊字符
        {
          code: `log.info('用户登录成功！');`,
          output: `log.info('[文案]用户登录成功！');`,
          errors: [{
            message: '日志消息应该以 "[文案]" 格式开头，例如：log.info("[文案]用户登录成功")',
            type: 'CallExpression'
          }]
        }
      ]
    });
  });

  // TDD 第六步：测试所有log方法
  it('should work with all log methods', function() {
    const customRuleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    });

    customRuleTester.run('all log methods', rule, {
      valid: [
        { code: `log.trace('[文案]跟踪信息');` },
        { code: `log.debug('[文案]调试信息');` },
        { code: `log.info('[文案]一般信息');` },
        { code: `log.warn('[文案]警告信息');` },
        { code: `log.error('[文案]错误信息');` }
      ],
      invalid: [
        { code: `log.trace('跟踪信息');`, output: `log.trace('[文案]跟踪信息');`, errors: 1 },
        { code: `log.debug('调试信息');`, output: `log.debug('[文案]调试信息');`, errors: 1 },
        { code: `log.info('一般信息');`, output: `log.info('[文案]一般信息');`, errors: 1 },
        { code: `log.warn('警告信息');`, output: `log.warn('[文案]警告信息');`, errors: 1 },
        { code: `log.error('错误信息');`, output: `log.error('[文案]错误信息');`, errors: 1 }
      ]
    });
  });
});