import { emptySeed, type EventType, type OpEvent, type Seed } from "@dhruv/shared";

/** Section 10 emergency scenario on a minimal seed (SYNTHETIC coordinates and speeds from section 13). */
export function scenarioSeed(): Seed {
  const seed = emptySeed();
  seed.nodes = [
    { id: "HQ", name: "Goa HQ", type: "HQ", lat: 15.4, lon: 73.79 },
    { id: "MUMBAI", name: "Mumbai port", type: "PORT", lat: 18.95, lon: 72.84 },
    { id: "CAPE_TOWN", name: "Cape Town", type: "CITY", lat: -33.92, lon: 18.42 },
    { id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
  ];
  const at = (id: string, type: string, speed: number | null, lat: number | null = -70.77, lon: number | null = 11.73) => ({
    id,
    node_id: "MAITRI",
    type,
    status: "OK",
    lat,
    lon,
    last_seen: "2027-01-24T08:00:00.000Z",
    speed_kmh: speed,
  });
  seed.assets = [at("HX-1", "Helicopter", 120), at("SK-1", "Skidoo", 30), at("SK-2", "Skidoo", 30), at("PB-1", "Snow tractor", 15), at("SK-4", "Skidoo", 30, null, null), at("GEN-1", "Generator", null)];
  const leg = (id: string, seq: number, from: string, to: string, status: "DONE" | "IN_TRANSIT" | "PLANNED", eta: string) => ({
    id,
    shipment_id: "C-104",
    seq,
    from_node: from,
    to_node: to,
    etd: null,
    eta,
    vessel_id: null,
    status,
  });
  seed.legs = [
    leg("L1-C104", 1, "HQ", "MUMBAI", "DONE", "2027-01-12T00:00:00.000Z"),
    leg("L2-C104", 2, "MUMBAI", "CAPE_TOWN", "IN_TRANSIT", "2027-02-02T00:00:00.000Z"),
    leg("L3-C104", 3, "CAPE_TOWN", "MAITRI", "PLANNED", "2027-02-24T00:00:00.000Z"),
  ];
  return seed;
}

let seq = 0;
export function ev(type: EventType, device_id: string, payload: Record<string, unknown>, observed_at: string): OpEvent {
  seq += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    device_id,
    seq,
    type,
    entity_type: "x",
    entity_id: "x",
    node_id: "MAITRI",
    payload,
    observed_at,
    created_at_client: observed_at,
    priority: 1,
    actor_role: "SYSTEM",
    schema_version: 1,
  };
}

export const NOW = "2027-01-25T16:00:00.000Z";

export function scenarioEvents(): OpEvent[] {
  return [
    ev("LEG_DELAYED", "DIRECTOR", { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder vessel delayed" }, "2027-01-24T08:10:00.000Z"),
    ev("ASSET_STATUS_SET", "MAITRI-TAB-01", { asset_id: "SK-2", status: "DOWN", note: "track fault" }, "2027-01-24T09:20:00.000Z"),
    ev("ASSET_STATUS_SET", "DIRECTOR", { asset_id: "SK-2", status: "OK" }, "2027-01-24T11:00:00.000Z"),
    ev(
      "CONFLICT_FLAGGED",
      "SERVER",
      { conflict_id: "CF-1", entity_type: "asset", entity_id: "SK-2", field: "status", contenders: [], conservative_value: "DOWN" },
      "2027-01-24T11:00:00.000Z",
    ),
    ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: "FT-3", lat: -70.62, lon: 12.1 }, "2027-01-25T07:00:00.000Z"),
    ev(
      "INCIDENT_OPENED",
      "MAITRI-TAB-01",
      { incident_id: "INC-01", type: "OVERDUE_CHECKIN", person_ids: ["P-VERMA", "P-NAIR"], team_id: "FT-3", last_confirmed_at: "2027-01-25T07:00:00.000Z" },
      NOW,
    ),
  ];
}
