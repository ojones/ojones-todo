import { Router } from "express";
import { isFeatureEnabled } from "../feature-flags";

/** Feature flag gating the todo UI. */
const TODO_UI = "todo-ui";

/**
 * GET /api/ui-flags reports the UI flags this request may see, so the page can
 * decide what to render. Each flag is evaluated on the server for this request
 * via isFeatureEnabled(), so the Preview Token override applies uniformly.
 */
export const uiFlagsRouter = Router();

uiFlagsRouter.get("/api/ui-flags", async (_req, res) => {
  res.json({ [TODO_UI]: await isFeatureEnabled(res, TODO_UI) });
});
