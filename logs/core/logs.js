import loglevel from "loglevel";
import { sendLog, extendLoglevel } from "../common/utils.js";

const LOG_METHODS = ["trace", "debug", "info", "warn", "error"];

// 定义一个方法，这个方法返回使用一个proxy，proxy拦截函数执行
const proxyLoglevelFn = (fn, fnName) => {
  return new Proxy(fn, {
    apply: (target, thisArg, argumentsList) => {
      if (!LOG_METHODS.includes(fnName)) {
        return target.apply(thisArg, argumentsList);
      }
      if (typeof window !== "undefined") {
        sendLog(fnName, argumentsList);
      }
      if (typeof argumentsList[0] !== "string") {
        return target.apply(thisArg, argumentsList);
      }
      const keyWords = logFilter.getKeyWords();
      if (!keyWords) {
        return target.apply(thisArg, argumentsList);
      }
      if (!argumentsList[0].startsWith(keyWords)) {
        return;
      }
      return target.apply(thisArg, argumentsList);
    }
  })
}

const log = new Proxy(loglevel, {
  get(target, prop) {
    const orig = target[prop];
    if (typeof orig === 'function') {
      return proxyLoglevelFn(orig, prop);
    }
    if (Object.keys(extendLoglevel).includes(prop)) {
      return extendLoglevel[prop];
    }
    return orig;
  }
});




if (typeof window === 'undefined') {
  let logLevel = typeof process !== 'undefined' && process.env && process.env.LOGS_LEVEL;
  logLevel = logLevel || loglevel.levels.TRACE;
  loglevel.setLevel(logLevel);
}

export default log;
