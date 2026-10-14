import { Router } from "express";

/**
 * GET /api/ui-flags reports the UI flags this request may see, so the page can
 * decide what to render. The todo UI flag that once gated the page has been
 * retired, so it is now always reported on.
 */
export const uiFlagsRouter = Router();

uiFlagsRouter.get("/api/ui-flags", (_req, res) => {
  res.json({ "todo-ui": true });
});
