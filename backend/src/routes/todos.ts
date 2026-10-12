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

  // update-todo-store is retired: PUT is always available and has no feature
  // flag gate, so it works regardless of any flag status. PATCH is a separate
  // change with its own flag, so it still stays dark until the Orchestrator
  // releases it.
  router.put("/api/todos/:id", updateTodoHandler(store));
  router.patch("/api/todos/:id", updateTodoHandler(store, "patch-todo-endpoint"));

  // delete-todo-endpoint is retired: DELETE is always available and has no
  // feature-flag gate, so it answers exactly as it did when that flag was on.
  // Replacing the gate with a new dark flag would regress DELETE to 404 for
  // live users during the dark period, so the whole change lands ungated
  // (REQ-1, REQ-2, REQ-5) — the same pattern used to retire update-todo-store.
  router.delete("/api/todos/:id", async (req, res) => {
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
 * it. PUT passes no flag slug, so it always runs; PATCH passes its feature-flag
 * slug and answers 404 while that flag is off, exactly as if it did not exist.
 */
function updateTodoHandler(store: TodoStore, flagSlug?: string): RequestHandler {
  return async (req, res) => {
    if (flagSlug && !(await isFeatureEnabled(res, flagSlug))) {
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
