import { Router } from "express";
import { isFeatureEnabled } from "../feature-flags";

/**
 * GET /api/version reports the app version. It ships dark behind the
 * `version-endpoint` flag: until the Orchestrator releases it, an ordinary
 * visitor gets the same 404 an unknown route returns.
 */
export const versionRouter = Router();

versionRouter.get("/api/version", async (_req, res) => {
  if (!(await isFeatureEnabled(res, "version-endpoint"))) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ version: "1" });
});
