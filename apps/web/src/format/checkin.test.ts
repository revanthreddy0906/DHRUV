import { describe, expect, it } from "vitest";
import { checkInStatus, fieldLinkLine, formatDateRange } from "./checkin";

const rule = { intervalHours: 4, graceHours: 3, dueSoonMinutes: 30 };
const at = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;

describe("check-in status", () => {
  it("no check-in yet: no schedule lines", () => {
    expect(checkInStatus(undefined, at(24, "08:00"), rule)).toEqual({ state: "NONE", headline: "No check-in recorded yet" });
  });

  it("just checked in: on schedule, just now, due 11:00, overdue from 14:00", () => {
    expect(checkInStatus(at(25, "07:00"), at(25, "07:00"), rule)).toEqual({
      state: "ON_SCHEDULE", headline: "On schedule", checkedIn: "Checked in just now", schedule: "Next due 11:00 · overdue from 14:00",
    });
  });

  it("within 30 minutes of due: due soon; after due, inside grace: due now", () => {
    expect(checkInStatus(at(25, "07:00"), at(25, "10:29"), rule).state).toBe("ON_SCHEDULE");
    expect(checkInStatus(at(25, "07:00"), at(25, "10:30"), rule)).toMatchObject({ state: "DUE_SOON", headline: "Due soon" });
    expect(checkInStatus(at(25, "07:00"), at(25, "12:00"), rule)).toMatchObject({ state: "DUE_SOON", headline: "Due now" });
  });

  it("the demo's overdue moment: last confirmed 07:00, now 16:00", () => {
    expect(checkInStatus(at(25, "07:00"), at(25, "16:00"), rule)).toEqual({
      state: "OVERDUE", headline: "Overdue", checkedIn: "Checked in 9 h ago", schedule: "Due 11:00 · overdue since 14:00",
    });
  });

  it("times on another day carry their date", () => {
    expect(checkInStatus(at(24, "22:00"), at(24, "22:30"), rule).schedule).toBe("Next due 25 Jan 02:00 · overdue from 25 Jan 05:00");
  });
});

describe("field link line and dates", () => {
  it("one line, at most one separator", () => {
    expect(fieldLinkLine("ONLINE", "Maitri", 0, "14:35")).toBe("Online via Maitri · synced 14:35");
    expect(fieldLinkLine("OFFLINE", "Maitri", 2)).toBe("Offline via Maitri · 2 waiting to send");
    expect(fieldLinkLine("DEGRADED", "Maitri", 0)).toBe("Degraded via Maitri");
  });

  it("date ranges", () => {
    expect(formatDateRange("2027-02-03T00:00:00.000Z", "2027-02-10T00:00:00.000Z")).toBe("3–10 Feb");
    expect(formatDateRange("2027-01-28T00:00:00.000Z", "2027-02-03T00:00:00.000Z")).toBe("28 Jan – 3 Feb");
  });
});
