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

function flags(versionEndpointOn: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.version-endpoint": {
      variants: { on: true, off: false },
      defaultVariant: versionEndpointOn ? "on" : "off",
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

describe("GET /api/version", () => {
  it("returns 200 with the version when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));

    const response = await request(createApp()).get("/api/version");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: "1" });
  });

  it("returns 404 like an unknown route while the flag is off", async () => {
    const response = await request(app).get("/api/version");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("shows the version to a Preview Token holder even while the flag is off", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp()).get("/api/version").set("X-Preview-Token", TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: "1" });
  });

  it("records the version-endpoint flag in flags.json", () => {
    const list = JSON.parse(readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")) as Array<{
      slug: string;
      description: string;
    }>;

    const entry = list.find((f) => f.slug === "version-endpoint");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});
