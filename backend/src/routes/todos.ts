import { Router } from "express";
import type { TodoStore } from "../todos";

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

  return router;
}
