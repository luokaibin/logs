const { expect } = require('chai');

describe('ESLint Plugin Integration', function() {
  let eslintPlugin;

  before(function() {
    // 加载 ESLint 插件
    eslintPlugin = require('../eslint/index.js');
  });

  describe('Plugin Structure', function() {
    it('should have correct plugin structure', function() {
      expect(eslintPlugin).to.be.an('object');
      expect(eslintPlugin).to.have.property('rules');
      expect(eslintPlugin).to.have.property('configs');
    });

    it('should contain both rules', function() {
      const rules = eslintPlugin.rules;
      expect(rules).to.have.property('prefer-log-over-console');
      expect(rules).to.have.property('no-logs-in-component-scope');
      
      // 验证规则结构
      expect(rules['prefer-log-over-console']).to.have.property('create');
      expect(rules['prefer-log-over-console']).to.have.property('meta');
      expect(rules['no-logs-in-component-scope']).to.have.property('create');
      expect(rules['no-logs-in-component-scope']).to.have.property('meta');
      
      expect(typeof rules['prefer-log-over-console'].create).to.equal('function');
      expect(typeof rules['no-logs-in-component-scope'].create).to.equal('function');
    });

    it('should have correct configs', function() {
      const configs = eslintPlugin.configs;
      expect(configs).to.have.property('recommended');
      
      // 验证推荐配置
      const recommended = configs.recommended;
      expect(recommended).to.have.property('plugins');
      expect(recommended).to.have.property('rules');
      expect(recommended.rules).to.have.property('logs-transform/prefer-log-over-console');
      expect(recommended.rules).to.have.property('logs-transform/no-logs-in-component-scope');
    });
  });

  describe('Rule Metadata', function() {
    it('should have correct prefer-log-over-console metadata', function() {
      const rule = eslintPlugin.rules['prefer-log-over-console'];
      const meta = rule.meta;
      
      expect(meta).to.have.property('type', 'suggestion');
      expect(meta).to.have.property('docs');
      expect(meta).to.have.property('fixable', 'code');
      expect(meta).to.have.property('schema');
      expect(meta).to.have.property('messages');
      
      expect(meta.docs).to.have.property('description');
      expect(meta.docs).to.have.property('category');
      expect(meta.docs).to.have.property('recommended', true);
    });

    it('should have correct no-logs-in-component-scope metadata', function() {
      const rule = eslintPlugin.rules['no-logs-in-component-scope'];
      const meta = rule.meta;
      
      expect(meta).to.have.property('type', 'suggestion');
      expect(meta).to.have.property('docs');
      expect(meta).to.have.property('schema');
      expect(meta).to.have.property('messages');
      
      expect(meta.docs).to.have.property('description');
      expect(meta.docs).to.have.property('category');
      expect(meta.docs).to.have.property('recommended', true);
      
      // 验证配置选项 schema
      expect(meta.schema).to.be.an('array');
      expect(meta.schema).to.have.length(1);
      const schema = meta.schema[0];
      expect(schema).to.have.property('type', 'object');
      expect(schema).to.have.property('properties');
      
      const properties = schema.properties;
      expect(properties).to.have.property('checkComponents');
      expect(properties).to.have.property('checkHooks');
      expect(properties).to.have.property('checkClassComponents');
      expect(properties).to.have.property('componentPatterns');
      expect(properties).to.have.property('hookPatterns');
      expect(properties).to.have.property('allowedContexts');
    });
  });

  describe('Rule Context Creation', function() {
    it('should create context for prefer-log-over-console rule', function() {
      const rule = eslintPlugin.rules['prefer-log-over-console'];
      const mockContext = {
        options: [{}],
        sourceCode: {
          ast: {
            body: []
          }
        },
        report: function() {}
      };
      
      const result = rule.create(mockContext);
      expect(result).to.be.an('object');
      expect(result).to.have.property('CallExpression');
      expect(typeof result.CallExpression).to.equal('function');
    });

    it('should create context for no-logs-in-component-scope rule', function() {
      const rule = eslintPlugin.rules['no-logs-in-component-scope'];
      const mockContext = {
        options: [{}],
        report: function() {}
      };
      
      const result = rule.create(mockContext);
      expect(result).to.be.an('object');
      expect(result).to.have.property(':function');
      expect(result).to.have.property(':function:exit');
      expect(result).to.have.property('CallExpression');
      expect(typeof result[':function']).to.equal('function');
      expect(typeof result[':function:exit']).to.equal('function');
      expect(typeof result.CallExpression).to.equal('function');
    });
  });

  describe('Configuration Validation', function() {
    it('should validate no-logs-in-component-scope options', function() {
      const rule = eslintPlugin.rules['no-logs-in-component-scope'];
      
      // 测试默认配置
      const mockContextDefault = {
        options: [{}],
        report: function() {}
      };
      
      expect(() => rule.create(mockContextDefault)).to.not.throw();
      
      // 测试自定义配置
      const mockContextCustom = {
        options: [{
          checkComponents: false,
          checkHooks: true,
          componentPatterns: ['^My[A-Z]'],
          hookPatterns: ['^use[A-Z]'],
          allowedContexts: ['useEffect', 'useCallback']
        }],
        report: function() {}
      };
      
      expect(() => rule.create(mockContextCustom)).to.not.throw();
    });

    it('should handle missing options gracefully', function() {
      const rule = eslintPlugin.rules['no-logs-in-component-scope'];
      
      // 测试无选项
      const mockContextEmpty = {
        options: [],
        report: function() {}
      };
      
      expect(() => rule.create(mockContextEmpty)).to.not.throw();
      
      // 测试 undefined 选项
      const mockContextUndefined = {
        options: [undefined],
        report: function() {}
      };
      
      expect(() => rule.create(mockContextUndefined)).to.not.throw();
    });
  });

  describe('Plugin Export Compatibility', function() {
    it('should be compatible with ESLint plugin format', function() {
      // 验证插件导出格式符合 ESLint 标准
      expect(eslintPlugin).to.be.an('object');
      expect(eslintPlugin.rules).to.be.an('object');
      expect(eslintPlugin.configs).to.be.an('object');
      
      // 验证规则可以被 ESLint 正确加载
      Object.entries(eslintPlugin.rules).forEach(([name, rule]) => {
        expect(rule).to.have.property('meta');
        expect(rule).to.have.property('create');
        expect(typeof rule.create).to.equal('function');
        expect(rule.meta).to.be.an('object');
      });
    });

    it('should support different config levels', function() {
      const configs = eslintPlugin.configs;
      
      // 推荐配置应该使用 warn 级别
      expect(configs.recommended.rules['logs-transform/prefer-log-over-console']).to.equal('warn');
      expect(configs.recommended.rules['logs-transform/no-logs-in-component-scope']).to.equal('warn');
    });
  });
});