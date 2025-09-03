/**
 * ESLint插件类型定义
 */

import type { Rule } from 'eslint';

/**
 * 方法映射配置，定义console方法到log方法的映射
 */
export interface MethodMapConfig {
  log?: string;
  debug?: string;
  info?: string;
  warn?: string;
  error?: string;
  trace?: string;
  [key: string]: string | undefined;
}

/**
 * ESLint规则配置选项 - prefer-log-over-console
 */
export interface PreferLogRuleOptions {
  /**
   * 导入源，默认为 'logbeacon'
   */
  importSource?: string;
  
  /**
   * 导入名称，默认为 'log'
   */
  importName?: string;
  
  /**
   * 方法映射，可自定义 console 方法到 log 方法的映射
   */
  methodMap?: MethodMapConfig;
}

/**
 * ESLint规则配置选项 - no-logs-in-component-scope
 */
export interface NoLogsInComponentScopeOptions {
  /**
   * 是否检查 React 组件，默认为 true
   */
  checkComponents?: boolean;
  
  /**
   * 是否检查自定义 Hooks，默认为 true
   */
  checkHooks?: boolean;
  
  /**
   * 是否检查类组件，默认为 true
   */
  checkClassComponents?: boolean;
  
  /**
   * 组件名称的正则表达式模式数组，默认为 ["^[A-Z]"]
   */
  componentPatterns?: string[];
  
  /**
   * Hook 名称的正则表达式模式数组，默认为 ["^use[A-Z]"]
   */
  hookPatterns?: string[];
  
  /**
   * 允许使用日志的上下文，默认为 ["useEffect", "useCallback", "useMemo", "useLayoutEffect", "eventHandler"]
   */
  allowedContexts?: ('useEffect' | 'useCallback' | 'useMemo' | 'useLayoutEffect' | 'eventHandler')[];
}

/**
 * ESLint插件规则集
 */
export interface EslintPluginRules {
  'prefer-log-over-console': Rule.RuleModule;
  'no-logs-in-component-scope': Rule.RuleModule;
}

/**
 * ESLint插件配置
 */
export interface EslintPluginConfig {
  plugins: {
    'logs-transform': {
      rules: {
        'prefer-log-over-console': 'warn' | 'error' | 'off' | ['warn' | 'error' | 'off', PreferLogRuleOptions];
        'no-logs-in-component-scope': 'warn' | 'error' | 'off' | ['warn' | 'error' | 'off', NoLogsInComponentScopeOptions];
      }
    }
  }
}

/**
 * ESLint插件对象
 */
export interface EslintPlugin {
  /**
   * 插件规则
   */
  rules: EslintPluginRules;
  
  /**
   * 推荐配置
   */
  configs: {
    recommended: EslintPluginConfig;
    'react-strict': EslintPluginConfig;
  }
}

/**
 * ESLint插件
 */
declare const eslintPlugin: EslintPlugin;

export default eslintPlugin;
