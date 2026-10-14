import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// The todo UI used to sit behind a feature flag. That flag was retired, so the
// UI is now unconditional: there is no per-visitor flag route to consult. This
// suite covers the released behaviour for an ordinary visitor with no Preview
// Token — the same visitor who already saw the todo UI before the retirement.
process.env.APP_SLUG ??= "test-app";

function flags() {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
  });
}

let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(flags());
  app = createApp();
});

describe("unconditional todo UI for an ordinary visitor", () => {
  it("serves GET /api/todos with 200 and no Preview Token or flag call", async () => {
    const response = await request(app).get("/api/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("serves the todo API end to end for an ordinary visitor", async () => {
    const created = await request(app).post("/api/todos").send({ title: "buy milk" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 1, title: "buy milk", done: false });

    const listed = await request(app).get("/api/todos");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([{ id: 1, title: "buy milk", done: false }]);
  });

  it("rejects an empty title with 400 (boundary case)", async () => {
    const response = await request(app).post("/api/todos").send({ title: "" });

    expect(response.status).toBe(400);
  });

  it("no longer exposes GET /api/ui-flags (404 like an unknown route)", async () => {
    const response = await request(app).get("/api/ui-flags");

    expect(response.status).toBe(404);
  });

  it("does not reference the retired ui-flags route from the app source", () => {
    const appSource = readFileSync(path.resolve(__dirname, "../../../frontend/src/App.tsx"), "utf8");

    expect(appSource).not.toContain("ui-flags");
    expect(appSource).not.toContain("uiFlags");
    expect(appSource).toContain("<TodosPage />");
  });
});
