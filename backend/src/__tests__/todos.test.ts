import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Flag keys are scoped by app slug (feature-flags.ts); setup.ts uses "test-app".
function flags(updateEnabled: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.update-todo-store": {
      variants: { on: true, off: false },
      defaultVariant: updateEnabled ? "on" : "off",
    },
  });
}

let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(flags(false));
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
  it("returns 404 while the update-todo-store flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app)
      .put("/api/todos/1")
      .send({ done: true });

    expect(response.status).toBe(404);
  });

  it("updates a todo and returns it when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
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
    OpenFeature.setProvider(flags(true));
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
    OpenFeature.setProvider(flags(true));

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
    OpenFeature.setProvider(flags(true));
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).put("/api/todos/1").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "done must be a boolean" });
  });
});
