import { LogAggregator } from './LogAggregator.js';

let taskChain = Promise.resolve();
/** @type {LogAggregator | null} */
let aggregator = null;

function getAggregator() {
  if (!aggregator) {
    aggregator = new LogAggregator({
      flushInterval: 5 * 60 * 1000,
      flushSize: 3 * 1024 * 1024,
    });
  }
  return aggregator;
}

/**
 * 将消息放入串行任务链，保证日志按投递顺序处理。
 * @param {{ type: string, payload?: any }} message
 * @returns {Promise<void>}
 */
export function enqueueMessage(message) {
  const run = async () => {
    if (!message || typeof message !== "object") return;
    await getAggregator().handleEvent(message);
  };
  taskChain = taskChain.then(run, run);
  return taskChain.catch((error) => {
    console.error("[logbeacon] enqueue message failed:", error);
  });
}

