import { readFileSync } from "node:fs";
import path from "node:path";
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
function flags(
  heartbeatOn: boolean,
  fastHeartbeatOn = false,
  fixFastHeartbeatLoggingOn = false
) {
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
    "test-app.feature.fix-fast-heartbeat-logging": {
      variants: { on: true, off: false },
      defaultVariant: fixFastHeartbeatLoggingOn ? "on" : "off",
    },
  });
}

/**
 * Captures the real structured log lines the logger writes to stdout, so a
 * test asserts the actual JSON output (its level and message) rather than only
 * that a logger method was called.
 */
function captureLogLines(): Array<{ level?: string; message?: string }> {
  const lines: Array<{ level?: string; message?: string }> = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    for (const arg of args) {
      if (typeof arg !== "string") continue;
      try {
        const parsed = JSON.parse(arg);
        if (parsed && typeof parsed === "object") lines.push(parsed);
      } catch {
        // Not a structured log line; ignore.
      }
    }
  });
  return lines;
}

function fastHeartbeatLines(
  lines: Array<{ level?: string; message?: string }>
): Array<{ level?: string; message?: string }> {
  return lines.filter((line) => line.message === "heartbeat-fast");
}

describe("GET /api/heartbeat", () => {
  it("returns 404 while the heartbeat flag is off", async () => {
    OpenFeature.setProvider(flags(false));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat");

    expect(response.status).toBe(404);
  });

  it("returns 200 with the interval when the flag is on", async () => {
    OpenFeature.setProvider(flags(true));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ intervalSeconds: 2 });
  });

  it("records the heartbeat flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "heartbeat");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
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
  });

  it("returns 200 with a 1 second interval when the flag is on", async () => {
    OpenFeature.setProvider(flags(false, true));
    const app = createApp();

    const response = await request(app).get("/api/heartbeat/fast");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ intervalSeconds: 1 });
  });

  it("records the fast-heartbeat flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "fast-heartbeat");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
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

  it("logs nothing while the fast-heartbeat flag is off", async () => {
    OpenFeature.setProvider(flags(false, false));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");

    timer = startFastHeartbeatLogging();
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000 * 3);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("records the fix-fast-heartbeat-logging flag in flags.json", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "fix-fast-heartbeat-logging");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });

  // AC-2: while the fix flag is off, the original error-level behavior is kept.
  it("logs one error line per second while the fix flag is off", async () => {
    OpenFeature.setProvider(flags(false, true, false));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");
    const lines = captureLogLines();

    timer = startFastHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("heartbeat-fast");
    expect(infoSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy).not.toHaveBeenCalled();

    // The real structured output: two error-level heartbeat-fast lines.
    const emitted = fastHeartbeatLines(lines);
    expect(emitted).toHaveLength(2);
    expect(emitted.every((line) => line.level === "error")).toBe(true);
  });

  // AC-1: while the fix flag is on, the fast heartbeat logs at info level.
  it("logs one info line per second while the fix flag is on", async () => {
    OpenFeature.setProvider(flags(false, true, true));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");
    const lines = captureLogLines();

    timer = startFastHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("heartbeat-fast");
    expect(errorSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();

    // The real structured output: two info-level heartbeat-fast lines.
    const emitted = fastHeartbeatLines(lines);
    expect(emitted).toHaveLength(2);
    expect(emitted.every((line) => line.level === "info")).toBe(true);
  });

  // AC-3: without the fix, 100 seconds of fast heartbeat produce 100 error logs.
  it("produces 100 error logs over 100 seconds while the fix flag is off", async () => {
    OpenFeature.setProvider(flags(false, true, false));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");
    const lines = captureLogLines();

    timer = startFastHeartbeatLogging();
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000 * 100);

    expect(errorSpy).toHaveBeenCalledTimes(100);
    expect(errorSpy).toHaveBeenCalledWith("heartbeat-fast");
    expect(infoSpy).not.toHaveBeenCalled();

    // The real structured output: 100 error-level heartbeat-fast lines.
    const emitted = fastHeartbeatLines(lines);
    expect(emitted).toHaveLength(100);
    expect(emitted.every((line) => line.level === "error")).toBe(true);
  });

  // AC-4: with the fix, 100 seconds of fast heartbeat produce 0 error logs.
  it("produces 0 error logs over 100 seconds while the fix flag is on", async () => {
    OpenFeature.setProvider(flags(false, true, true));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");
    const lines = captureLogLines();

    timer = startFastHeartbeatLogging();
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000 * 100);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(100);
    expect(infoSpy).toHaveBeenCalledWith("heartbeat-fast");

    // The real structured output: 100 info-level lines and no error-level ones.
    const emitted = fastHeartbeatLines(lines);
    expect(emitted).toHaveLength(100);
    expect(emitted.every((line) => line.level === "info")).toBe(true);
  });

  it("stops logging within one second after the fast-heartbeat flag is turned off", async () => {
    OpenFeature.setProvider(flags(false, true, true));
    const errorSpy = vi.spyOn(logger, "error");
    const infoSpy = vi.spyOn(logger, "info");

    timer = startFastHeartbeatLogging();

    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(infoSpy).toHaveBeenCalledTimes(1);

    // The flag is re-read on every tick, so turning it off stops the logging
    // at the next tick — no more than one second later.
    OpenFeature.setProvider(flags(false, false, true));
    await vi.advanceTimersByTimeAsync(FAST_HEARTBEAT_INTERVAL_SECONDS * 1000);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

