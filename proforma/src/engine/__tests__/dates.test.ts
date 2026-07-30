import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  formatDate,
  monthKey,
  startOfMonth,
  startOfWeek,
} from "../dates.ts";

describe("date arithmetic", () => {
  it("crosses month ends", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("counts days in both directions", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
    expect(daysBetween("2026-03-15", "2026-03-01")).toBe(-14);
  });

  it("holds the day of month where it can", () => {
    expect(addMonths("2026-03-15", 3)).toBe("2026-06-15");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("handles a leap day anniversary", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("finds the anniversary of an appointment", () => {
    expect(addYears("2025-09-15", 2)).toBe("2027-09-15");
  });
});

describe("period boundaries", () => {
  it("walks back to Monday", () => {
    expect(startOfWeek("2026-03-04")).toBe("2026-03-02"); // Wednesday to Monday
  });

  it("treats Monday as its own week start", () => {
    expect(startOfWeek("2026-03-02")).toBe("2026-03-02");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(startOfWeek("2026-03-08")).toBe("2026-03-02");
  });

  it("finds the first of the month", () => {
    expect(startOfMonth("2026-03-19")).toBe("2026-03-01");
    expect(monthKey("2026-03-19")).toBe("2026-03");
  });
});

describe("display", () => {
  it("drops leading zeros", () => {
    expect(formatDate("2026-03-04")).toBe("3/4/26");
  });
});
