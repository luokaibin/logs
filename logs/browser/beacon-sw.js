
import {LogAggregator} from '../common/LogAggregator.js';

let taskChain = Promise.resolve();

export const genHandleMessage = (logEncoder) => {
  const logAggregator = LogAggregator.getInstance({
    logEncoder,
    flushInterval: 5 * 60 * 1000, // 5 minutes
    flushSize: 2 * 1024 * 1024,   // 2MB
  });

  const handle = (event) => {
    if (!event.data || typeof event.data !== 'object') {
      return;
    }

    const newTask = () => logAggregator.handleEvent(event.data);
    taskChain = taskChain.then(newTask);
    event.waitUntil(taskChain);
  };

  return (event) => {
    try {
      handle(event);
    } catch (e) {
    }
  };
};
