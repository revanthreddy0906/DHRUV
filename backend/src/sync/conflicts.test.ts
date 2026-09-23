import { describe, expect, it } from "vitest";
import { listConflicts } from "../db/projections.js";
import { login, makeApp, makeEvent, pull, push, t } from "../test/helpers.js";

const SK2 = { entity_type: "asset", entity_id: "SK-2" };

describe("conflict detection on sync (sections 6 and 9, beat 10)", () => {
  it("SK-2 DOWN at Maitri vs OK at HQ: keeps DOWN, emits CONFLICT_FLAGGED once", async () => {
    const { app, db } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");

    // Beat 5 reaches the server first (HQ is online); Maitri's offline beat-4 entry arrives on sync.
    await push(app, hq, [makeEvent(hq, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "OK" }, t(24, "11:00"), { node_id: "MAITRI" })]);
    const down = makeEvent(maitri, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN", note: "track fault" }, t(24, "09:20"));
    await push(app, maitri, [down]);
    await push(app, maitri, [down]);

    const open = listConflicts(db, "OPEN");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ entity_type: "asset", entity_id: "SK-2", field: "status", conservative_value: "DOWN" });
    expect(open[0].contenders.map((c) => c.value).sort()).toEqual(["DOWN", "OK"]);

    const hqView = await pull(app, hq);
    const flags = hqView.events.filter((e) => e.type === "CONFLICT_FLAGGED");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ actor_role: "SYSTEM", device_id: "SERVER", node_id: "MAITRI" });
  });

  it("CONFLICT_RESOLVED closes it and does not re-flag the settled contenders", async () => {
    const { app, db } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    await push(app, maitri, [makeEvent(maitri, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN" }, t(24, "09:20"))]);
    await push(app, hq, [makeEvent(hq, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "OK" }, t(24, "11:00"), { node_id: "MAITRI" })]);

    const [conflict] = listConflicts(db, "OPEN");
    await push(app, hq, [
      makeEvent(hq, "CONFLICT_RESOLVED", { entity_type: "conflict", entity_id: conflict.id }, { conflict_id: conflict.id, chosen_value: "DOWN", resolver: "HQ-WEB-01" }, t(25, "16:15"), {
        node_id: "MAITRI",
      }),
    ]);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);
    expect(listConflicts(db, "RESOLVED")[0]).toMatchObject({ id: conflict.id });

    // A later same-device update after resolution is not a new disagreement.
    await push(app, maitri, [makeEvent(maitri, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN" }, t(25, "17:00"))]);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);
  });

  it("person status only conflicts when INJURED or UNAVAILABLE is involved", async () => {
    const { app, db } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const person = { entity_type: "person", entity_id: "P-NAIR" };

    await push(app, maitri, [makeEvent(maitri, "PERSON_STATUS_SET", person, { person_id: "P-NAIR", status: "FIELD" }, t(24, "09:00"))]);
    await push(app, hq, [makeEvent(hq, "PERSON_STATUS_SET", person, { person_id: "P-NAIR", status: "ON_STATION" }, t(24, "10:00"), { node_id: "MAITRI" })]);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);

    await push(app, maitri, [makeEvent(maitri, "PERSON_STATUS_SET", person, { person_id: "P-NAIR", status: "INJURED" }, t(24, "11:00"))]);
    expect(listConflicts(db, "OPEN")[0]).toMatchObject({ entity_id: "P-NAIR", conservative_value: "INJURED" });
  });

  it("flags negative stock after merge (class B) but not a commutative sum that stays positive", async () => {
    const { app, db } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const kits = { entity_type: "inventory_item", entity_id: "INV-MEDKIT" };

    await push(app, maitri, [
      makeEvent(maitri, "STOCK_COUNTED", kits, { item_id: "INV-MEDKIT", qty: 2 }, t(24, "08:00")),
      makeEvent(maitri, "STOCK_ISSUED", kits, { item_id: "INV-MEDKIT", qty: 1, reason: "use" }, t(24, "09:00")),
    ]);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);

    await push(app, maitri, [makeEvent(maitri, "STOCK_ISSUED", kits, { item_id: "INV-MEDKIT", qty: 3, reason: "use" }, t(24, "10:00"))]);
    expect(listConflicts(db, "OPEN")[0]).toMatchObject({ entity_type: "inventory_item", entity_id: "INV-MEDKIT", field: "stock", conservative_value: -2 });
  });

  it("flags a person double-assigned to overlapping missions", async () => {
    const { app, db } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const person = { entity_type: "person", entity_id: "P-VERMA" };

    await push(app, hq, [
      makeEvent(hq, "ASSIGNMENT_SET", person, { person_id: "P-VERMA", mission_id: "F-27", start: "2027-02-03T00:00:00.000Z", end: "2027-02-10T00:00:00.000Z" }, t(24, "08:00")),
      makeEvent(hq, "ASSIGNMENT_SET", person, { person_id: "P-VERMA", mission_id: "F-31", start: "2027-02-08T00:00:00.000Z", end: "2027-02-13T00:00:00.000Z" }, t(24, "08:05")),
    ]);
    expect(listConflicts(db, "OPEN")[0]).toMatchObject({ entity_id: "P-VERMA", field: "assignment" });
  });
});
