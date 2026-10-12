import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Flag keys are scoped by app slug (feature-flags.ts). setup.ts sets this,
// but it only loads through backend/vitest.config.mts; running vitest from the
// repo root (e.g. `npx vitest run backend/src/__tests__/todos.test.ts`) skips
// that config, appSlug() throws, and every route 500s. Default it here so the
// suite is self-contained and the result reflects the routes, not the loader.
process.env.APP_SLUG ??= "test-app";

function flags(
  patchEnabled = false,
  filterEnabled = false,
  deleteEnabled = false,
  retireEnabled = false
) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.patch-todo-endpoint": {
      variants: { on: true, off: false },
      defaultVariant: patchEnabled ? "on" : "off",
    },
    "test-app.feature.filter-todos-by-done": {
      variants: { on: true, off: false },
      defaultVariant: filterEnabled ? "on" : "off",
    },
    "test-app.feature.delete-todo-endpoint": {
      variants: { on: true, off: false },
      defaultVariant: deleteEnabled ? "on" : "off",
    },
    "test-app.feature.retire-update-todo-store-flag": {
      variants: { on: true, off: false },
      defaultVariant: retireEnabled ? "on" : "off",
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

describe("GET /api/todos?done= (filter-todos-by-done flag)", () => {
  // Seeds one not-done todo (id 1) and one done todo (id 2) with the filter
  // and patch flags on, so the filter has something to filter.
  async function seedMixed() {
    OpenFeature.setProvider(flags(true, true));
    app = createApp();
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

  it("ignores the done parameter while the flag is off", async () => {
    OpenFeature.setProvider(flags(false, false));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "not done" });
    await request(app).post("/api/todos").send({ title: "done" });

    const filtered = await request(app).get("/api/todos?done=true");
    expect(filtered.status).toBe(200);
    expect(filtered.body).toEqual([
      { id: 1, title: "not done", done: false },
      { id: 2, title: "done", done: false },
    ]);

    // An invalid value is not rejected either — the route behaves as before.
    const invalid = await request(app).get("/api/todos?done=maybe");
    expect(invalid.status).toBe(200);
    expect(invalid.body).toHaveLength(2);
  });

  it("records the filter-todos-by-done flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "filter-todos-by-done");

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

describe("PUT /api/todos/:id (retire-update-todo-store-flag)", () => {
  it("returns 404 while the retire-update-todo-store-flag flag is off", async () => {
    OpenFeature.setProvider(flags(false, false, false, false));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });

    // The todo is untouched: it is still listed as not done.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("updates a todo and returns it when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, false, false, true));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: true });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: true }]);
  });

  it("returns 404 for an unknown id when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, false, false, true));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/999")
      .send({ done: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("returns 400 for a non-integer id when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, false, false, true));
    app = createApp();

    const response = await request(app)
      .put("/api/todos/abc")
      .send({ done: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "id must be a positive integer" });
  });

  it.each([
    ["a missing done", {}],
    ["a non-boolean done", { done: "yes" }],
  ])("returns 400 for %s when the flag is on", async (_label, body) => {
    OpenFeature.setProvider(flags(false, false, false, true));
    app = createApp();
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "done must be a boolean" });
  });

  it("records the retire-update-todo-store-flag flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "retire-update-todo-store-flag");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});

  describe("PATCH /api/todos/:id", () => {
  it("returns 404 while the patch-todo-endpoint flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .patch("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("updates a todo to done=true and returns it when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .patch("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: true });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: true }]);
  });

  it("updates a todo to done=false and returns it when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
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

  it("returns 404 for an unknown id when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
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
  ])("returns 400 for %s when the flag is on", async (_label, id) => {
    OpenFeature.setProvider(flags(true));

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
  ])("returns 400 for %s when the flag is on", async (_label, body) => {
    OpenFeature.setProvider(flags(true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).patch("/api/todos/1").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "done must be a boolean" });
  });

  it("records the patch-todo-endpoint flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "patch-todo-endpoint");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});

describe("DELETE /api/todos/:id", () => {
  it("returns 404 while the delete-todo-endpoint flag is off", async () => {
    OpenFeature.setProvider(flags(false, false, false));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete("/api/todos/1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });

    // The todo is untouched: it is still listed.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("deletes a todo with 204 and no body when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, false, true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete("/api/todos/1");

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it("omits a deleted todo from GET /api/todos", async () => {
    OpenFeature.setProvider(flags(false, false, true));
    await request(app).post("/api/todos").send({ title: "first" });
    await request(app).post("/api/todos").send({ title: "second" });

    await request(app).delete("/api/todos/1");

    const list = await request(app).get("/api/todos");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: 2, title: "second", done: false }]);
  });

  it("returns 404 for an unknown id when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, false, true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete("/api/todos/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });
  });

  it("returns 404 when deleting an already-deleted todo", async () => {
    OpenFeature.setProvider(flags(false, false, true));
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
  ])("returns 400 for %s when the flag is on", async (_label, id) => {
    OpenFeature.setProvider(flags(false, false, true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).delete(`/api/todos/${id}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "id must be a positive integer" });

    // An invalid id must not delete the valid todo.
    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("records the delete-todo-endpoint flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "delete-todo-endpoint");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});
