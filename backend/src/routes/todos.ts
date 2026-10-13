import { createHash } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { TodoStore } from "../todos";
import { logger } from "../logger";

/**
 * Todo API routes. A `TodoStore` is injected so each app instance owns its
 * own in-memory state.
 */
export function todosRouter(store: TodoStore): Router {
  const router = Router();

  // filter-todos-by-done is retired: filtering by `done` is always available,
  // with no feature-flag gate. Omitting `done` returns every todo; an invalid
  // value returns 400.
  router.get("/api/todos", (req, res) => {
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

  // GET /api/todos/count is always available: the flag that once gated it has
  // been retired. It reports the number of live todos — counted via list(), so
  // both done and not-done todos count and soft-deleted ones do not.
  router.get("/api/todos/count", (_req, res) => {
    res.json({ count: store.list().length });
  });

  router.post("/api/todos", (req, res) => {
    const title = (req.body as { title?: unknown } | undefined)?.title;
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({ error: "title is required and must be a non-empty string" });
      return;
    }
    res.status(201).json(store.add(title));
  });

  // update-todo-store and patch-todo-endpoint are both retired: PUT and PATCH
  // are always available and have no feature-flag gate, so they work
  // regardless of any flag status.
  //
  // PUT additionally logs the SHA-256 hash of the request body, always on:
  // the flag that once guarded it has been retired. This only affects
  // logging; PATCH is unaffected.
  router.put("/api/todos/:id", putTodoHandler(store));
  router.patch("/api/todos/:id", updateTodoHandler(store));

  // delete-todo-endpoint is retired: DELETE is always available and has no
  // feature-flag gate, so it works regardless of any flag status.
  router.delete("/api/todos/:id", (req, res) => {
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
 * PUT /api/todos/:id. Behaves exactly like the shared update handler, and
 * additionally writes one info-level log line carrying the SHA-256 hash of
 * the request body. The hash is only ever logged, never returned.
 */
function putTodoHandler(store: TodoStore): RequestHandler {
  const update = updateTodoHandler(store);
  return async (req, res) => {
    await update(req, res, () => {});
    if (res.headersSent && res.statusCode === 200) {
      const hash = createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
      logger.info("todo_update_hash", { id: Number(req.params.id), sha256: hash });
    }
  };
}

/**
 * Builds the handler that sets a todo's done status. Both PUT and PATCH share
 * it, and neither is feature-flag gated.
 */
function updateTodoHandler(store: TodoStore): RequestHandler {
  return async (req, res) => {
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
