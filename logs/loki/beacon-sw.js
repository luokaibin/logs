
import {getLogAggregator} from '../browser/beacon-sw.js'
import lokiEncoder from './logEncoder.js'

const logAggregator = getLogAggregator(lokiEncoder)

self.addEventListener('message', function(event) {
  try {
    if (!event.data || typeof event.data !== 'object') return;
    logAggregator.handleEvent(event.data);
  } catch (e) {
  }
});
