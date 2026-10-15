import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Self-contained app slug so the suite works even when vitest is run from the
// repo root, skipping backend/vitest.config.mts (see todos.test.ts).
process.env.APP_SLUG ??= "test-app";

function flags(integrationStatusOn: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.integration-status": {
      variants: { on: true, off: false },
      defaultVariant: integrationStatusOn ? "on" : "off",
    },
  });
}

// A value used only inside the test process; the endpoint must never expose it.
const SECRET_VALUE = "test-secret-value-do-not-log";
let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(flags(false));
  app = createApp();
});

afterEach(() => {
  delete process.env.THROWAWAY_TEST_KEY;
});

describe("GET /api/integration-status", () => {
  it("returns 404 like an unknown route while the flag is off", async () => {
    process.env.THROWAWAY_TEST_KEY = SECRET_VALUE;

    const response = await request(app).get("/api/integration-status");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("returns 200 configured:true when the flag is on and the key is set", async () => {
    OpenFeature.setProvider(flags(true));
    process.env.THROWAWAY_TEST_KEY = SECRET_VALUE;

    const response = await request(createApp()).get("/api/integration-status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ configured: true });
  });

  it("returns 200 configured:false when the flag is on and the key is empty", async () => {
    OpenFeature.setProvider(flags(true));
    process.env.THROWAWAY_TEST_KEY = "";

    const response = await request(createApp()).get("/api/integration-status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ configured: false });
  });

  it("returns 200 configured:false when the flag is on and the key is unset", async () => {
    OpenFeature.setProvider(flags(true));
    delete process.env.THROWAWAY_TEST_KEY;

    const response = await request(createApp()).get("/api/integration-status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ configured: false });
  });

  it("never exposes the key value in the response body", async () => {
    OpenFeature.setProvider(flags(true));
    process.env.THROWAWAY_TEST_KEY = SECRET_VALUE;

    const response = await request(createApp()).get("/api/integration-status");

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(SECRET_VALUE);
  });

  it("never logs the key value while serving the request", async () => {
    OpenFeature.setProvider(flags(true));
    process.env.THROWAWAY_TEST_KEY = SECRET_VALUE;
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });

    try {
      await request(createApp()).get("/api/integration-status");
    } finally {
      spy.mockRestore();
    }

    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain(SECRET_VALUE);
  });

  it("shows the status to a Preview Token holder even while the flag is off", async () => {
    const TOKEN = "s3cret-preview-token";
    process.env.PREVIEW_TOKEN = TOKEN;
    process.env.THROWAWAY_TEST_KEY = SECRET_VALUE;

    try {
      const response = await request(createApp()).get("/api/integration-status").set("X-Preview-Token", TOKEN);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ configured: true });
    } finally {
      delete process.env.PREVIEW_TOKEN;
    }
  });
});
