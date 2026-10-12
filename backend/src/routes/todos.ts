import { Router, type RequestHandler } from "express";
import type { TodoStore } from "../todos";
import { isFeatureEnabled } from "../feature-flags";

/**
 * Todo API routes. A `TodoStore` is injected so each app instance owns its
 * own in-memory state.
 */
export function todosRouter(store: TodoStore): Router {
  const router = Router();

  // Filtering by done is one change, so it sits behind one feature flag
  // (STANDARDS-FEATURE-FLAGS.md) and stays dark until the Orchestrator
  // releases it: while the flag is off the route ignores `done` and returns
  // every todo, exactly as it did before.
  router.get("/api/todos", async (req, res) => {
    if (!(await isFeatureEnabled(res, "filter-todos-by-done"))) {
      res.json(store.list());
      return;
    }

    const done = req.query.done;
    if (done === undefined) {
      res.json(store.list());
      return;
    }
    if (done !== "true" && done !== "false") {
      res.status(400).json({ error: "done must be 'true' or 'false'" });
      return;
    }

    const wantDone = done === "true";
    res.json(store.list().filter((todo) => todo.done === wantDone));
  });

  router.post("/api/todos", (req, res) => {
    const title = (req.body as { title?: unknown } | undefined)?.title;
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({ error: "title is required and must be a non-empty string" });
      return;
    }
    res.status(201).json(store.add(title));
  });

  // Retiring update-todo-store so PUT is always on is one change, so the whole
  // change sits behind one feature flag (STANDARDS-FEATURE-FLAGS.md) and stays
  // dark until the Orchestrator releases it: while the flag is off the route
  // answers 404, exactly as if it did not exist. Once released, PUT answers
  // exactly as it did when update-todo-store was on. PATCH is a separate change
  // with its own flag.
  router.put("/api/todos/:id", updateTodoHandler(store, "retire-update-todo-store-flag"));
  router.patch("/api/todos/:id", updateTodoHandler(store, "patch-todo-endpoint"));

  // Soft-deletes a todo. Behind its own feature flag (STANDARDS-FEATURE-FLAGS.md)
  // and dark until the Orchestrator releases it: while the flag is off the
  // route answers 404, exactly as if it did not exist.
  router.delete("/api/todos/:id", async (req, res) => {
    if (!(await isFeatureEnabled(res, "delete-todo-endpoint"))) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }

    if (!store.delete(id)) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.status(204).end();
  });

  return router;
}

/**
 * Builds the handler that sets a todo's done status. Both PUT and PATCH share
 * it; each route supplies the feature-flag slug that gates it. While that flag
 * is off the route answers 404, exactly as if it did not exist.
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
