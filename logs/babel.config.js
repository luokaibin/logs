/**
 * Babel 配置文件
 * 
 * 作用说明：
 * 1. 为 ESLint 规则测试提供 JavaScript 转译支持
 * 2. 配合 .mocharc.json 中的 "@babel/register" 使用
 * 3. 允许测试文件使用现代 ES6+ 语法（箭头函数、解构、async/await 等）
 * 4. 确保代码在当前 Node.js 版本下正常运行
 * 
 * .mocharc.json 配置说明：
 * - require: ["@babel/register"] - 加载此 Babel 配置进行代码转译
 * - extensions: ["js"] - 支持 .js 文件测试
 * - spec: "tests/**\/*.test.js" - 测试文件匹配模式
 * - reporter: "spec" - 测试结果输出格式
 * - timeout: 10000 - 测试超时时间（10秒）
 * - slow: 1000 - 慢速测试阈值（1秒）
 * - node-option: ["experimental-specifier-resolution=node"] - Node.js 实验性模块解析
 * 
 * 重要：删除此文件会导致测试无法运行！
 */
module.exports = {
  presets: [
    ['@babel/preset-env', {
      // 目标环境：当前运行的 Node.js 版本
      targets: {
        node: 'current'
      },
      // 模块系统：自动检测并选择合适的模块格式
      modules: 'auto'
    }]
  ]
};