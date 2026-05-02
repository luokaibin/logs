import { AppState } from "react-native";
import { enqueueMessage } from "../common/messageQueue.js";

let listenerRegistered = false;
let appStateSubscription = null;
let currentAppState = AppState.currentState || "active";

/**
 * 注册 RN 生命周期监听（幂等，只注册一次）。
 * - 启动时投递 page-load
 * - active -> 非 active：投递 page-hidden（触发 flush）
 * - 非 active -> active：投递 page-visible
 */
export function setupLifecycleListeners() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  enqueueMessage({ type: "page-load" });

  appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
    const prev = currentAppState;
    currentAppState = nextAppState;

    if (prev !== "active" && nextAppState === "active") {
      enqueueMessage({ type: "page-visible" });
      return;
    }

    if (prev === "active" && (nextAppState === "inactive" || nextAppState === "background")) {
      enqueueMessage({ type: "page-hidden" });
    }
  });
}

/**
 * 可选：用于测试或手动释放监听。
 */
export function teardownLifecycleListeners() {
  if (appStateSubscription && typeof appStateSubscription.remove === "function") {
    appStateSubscription.remove();
  }
  appStateSubscription = null;
  listenerRegistered = false;
}

