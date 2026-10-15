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

  // AC-2: with the flag off the endpoint must be indistinguishable from an
  // unknown route, and in particular must not answer 200.
  it("returns 404, never 200, while the flag is off", async () => {
    const response = await request(app).get("/api/version");

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  // The live deployment sets PREVIEW_TOKEN, so an ordinary request — one
  // that carries no token — must still stay dark while the flag is off. This
  // is the exact "without the token" boundary: preview being configured must
  // never widen access on its own.
  it("stays 404 without a token even when PREVIEW_TOKEN is configured", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(app).get("/api/version");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  // The finding's `version-dark` case: with the flag off the endpoint must
  // stay dark for every request, including one that carries the Preview
  // Token. Letting the token widen it would make this request answer 200.
  it("stays 404 for a Preview Token holder while the flag is off", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp()).get("/api/version").set("X-Preview-Token", TOKEN);

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  // A request carrying a wrong token is no better than one carrying none.
  it("stays 404 for a wrong Preview Token while the flag is off", async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const response = await request(createApp()).get("/api/version").set("X-Preview-Token", "not-the-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });
});
