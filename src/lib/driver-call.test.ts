import { describe, expect, it } from "vitest";
import { isNewDriverCall, parseCalledAtMs } from "./driver-call";

describe("driver-call", () => {
  it("parseCalledAtMs returns 0 for empty", () => {
    expect(parseCalledAtMs(null)).toBe(0);
    expect(parseCalledAtMs(undefined)).toBe(0);
  });

  it("isNewDriverCall only when timestamp advances", () => {
    const t1 = "2026-07-09T12:00:00.000Z";
    const t2 = "2026-07-09T12:05:00.000Z";
    expect(isNewDriverCall(null, t1)).toBe(true);
    expect(isNewDriverCall(t1, t2)).toBe(true);
    expect(isNewDriverCall(t1, t1)).toBe(false);
    expect(isNewDriverCall(t2, t1)).toBe(false);
    expect(isNewDriverCall(t1, null)).toBe(false);
  });
});
