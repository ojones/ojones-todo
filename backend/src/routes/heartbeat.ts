import { Router } from "express";
import { isFeatureEnabled } from "../feature-flags";
import {
  FAST_HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_INTERVAL_SECONDS,
} from "../heartbeat";

/**
 * Heartbeat API route. Behind the `heartbeat` feature flag
 * (STANDARDS-FEATURE-FLAGS.md) and dark until the Orchestrator releases it:
 * while the flag is off the route answers 404, exactly as if it did not exist.
 */
export const heartbeatRouter = Router();

heartbeatRouter.get("/api/heartbeat", async (_req, res) => {
  if (!(await isFeatureEnabled(res, "heartbeat"))) {
    res.status(404).json({ error: "not found" });
    return;
  }

  res.json({ intervalSeconds: HEARTBEAT_INTERVAL_SECONDS });
});

/**
 * Fast heartbeat API route. Behind its own `fast-heartbeat` feature flag and
 * dark until the Orchestrator releases it: while the flag is off the route
 * answers 404, exactly as if it did not exist. Independent of /api/heartbeat.
 */
heartbeatRouter.get("/api/heartbeat/fast", async (_req, res) => {
  if (!(await isFeatureEnabled(res, "fast-heartbeat"))) {
    res.status(404).json({ error: "not found" });
    return;
  }

  res.json({ intervalSeconds: FAST_HEARTBEAT_INTERVAL_SECONDS });
});
