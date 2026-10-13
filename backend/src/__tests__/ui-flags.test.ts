import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";

const TOKEN = "s3cret-preview-token";

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

describe("GET /api/ui-flags", () => {
  beforeEach(() => {
    OpenFeature.setProvider(flags(false));
  });
  afterEach(() => {
    delete process.env.PREVIEW_TOKEN;
  });

  it('returns {"todo-ui": false} without a preview token', async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const res = await request(createApp()).get("/api/ui-flags");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": false });
  });

  it('returns {"todo-ui": true} with the X-Preview-Token header', async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const res = await request(createApp()).get("/api/ui-flags").set("X-Preview-Token", TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": true });
  });

  it('returns {"todo-ui": true} with ?preview=', async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const res = await request(createApp()).get(`/api/ui-flags?preview=${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": true });
  });

  it('returns {"todo-ui": false} for a wrong token', async () => {
    process.env.PREVIEW_TOKEN = TOKEN;

    const res = await request(createApp()).get("/api/ui-flags").set("X-Preview-Token", "wrong-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": false });
  });

  it('returns {"todo-ui": false} when PREVIEW_TOKEN is unset', async () => {
    delete process.env.PREVIEW_TOKEN;

    const res = await request(createApp()).get("/api/ui-flags").set("X-Preview-Token", TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": false });
  });

  it('returns {"todo-ui": true} for everyone once the flag is released', async () => {
    delete process.env.PREVIEW_TOKEN;
    OpenFeature.setProvider(flags(true));

    const res = await request(createApp()).get("/api/ui-flags");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ "todo-ui": true });
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
