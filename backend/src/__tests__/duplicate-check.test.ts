import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Self-contained app slug so the suite works even when vitest is run from the
// repo root, skipping backend/vitest.config.mts (see todos.test.ts).
process.env.APP_SLUG ??= "test-app";

function flags(duplicateCheckOn: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.duplicate-check": {
      variants: { on: true, off: false },
      defaultVariant: duplicateCheckOn ? "on" : "off",
    },
  });
}

const TOKEN = "s3cret-preview-token";
let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(flags(false));
  app = createApp();
});

afterEach(() => {
  delete process.env.PREVIEW_TOKEN;
});

describe("POST /api/todos/duplicate-check with the flag off", () => {
  // AC-1: the endpoint ships dark, so it is indistinguishable from an unknown
  // route while the flag is off.
  it("returns 404 like an unknown route for a valid title", async () => {
    const response = await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("returns 404 before validating the body, even for an invalid title", async () => {
    const response = await request(app).post("/api/todos/duplicate-check").send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("creates no todo while the flag is off", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([]);
  });
});

describe("POST /api/todos/duplicate-check with the flag on", () => {
  beforeEach(() => {
    OpenFeature.setProvider(flags(true));
    app = createApp();
  });

  // AC-2: a new title creates the todo and returns it.
  it("returns 201 with the created todo for a new title", async () => {
    const response = await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: false });
  });

  it("stores the created todo so it appears in GET /api/todos", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  // AC-3: the same title a second time is a duplicate.
  it("returns 409 with a duplicate error for a title that already exists", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    const response = await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "duplicate todo" });
  });

  it("does not create a second todo for a duplicate title", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("answers 201 then 409 for the same request body, in order", async () => {
    const first = await request(app).post("/api/todos/duplicate-check").send({ title: "same" });
    const second = await request(app).post("/api/todos/duplicate-check").send({ title: "same" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("treats different titles as distinct and creates both", async () => {
    const first = await request(app).post("/api/todos/duplicate-check").send({ title: "first" });
    const second = await request(app).post("/api/todos/duplicate-check").send({ title: "second" });

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ id: 1, title: "first", done: false });
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ id: 2, title: "second", done: false });
  });

  it("detects a title created through POST /api/todos as a duplicate", async () => {
    await request(app).post("/api/todos").send({ title: "buy milk" });

    const response = await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "duplicate todo" });
  });

  it("lets a soft-deleted title be created again", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });
    await request(app).delete("/api/todos/1");

    const response = await request(app).post("/api/todos/duplicate-check").send({ title: "buy milk" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 2, title: "buy milk", done: false });
  });

  it.each([
    ["a missing title", {}],
    ["a non-string title", { title: 42 }],
    ["an empty title", { title: "" }],
    ["a whitespace-only title", { title: "   " }],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await request(app).post("/api/todos/duplicate-check").send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "title is required and must be a non-empty string",
    });
  });

  it("does not store a todo when the title is invalid", async () => {
    await request(app).post("/api/todos/duplicate-check").send({ title: "" });

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([]);
  });
});

describe("POST /api/todos/duplicate-check preview", () => {
  // Preview lets a reviewer exercise the dark feature in the real deployment,
  // matching the other isFeatureEnabled-gated route (integration-status).
  it("shows the endpoint to a Preview Token holder while the flag is off", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp())
      .post("/api/todos/duplicate-check")
      .set("X-Preview-Token", TOKEN)
      .send({ title: "buy milk" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, title: "buy milk", done: false });
  });
});
