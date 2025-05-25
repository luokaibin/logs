import slsEncoder from './logEncoder.js'
import { generateLog } from '../browser/beacon.js'
// 使用自执行函数，将依赖作为参数传入
(function() {
  // 在 document 就绪时执行的函数
  generateLog(slsEncoder)
})();
