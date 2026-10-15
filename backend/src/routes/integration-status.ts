import { Router } from "express";
import { isFeatureEnabled } from "../feature-flags";

/**
 * GET /api/integration-status reports whether the third-party integration key
 * is present, without ever revealing its value. It ships dark behind the
 * `integration-status` flag: until the Orchestrator releases it, an ordinary
 * visitor gets the same 404 an unknown route returns.
 */
export const integrationStatusRouter = Router();

integrationStatusRouter.get("/api/integration-status", async (_req, res) => {
  if (!(await isFeatureEnabled(res, "integration-status"))) {
    res.status(404).json({ error: "not found" });
    return;
  }
  // Read the secret in this one place; report only whether it is non-empty.
  const key = process.env.THROWAWAY_TEST_KEY;
  res.json({ configured: typeof key === "string" && key.length > 0 });
});
