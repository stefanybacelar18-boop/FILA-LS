import { describe, expect, it } from "vitest";
import { parseCsvRows } from "./parse-csv";

describe("parseCsvRows", () => {
  it("parseia CSV com aspas e virgulas", () => {
    const rows = parseCsvRows('a,b\n"hello, world",2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["hello, world", "2"],
    ]);
  });
});
