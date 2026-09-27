import { describe, expect, it } from "vitest";
import {
  formatAge, formatAgeMinutes, formatAgo, formatDate, formatDateTime, formatHaveNeed, formatMargin, formatQty, formatRatio, formatSimClock,
} from "./index";

describe("formatRatio", () => {
  it("shows 3 decimals truncated toward zero", () => {
    expect(formatRatio(0.697)).toBe("0.697");
    expect(formatRatio(0.6970)).toBe("0.697");
    expect(formatRatio(1.0606)).toBe("1.060");
    expect(formatRatio(1.0334)).toBe("1.033");
    expect(formatRatio(1.1785)).toBe("1.178");
  });
  it("never crosses a threshold the state does not", () => {
    expect(formatRatio(1.04996)).toBe("1.049");
    expect(formatRatio(0.94999)).toBe("0.949");
    expect(formatRatio(1.05)).toBe("1.050");
    expect(formatRatio(0.95)).toBe("0.950");
  });
  it("says unknown for a missing ratio", () => {
    expect(formatRatio(null)).toBe("unknown");
    expect(formatRatio(undefined)).toBe("unknown");
  });
});

describe("formatMargin", () => {
  it("fuel in kL, one decimal", () => {
    expect(formatMargin(140, 132, "kL")).toBe("+8.0 kL margin");
    expect(formatMargin(92, 132, "kL")).toBe("−40.0 kL short");
  });
  it("person-days and kits in their own units", () => {
    expect(formatMargin(3, 8280, "person-days")).toBe("−8,277 person-days short");
    expect(formatMargin(8900, 8280, "person-days")).toBe("+620 person-days margin");
    expect(formatMargin(12, 9, "kits")).toBe("+3 kits margin");
    expect(formatMargin(4, 4.5, "kits")).toBe("−0.5 kits short");
  });
  it("never reads −0", () => {
    expect(formatMargin(131.97, 132, "kL")).toBe("+0.0 kL margin");
  });
  it("returns undefined when the engine did not expose both values", () => {
    expect(formatMargin(undefined, 132, "kL")).toBeUndefined();
    expect(formatMargin(92, null, "kL")).toBeUndefined();
  });
  it("have of need", () => {
    expect(formatHaveNeed(3, 8280, "person-days")).toBe("3 of 8,280 person-days");
    expect(formatHaveNeed(140, 132, "kL")).toBe("140.0 of 132.0 kL");
  });
});

describe("formatQty", () => {
  it("unit after a space, unknown for missing", () => {
    expect(formatQty(92, "kL")).toBe("92.0 kL");
    expect(formatQty(8900, "person-days")).toBe("8,900 person-days");
    expect(formatQty(undefined, "kL")).toBe("unknown");
  });
});

describe("ages", () => {
  it("never shows 0 m", () => {
    expect(formatAgeMinutes(0)).toBe("just now");
    expect(formatAgeMinutes(0.5)).toBe("just now");
    expect(formatAgeMinutes(25)).toBe("25 m");
  });
  it("hours up to 48 h, then days and hours", () => {
    expect(formatAgeMinutes(4 * 60)).toBe("4 h");
    expect(formatAgeMinutes(6 * 60 + 50)).toBe("6 h 50 m");
    expect(formatAgeMinutes(36 * 60 + 10)).toBe("36 h");
    expect(formatAgeMinutes(47 * 60)).toBe("47 h");
    expect(formatAgeMinutes(70 * 60)).toBe("2 d 22 h");
    expect(formatAgeMinutes(72 * 60)).toBe("3 d");
  });
  it("between ISO times, and ago", () => {
    expect(formatAge("2027-01-24T04:00:00.000Z", "2027-01-24T08:00:00.000Z")).toBe("4 h");
    expect(formatAgo("2027-01-24T04:00:00.000Z", "2027-01-24T08:00:00.000Z")).toBe("4 h ago");
    expect(formatAgo("2027-01-24T08:00:00.000Z", "2027-01-24T08:00:00.000Z")).toBe("just now");
  });
});

describe("dates", () => {
  it("date, date-time and the sim clock", () => {
    expect(formatDate("2027-02-03T00:00:00.000Z")).toBe("3 Feb");
    expect(formatDateTime("2027-01-24T08:00:00.000Z")).toBe("24 Jan 08:00");
    expect(formatSimClock("2027-01-24T08:00:00.000Z")).toBe("24 Jan 2027, 08:00");
  });
});
