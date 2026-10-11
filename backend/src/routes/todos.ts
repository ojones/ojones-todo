import { Router, type RequestHandler } from "express";
import type { TodoStore } from "../todos";
import { isFeatureEnabled } from "../feature-flags";

/**
 * Todo API routes. A `TodoStore` is injected so each app instance owns its
 * own in-memory state.
 */
export function todosRouter(store: TodoStore): Router {
  const router = Router();

  router.get("/api/todos", (_req, res) => {
    res.json(store.list());
  });

  router.post("/api/todos", (req, res) => {
    const title = (req.body as { title?: unknown } | undefined)?.title;
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({ error: "title is required and must be a non-empty string" });
      return;
    }
    res.status(201).json(store.add(title));
  });

  // Sets a todo's done status. Each route is behind its own feature flag
  // (STANDARDS-FEATURE-FLAGS.md) and stays dark until the Orchestrator
  // releases it: while the flag is off the route answers 404, exactly as if
  // it did not exist.
  router.put("/api/todos/:id", updateTodoHandler(store, "update-todo-store"));
  router.patch("/api/todos/:id", updateTodoHandler(store, "patch-todo-endpoint"));

  return router;
}

/**
 * Builds the handler that sets a todo's done status. Both PUT and PATCH share
 * it; each route supplies the feature-flag slug that gates it.
 */
function updateTodoHandler(store: TodoStore, flagSlug: string): RequestHandler {
  return async (req, res) => {
    if (!(await isFeatureEnabled(res, flagSlug))) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }

    const done = (req.body as { done?: unknown } | undefined)?.done;
    if (typeof done !== "boolean") {
      res.status(400).json({ error: "done must be a boolean" });
      return;
    }

    const updated = store.update(id, { done });
    if (!updated) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.json(updated);
  };
}
