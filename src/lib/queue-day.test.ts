import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addManausDays,
  getWeekdayYmd,
  isWeekendYmd,
  nextBusinessDayYmd,
} from "./queue-day";

describe("addManausDays", () => {
  it("soma dias civis em YYYY-MM-DD", () => {
    expect(addManausDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addManausDays("2026-06-30", -1)).toBe("2026-06-29");
  });
});

describe("isWeekendYmd", () => {
  it("identifica sábado e domingo", () => {
    expect(getWeekdayYmd("2026-07-04")).toBe(6);
    expect(isWeekendYmd("2026-07-04")).toBe(true);
    expect(isWeekendYmd("2026-07-06")).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("pula fim de semana", () => {
    expect(addBusinessDays("2026-07-03", 1)).toBe("2026-07-06");
  });

  it("retorna o mesmo dia com offset zero", () => {
    expect(addBusinessDays("2026-07-06", 0)).toBe("2026-07-06");
  });
});

describe("nextBusinessDayYmd", () => {
  it("avança sexta para segunda", () => {
    expect(nextBusinessDayYmd("2026-07-03")).toBe("2026-07-06");
  });
});
