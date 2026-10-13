import { featureKey, getFeatureFlagClient } from "./feature-flags";
import { logger } from "./logger";

/**
 * How often the background heartbeat logs, in seconds. Shared with
 * GET /api/heartbeat so the reported interval and the timer cannot drift.
 */
export const HEARTBEAT_INTERVAL_SECONDS = 2;

/**
 * Starts the background heartbeat timer. It runs for the life of the process
 * and re-reads the `heartbeat` flag on every tick (never cached), so turning
 * the flag off stops the logging at the next tick — within one interval.
 * Logs nothing while the flag is off.
 */
export function startHeartbeatLogging(): NodeJS.Timeout {
  const timer = setInterval(async () => {
    const enabled = await getFeatureFlagClient().getBooleanValue(featureKey("heartbeat"), false);
    if (enabled) {
      logger.error("heartbeat");
    }
  }, HEARTBEAT_INTERVAL_SECONDS * 1000);

  // Don't let the heartbeat timer keep the process alive on its own.
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  return timer;
}

/**
 * How often the fast background heartbeat logs, in seconds. Shared with
 * GET /api/heartbeat/fast so the reported interval and the timer cannot drift.
 */
export const FAST_HEARTBEAT_INTERVAL_SECONDS = 1;

/**
 * Starts the fast background heartbeat timer. Independent of
 * startHeartbeatLogging above: it runs for the life of the process and re-reads
 * the `fast-heartbeat` flag on every tick (never cached), so turning the flag
 * off stops the logging at the next tick — within one second. Logs nothing
 * while the flag is off.
 */
export function startFastHeartbeatLogging(): NodeJS.Timeout {
  const timer = setInterval(async () => {
    const enabled = await getFeatureFlagClient().getBooleanValue(featureKey("fast-heartbeat"), false);
    if (enabled) {
      logger.error("heartbeat-fast");
    }
  }, FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);

  // Don't let the fast heartbeat timer keep the process alive on its own.
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  return timer;
}
