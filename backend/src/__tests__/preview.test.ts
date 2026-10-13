import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";
import { isFeatureEnabled } from "../feature-flags";

const TOKEN = "s3cret-preview-token";

function flags(killSwitchOn: boolean, demoOn: boolean) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: killSwitchOn ? "on" : "off",
    },
    "test-app.feature.demo": {
      variants: { on: true, off: false },
      defaultVariant: demoOn ? "on" : "off",
    },
    // A real, app-mounted gated route (`GET /api/todos/count`), always off, so
    // the preview override is exercised end to end rather than on a synthetic
    // probe route the deployment does not serve.
    "test-app.feature.todos-count-endpoint": {
      variants: { on: true, off: false },
      defaultVariant: "off",
    },
  });
}

function appWithProbe() {
  const app = createApp();
  app.get("/api/_probe", async (_req, res) => {
    res.json({ enabled: await isFeatureEnabled(res, "demo") });
  });
  return app;
}

describe("Preview Token", () => {
  beforeEach(() => {
    process.env.PREVIEW_TOKEN = TOKEN;
    OpenFeature.setProvider(flags(true, false));
  });
  afterEach(() => {
    delete process.env.PREVIEW_TOKEN;
  });

  it("keeps a dark feature dark without a token", async () => {
    const res = await request(appWithProbe()).get("/api/_probe");
    expect(res.body).toEqual({ enabled: false });
  });

  it("shows the feature with the X-Preview-Token header", async () => {
    const res = await request(appWithProbe()).get("/api/_probe").set("X-Preview-Token", TOKEN);
    expect(res.body).toEqual({ enabled: true });
  });

  it("rejects a wrong token", async () => {
    const res = await request(appWithProbe()).get("/api/_probe").set("X-Preview-Token", "nope");
    expect(res.body).toEqual({ enabled: false });
  });

  it("accepts ?preview= and sets an HttpOnly cookie that keeps working", async () => {
    const app = appWithProbe();
    const first = await request(app).get(`/api/_probe?preview=${TOKEN}`);
    expect(first.body).toEqual({ enabled: true });
    const cookie = first.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("HttpOnly");

    const second = await request(app).get("/api/_probe").set("Cookie", cookie.split(";")[0]);
    expect(second.body).toEqual({ enabled: true });
  });

  it("is disabled entirely when PREVIEW_TOKEN is unset", async () => {
    delete process.env.PREVIEW_TOKEN;
    const res = await request(appWithProbe()).get("/api/_probe").set("X-Preview-Token", "");
    expect(res.body).toEqual({ enabled: false });
  });

  it("does not bypass the kill switch", async () => {
    OpenFeature.setProvider(flags(false, false));
    const res = await request(appWithProbe()).get("/api/_probe").set("X-Preview-Token", TOKEN);
    expect(res.status).toBe(503);
  });

  it("shows a released feature to everyone without a token", async () => {
    OpenFeature.setProvider(flags(true, true));
    const res = await request(appWithProbe()).get("/api/_probe");
    expect(res.body).toEqual({ enabled: true });
  });

  // The probe above is a test-only route. These drive a real, app-mounted,
  // flag-gated route (`GET /api/todos/count`) that the deployment actually
  // serves, so the preview override is proven on the shipped code path.
  it("unlocks a real gated route for a token holder and keeps it dark without one", async () => {
    const dark = await request(createApp()).get("/api/todos/count");
    expect(dark.status).toBe(404);

    const lit = await request(createApp()).get("/api/todos/count").set("X-Preview-Token", TOKEN);
    expect(lit.status).toBe(200);
    expect(lit.body).toEqual({ count: 0 });

    const wrong = await request(createApp()).get("/api/todos/count").set("X-Preview-Token", "wrong-token");
    expect(wrong.status).toBe(404);
  });
});
