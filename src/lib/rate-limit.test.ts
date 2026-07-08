import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimitAllow, rateLimitRetryAfterSec } from "./rate-limit";

describe("rateLimitAllow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite até o limite na janela", () => {
    const key = `test-${Date.now()}`;
    expect(rateLimitAllow(key, 3, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 3, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 3, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 3, 60_000)).toBe(false);
  });

  it("reinicia após a janela", () => {
    const key = "reset-test";
    expect(rateLimitAllow(key, 1, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(rateLimitAllow(key, 1, 60_000)).toBe(true);
  });

  it("retorna segundos para retry", () => {
    const key = "retry-test";
    rateLimitAllow(key, 1, 60_000);
    rateLimitAllow(key, 1, 60_000);
    expect(rateLimitRetryAfterSec(key, 60_000)).toBeGreaterThan(0);
  });
});
