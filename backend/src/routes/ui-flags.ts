import { Router } from "express";
import { isFeatureEnabled } from "../feature-flags";

/**
 * Feature flag gating the to-do UI (see flags.json). Evaluated on the server
 * per request so the page can decide which UI to render: with the flag off an
 * ordinary visitor keeps the Starter Template, and a visitor carrying the
 * Preview Token sees the to-do UI.
 */
const TODO_UI = "todo-ui";

/**
 * UI flag API route. Exposes the resolved boolean values of the flags that
 * affect the page, evaluated through isFeatureEnabled() so the Preview Token
 * override applies uniformly (and the GrowthBook default of `false` is used
 * when the flag is unreleased or unreachable).
 */
export const uiFlagsRouter = Router();

uiFlagsRouter.get("/api/ui-flags", async (_req, res) => {
  res.json({ [TODO_UI]: await isFeatureEnabled(res, TODO_UI) });
});
