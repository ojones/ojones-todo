import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { createApp } from "../app";
import { logger } from "../logger";
import {
  FAST_HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_INTERVAL_SECONDS,
  startFastHeartbeatLogging,
  startHeartbeatLogging,
} from "../heartbeat";

// Flag keys are scoped by app slug (feature-flags.ts); setup.ts uses "test-app".
function flags(heartbeatOn: boolean, fastHeartbeatOn = false) {
  return new TypedInMemoryProvider({
    "test-app.global-kill-switch": {
      variants: { on: true, off: false },
      defaultVariant: "on",
    },
    "test-app.feature.heartbeat": {
      variants: { on: true, off: false },
      defaultVariant: heartbeatOn ? "on" : "off",
    },
    "test-app.feature.fast-heartbeat": {
      variants: { on: true, off: false },
      defaultVariant: fastHeartbeatOn ? "on" : "off",
    },
  });
}

describe("GET /api/heartbeat", () => {
  it("returns 404 while the heartbeat flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("returns 200 with the interval when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ intervalSeconds: 2 });
  });
});

describe("heartbeat background logging", () => {
  let timer: NodeJS.Timeout | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (timer) clearInterval(timer);
    timer = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs nothing while the flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startHeartbeatLogging();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_SECONDS * 1000 * 3);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs one error line per interval while the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("heartbeat");

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("stops logging within one interval after the flag is turned off", async () => {
    OpenFeature.setProvider(flags(true));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // The flag is re-read on every tick, so turning it off stops the logging
    // at the next tick — no more than one interval later.
    OpenFeature.setProvider(flags(false));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_SECONDS * 1000);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/heartbeat/fast", () => {
  it("returns 404 while the fast-heartbeat flag is off", async () => {
    OpenFeature.setProvider(flags(false, false));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat/fast");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not found" });
  });

  it("returns 200 with a 1 second interval when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, true));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat/fast");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ intervalSeconds: 1 });
  });
});

describe("fast heartbeat background logging", () => {
  let timer: NodeJS.Timeout | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (timer) clearInterval(timer);
    timer = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs nothing while the flag is off", async () => {
    OpenFeature.setProvider(flags(false, false));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startFastHeartbeatLogging();
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000 * 3);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs one error line per second while the flag is on", async () => {
    OpenFeature.setProvider(flags(false, true));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startFastHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("heartbeat-fast");

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("stops logging within one second after the flag is turned off", async () => {
    OpenFeature.setProvider(flags(false, true));
    const errorSpy = vi.spyOn(logger, "error");

    timer = startFastHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // The flag is re-read on every tick, so turning it off stops the logging
    // at the next tick — no more than one second later.
    OpenFeature.setProvider(flags(false, false));
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
