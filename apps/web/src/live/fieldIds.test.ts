import { describe, expect, it } from "vitest";
import { nextIncidentId } from "./fieldIds";

describe("field incident ids", () => {
  it("INC-FT3-01 first, then the next number; other ids are ignored", () => {
    expect(nextIncidentId("FT-3", [])).toBe("INC-FT3-01");
    expect(nextIncidentId("FT-3", ["INC-01", "INC-FT3-01", "INC-FT3-07", "INC-FT4-09"])).toBe("INC-FT3-08");
  });
});
