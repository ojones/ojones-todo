import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Self-contained app slug so the suite works even when vitest is run from the
// repo root, skipping backend/vitest.config.mts (see todos.test.ts).
process.env.APP_SLUG ??= "test-app";

function flags(todoUiOn: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.todo-ui": {
      variants: { on: true, off: false },
      defaultVariant: todoUiOn ? "on" : "off",
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

describe("GET /api/ui-flags", () => {
  it("reports todo-ui false while the flag is off", async () => {
    const response = await request(app).get("/api/ui-flags");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ "todo-ui": false });
  });

  it("reports todo-ui true when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));

    const response = await request(createApp()).get("/api/ui-flags");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ "todo-ui": true });
  });

  it("reports todo-ui true for a Preview Token holder even while the flag is off", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp()).get("/api/ui-flags").set("X-Preview-Token", TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ "todo-ui": true });
  });

  it("reports todo-ui false for a wrong Preview Token", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp()).get("/api/ui-flags").set("X-Preview-Token", "wrong-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ "todo-ui": false });
  });

  it("records the todo-ui flag in flags.json", () => {
    const list = JSON.parse(readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")) as Array<{
      slug: string;
      description: string;
    }>;

    const entry = list.find((f) => f.slug === "todo-ui");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});
