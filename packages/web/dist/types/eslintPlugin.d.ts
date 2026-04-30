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
 * ESLint规则配置选项
 */
export interface RuleOptions {
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
 * ESLint插件规则集
 */
export interface EslintPluginRules {
  'prefer-log-over-console': Rule.RuleModule;
}

/**
 * ESLint插件配置
 */
export interface EslintPluginConfig {
  plugins: {
    'logs-transform': {
      rules: {
        'prefer-log-over-console': 'warn' | 'error' | 'off' | ['warn' | 'error' | 'off', RuleOptions];
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
  }
}

/**
 * ESLint插件
 */
declare const eslintPlugin: EslintPlugin;

export default eslintPlugin;
