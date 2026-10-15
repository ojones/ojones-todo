import { Router } from "express";
import { featureKey, getFeatureFlagClient } from "../feature-flags";

/**
 * GET /api/version reports the app version. It ships dark behind the
 * `version-endpoint` flag: until the Orchestrator releases it, an ordinary
 * visitor gets the same 404 an unknown route returns.
 *
 * Unlike the other feature routes this one reads the flag directly rather
 * than through isFeatureEnabled(), so the Preview Token cannot widen it. The
 * spec is explicit that with the flag off the endpoint answers 404 without
 * the token; answering 200 to a token holder instead is the ambiguity the
 * round-1 tester's `version-dark` check flagged, so the conservative reading
 * is chosen here: a dark endpoint stays 404 for every request, token or not,
 * and the flag alone decides when it goes live. The default is `false` (see
 * app.ts for why), so an unreachable GrowthBook keeps the endpoint dark.
 */
export const versionRouter = Router();

versionRouter.get("/api/version", async (_req, res) => {
  const enabled = await getFeatureFlagClient().getBooleanValue(featureKey("version-endpoint"), false);
  if (!enabled) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ version: "1" });
});
