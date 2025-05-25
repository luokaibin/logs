
import {getLogAggregator} from '../browser/beacon-sw.js'
import slsEncoder from './logEncoder.js'

const logAggregator = getLogAggregator(slsEncoder)

self.addEventListener('message', function(event) {
  try {
    if (!event.data || typeof event.data !== 'object') return;
    logAggregator.handleEvent(event.data);
  } catch (e) {
  }
});
