import { describe, expect, it } from "vitest";
import { personActionsFor } from "./PersonnelActionForm";

describe("personnel action form contract", () => {
  it("offers each role only the personnel actions EVENT_RULES allows", () => {
    expect(personActionsFor("STATION_LEADER").map((a) => a.type)).toEqual(["PERSON_STATUS_SET", "PERSON_MOVED"]);
    expect(personActionsFor("HQ_OPS").map((a) => a.type)).toEqual(["PERSON_STATUS_SET", "PERSON_MOVED"]);
    expect(personActionsFor("FIELD_LEAD").map((a) => a.type)).toEqual(["PERSON_STATUS_SET"]);
  });
});
