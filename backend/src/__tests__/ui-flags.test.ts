import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

// Self-contained app slug so the suite works even when vitest is run from the
// repo root, skipping backend/vitest.config.mts (see todos.test.ts).
process.env.APP_SLUG ??= "test-app";

let app: Express;

beforeEach(() => {
  OpenFeature.setProvider(
    new TypedInMemoryProvider({
      "test-app.global-kill-switch": {
        variants: { on: true, off: false },
        defaultVariant: "on",
      },
    }),
  );
  app = createApp();
});

describe("GET /api/ui-flags", () => {
  it("always reports the todo UI on now that its flag is retired", async () => {
    const response = await request(app).get("/api/ui-flags");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ "todo-ui": true });
  });
});
