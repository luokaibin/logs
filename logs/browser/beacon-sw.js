
import {LogAggregator} from '../common/LogAggregator.js'

export const getLogAggregator = (logEncoder) => LogAggregator.getInstance({
  logEncoder,
  flushInterval: 5 * 60 * 1000,
  flushSize: 2 * 1024 * 1024,
})
