import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";
import { logger } from "../logger";

// Flag keys are scoped by app slug (feature-flags.ts). setup.ts sets this,
// but it only loads through backend/vitest.config.mts; running vitest from the
// repo root (e.g. `npx vitest run backend/src/__tests__/todos.test.ts`) skips
// that config, appSlug() throws, and every route 500s. Default it here so the
// suite is self-contained and the result reflects the routes, not the loader.
process.env.APP_SLUG ??= "test-app";

function flags(logTodoUpdateHashOn = false, todosCountEndpointOn = true) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.log-todo-update-hash": {
      variants: { on: true, off: false },
      defaultVariant: logTodoUpdateHashOn ? "on" : "off",
    },
    "test-app.feature.todos-count-endpoint": {
      variants: { on: true, off: false },
      defaultVariant: todosCountEndpointOn ? "on" : "off",
    },
  });
}

let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(flags());
  app = createApp();
});

describe("GET /api/todos", () => {
  it("returns an empty array when there are no todos", async () => {
    const response = await request(app).get("/api/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns created todos as JSON", async () => {
    await request(app).post("/api/todos").send({ title: "write tests" });

    const response = await request(app).get("/api/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 1, title: "write tests", done: false }]);
  });
});

describe("GET /api/todos?done=", () => {
  // Seeds one not-done todo (id 1) and one done todo (id 2), so the filter
  // has something to filter.
  async function seedMixed() {
    await request(app).post("/api/todos").send({ title: "not done" });
    await request(app).post("/api/todos").send({ title: "done" });
    await request(app).patch("/api/todos/2").send({ done: true });
  }

  it("returns only done todos for ?done=true", async () => {
    await seedMixed();

    const response = await request(app).get("/api/todos?done=true");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 2, title: "done", done: true }]);
  });

  it("returns only not-done todos for ?done=false", async () => {
    await seedMixed();

    const response = await request(app).get("/api/todos?done=false");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 1, title: "not done", done: false }]);
  });

  it("returns every todo when done is omitted", async () => {
    await seedMixed();

    const response = await request(app).get("/api/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, title: "not done", done: false },
      { id: 2, title: "done", done: true },
    ]);
  });

  it.each([["maybe"], ["TRUE"], ["1"], [""]])(
    "returns 400 with a JSON error for ?done=%s",
    async (value) => {
      await seedMixed();

      const response = await request(app).get(`/api/todos?done=${value}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "done must be 'true' or 'false'" });
    }
  );

});

describe("GET /api/todos/count", () => {
  it("returns 0 when there are no todos", async () => {
    const response = await request(app).get("/api/todos/count");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 0 });
  });

  it("counts every todo, both done and not done", async () => {
    await request(app).post("/api/todos").send({ title: "not done" });
    await request(app).post("/api/todos").send({ title: "done" });
    await request(app).patch("/api/todos/2").send({ done: true });

    const response = await request(app).get("/api/todos/count");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 2 });
  });

  it("does not count deleted todos", async () => {
    await request(app).post("/api/todos").send({ title: "first" });
    await request(app).post("/api/todos").send({ title: "second" });
    await request(app).delete("/api/todos/1");

    const response = await request(app).get("/api/todos/count");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 1 });

    // The count matches the live list, so a deleted todo is excluded from both.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 2, title: "second", done: false }]);
  });

  it("returns 404 while the todos-count-endpoint flag is off", async () => {
    OpenFeature.setProvider(flags(false, false));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).get("/api/todos/count");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("records the todos-count-endpoint flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "todos-count-endpoint");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});

describe("POST /api/todos", () => {
  it("creates a todo and returns it with 201", async () => {
    const response = await request(app)
      .post("/api/todos")
      .send({ title: "buy milk" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: false });
  });

  it("assigns increasing integer ids and persists todos in order", async () => {
    const first = await request(app).post("/api/todos").send({ title: "first" });
    const second = await request(app).post("/api/todos").send({ title: "second" });

    expect(first.body).toEqual({ id: 1, title: "first", done: false });
    expect(second.body).toEqual({ id: 2, title: "second", done: false });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([
      { id: 1, title: "first", done: false },
      { id: 2, title: "second", done: false },
    ]);
  });

  it.each([
    ["a missing title", {}],
    ["a non-string title", { title: 42 }],
    ["an empty title", { title: "" }],
    ["a whitespace-only title", { title: "   " }],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await request(app).post("/api/todos").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "title is required and must be a non-empty string",
    });
  });

  it("does not store a todo when the title is invalid", async () => {
    await request(app).post("/api/todos").send({ title: "" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([]);
  });
});

describe("PUT /api/todos/:id", () => {
  it("updates a todo to done=true and returns it", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: true });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: true }]);
  });

  it("updates a todo to done=false and returns it", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });
    await request(app).put("/api/todos/1").send({ done: true });

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: false });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("returns 404 for an unknown id", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/999")
      .send({ done: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("returns 400 for a non-integer id", async () => {
    const response = await request(app)
      .put("/api/todos/abc")
      .send({ done: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "id must be a positive integer" });
  });

  it.each([
    ["a missing done", {}],
    ["a non-boolean done", { done: "yes" }],
  ])("returns 400 for %s", async (_label, body) => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "done must be a boolean" });
  });
});

describe("PUT /api/todos/:id SHA-256 hash logging", () => {
  const body = { done: true };
  const expectedHash = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");

  async function seedTodo() {
    await request(app).post("/api/todos").send({ title: "buy milk" });
  }

  it("logs the SHA-256 hash of the request body at info level when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
    app = createApp();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await seedTodo();

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith("todo_update_hash", {
      id: 1,
      sha256: expectedHash,
    });
  });

  it("does not log the hash while the flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    app = createApp();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await seedTodo();

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(200);
    expect(infoSpy).not.toHaveBeenCalledWith("todo_update_hash", expect.anything());
  });

  it("does not log the hash for an invalid body", async () => {
    OpenFeature.setProvider(flags(true));
    app = createApp();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await seedTodo();

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: "invalid" });

    expect(response.status).toBe(400);
    expect(infoSpy).not.toHaveBeenCalledWith("todo_update_hash", expect.anything());
  });

  it("keeps the hash out of the response body and headers", async () => {
    OpenFeature.setProvider(flags(true));
    app = createApp();
    vi.spyOn(logger, "info").mockImplementation(() => {});
    await seedTodo();

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: true });
    const headerText = JSON.stringify(response.headers).toLowerCase();
    expect(headerText).not.toContain(expectedHash);
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain(expectedHash);
  });

  it("does not log the hash for PATCH requests", async () => {
    OpenFeature.setProvider(flags(true));
    app = createApp();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await seedTodo();

    const response = await request(app).patch("/api/todos/1").send(body);

    expect(response.status).toBe(200);
    expect(infoSpy).not.toHaveBeenCalledWith("todo_update_hash", expect.anything());
  });

  it("records the log-todo-update-hash flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "log-todo-update-hash");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});

describe("PATCH /api/todos/:id", () => {
  it("updates a todo to done=true and returns it", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .patch("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: true });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: true }]);
  });

  it("updates a todo to done=false and returns it", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });
    await request(app).patch("/api/todos/1").send({ done: true });

    const response = await request(app)
      .patch("/api/todos/1")
      .send({ done: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: false });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("returns 404 for an unknown id", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .patch("/api/todos/999")
      .send({ done: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it.each([
    ["a decimal id", "1.5"],
    ["a negative id", "-1"],
    ["a non-integer id", "abc"],
  ])("returns 400 for %s", async (_label, id) => {
    const response = await request(app)
      .patch(`/api/todos/${id}`)
      .send({ done: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "id must be a positive integer" });
  });

  it.each([
    ["a missing done", {}],
    ["a non-boolean done", { done: "yes" }],
    ["a numeric done", { done: 1 }],
  ])("returns 400 for %s", async (_label, body) => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).patch("/api/todos/1").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "done must be a boolean" });
  });
});

describe("DELETE /api/todos/:id", () => {
  it("deletes a todo with 204 and no body", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete("/api/todos/1");

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    // The todo is gone: GET no longer lists it.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([]);
  });

  it("omits a deleted todo from GET /api/todos", async () => {
    await request(app).post("/api/todos").send({ title: "first" });
    await request(app).post("/api/todos").send({ title: "second" });

    await request(app).delete("/api/todos/1");

    const list = await request(app).get("/api/todos");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: 2, title: "second", done: false }]);
  });

  it("returns 404 for an unknown id", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete("/api/todos/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });
  });

  it("returns 404 when deleting an already-deleted todo", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });
    await request(app).delete("/api/todos/1");

    const response = await request(app).delete("/api/todos/1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });
  });

  it.each([
    ["a decimal id", "1.5"],
    ["a negative id", "-1"],
    ["a non-integer id", "abc"],
    ["zero", "0"],
  ])("returns 400 for %s", async (_label, id) => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete(`/api/todos/${id}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "id must be a positive integer" });

    // An invalid id must not delete the valid todo.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });
});
