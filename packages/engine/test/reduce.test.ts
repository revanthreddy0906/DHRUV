import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import { reduce, type State } from "../src/index.js";

const fixtureSeed: Seed = {
  nodes: [
    { id: "node-1", name: "Maitri", type: "STATION", lat: -70.767, lon: 11.733 },
  ],
  vessels: [
    {
      id: "vessel-1",
      name: "MV Bharati",
      departure: "2026-11-01T00:00:00.000Z",
      load_cutoff: "2026-10-25T00:00:00.000Z",
      eta_station: "2026-12-15T00:00:00.000Z",
      station_closing_date: "2027-02-15T00:00:00.000Z",
    },
  ],
  shipments: [
    { id: "shipment-1", name: "Winter Fuel", priority: "CRITICAL", dest_node_id: "node-1" },
  ],
  legs: [
    {
      id: "leg-1",
      shipment_id: "shipment-1",
      seq: 1,
      from_node: "node-1",
      to_node: "node-1",
      etd: "2026-11-01T00:00:00.000Z",
      eta: "2026-12-15T00:00:00.000Z",
      vessel_id: "vessel-1",
      status: "PLANNED",
    },
  ],
  inventory_items: [
    {
      id: "item-1",
      node_id: "node-1",
      name: "Polar Diesel",
      category: "Fuel",
      unit: "kL",
      stock: 100,
      reserve_pct: 0.15,
      requirement_mode: "BURN",
      fixed_requirement: null,
      dimension: "FUEL",
      last_counted: "2026-10-01T00:00:00.000Z",
      count_source: "PHYSICAL",
    },
  ],
  consumption_profiles: [
    { item_id: "item-1", phase: "WINTER", rate_per_day: 0.5 },
  ],
  cargo_items: [
    { id: "cargo-1", shipment_id: "shipment-1", inventory_item_id: "item-1", qty: 50 },
  ],
  personnel: [
    {
      id: "person-1",
      name: "Dr. A. Sharma",
      role: "STATION_LEADER",
      node_id: "node-1",
      status: "ON_STATION",
      last_seen: "2026-10-01T00:00:00.000Z",
    },
  ],
  assets: [
    {
      id: "asset-1",
      node_id: "node-1",
      type: "GENERATOR",
      status: "OK",
      lat: -70.767,
      lon: 11.733,
      last_seen: "2026-10-01T00:00:00.000Z",
      speed_kmh: null,
    },
  ],
  missions: [
    {
      id: "mission-1",
      node_id: "node-1",
      name: "Traverse Survey",
      start_date: "2026-11-01T00:00:00.000Z",
      end_date: "2026-11-10T00:00:00.000Z",
      fuel_kl: 5,
      needs: "Vehicle",
      status: "PLANNED",
    },
  ],
  levers: [],
  dependencies: [],
  link_state: [
    { node_id: "node-1", status: "ONLINE", last_contact: "2026-10-01T00:00:00.000Z" },
  ],
};

function serializeState(s: State): string {
  return JSON.stringify({
    asOf: s.asOf,
    inventory: Array.from(s.inventory.entries()),
    legs: Array.from(s.legs.entries()),
    vessels: Array.from(s.vessels.entries()),
    personnel: Array.from(s.personnel.entries()),
    assets: Array.from(s.assets.entries()),
    missions: Array.from(s.missions.entries()),
    links: Array.from(s.links.entries()),
    decisions: Array.from(s.decisions.entries()),
  });
}

describe("reduce", () => {
  it("1. Commutative stock (Class B): issue and receive order invariance", () => {
    const issueEvent: OpEvent = {
      event_id: "b2d86121-6dc6-4861-8ff8-9fa0f9227181",
      device_id: "device-sl-1",
      seq: 1,
      type: "STOCK_ISSUED",
      entity_type: "inventory_item",
      entity_id: "item-1",
      node_id: "node-1",
      payload: { item_id: "item-1", qty: 10, reason: "generator daily run" },
      observed_at: "2026-10-02T10:00:00.000Z",
      created_at_client: "2026-10-02T10:00:00.000Z",
      priority: 2,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const receiveEvent: OpEvent = {
      event_id: "9c3c178f-6fa1-4a11-b0db-6e651e796043",
      device_id: "device-sl-1",
      seq: 2,
      type: "STOCK_RECEIVED",
      entity_type: "inventory_item",
      entity_id: "item-1",
      node_id: "node-1",
      payload: { item_id: "item-1", qty: 5 },
      observed_at: "2026-10-02T11:00:00.000Z",
      created_at_client: "2026-10-02T11:00:00.000Z",
      priority: 2,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const stateOrderA = reduce(fixtureSeed, [issueEvent, receiveEvent]);
    const stateOrderB = reduce(fixtureSeed, [receiveEvent, issueEvent]);

    expect(stateOrderA.inventory.get("item-1")?.stock).toBe(95);
    expect(stateOrderB.inventory.get("item-1")?.stock).toBe(95);
    expect(stateOrderA.inventory.get("item-1")?.stock).toBe(
      stateOrderB.inventory.get("item-1")?.stock,
    );
  });

  it("2. Last-write-wins (Class C): later observed_at wins regardless of array order", () => {
    const earlierEvent: OpEvent = {
      event_id: "3e46c7ae-f2bb-4ee8-b217-2db93ec22df5",
      device_id: "device-hq-1",
      seq: 1,
      type: "LEG_UPDATED",
      entity_type: "leg",
      entity_id: "leg-1",
      node_id: "node-1",
      payload: { leg_id: "leg-1", eta: "2026-12-20T00:00:00.000Z", status: "IN_TRANSIT" },
      observed_at: "2026-10-02T10:00:00.000Z",
      created_at_client: "2026-10-02T10:00:00.000Z",
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const laterEvent: OpEvent = {
      event_id: "148f32c3-1ff6-42d4-bb64-fe118a1a38f3",
      device_id: "device-hq-1",
      seq: 2,
      type: "LEG_UPDATED",
      entity_type: "leg",
      entity_id: "leg-1",
      node_id: "node-1",
      payload: { leg_id: "leg-1", eta: "2026-12-25T00:00:00.000Z", status: "DELAYED" },
      observed_at: "2026-10-03T10:00:00.000Z",
      created_at_client: "2026-10-03T10:00:00.000Z",
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const state = reduce(fixtureSeed, [laterEvent, earlierEvent]);

    expect(state.legs.get("leg-1")?.eta).toBe("2026-12-25T00:00:00.000Z");
    expect(state.legs.get("leg-1")?.status).toBe("DELAYED");
  });

  it("3. Conservative safety-critical merge (Class CS): conflicting device reports resolve conservatively", () => {
    const eventOk: OpEvent = {
      event_id: "b452e808-bf3a-4da2-9bfe-30c1ce604db0",
      device_id: "device-sl-1",
      seq: 1,
      type: "ASSET_STATUS_SET",
      entity_type: "asset",
      entity_id: "asset-1",
      node_id: "node-1",
      payload: { asset_id: "asset-1", status: "OK" },
      observed_at: "2026-10-02T12:00:00.000Z",
      created_at_client: "2026-10-02T12:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const eventDown: OpEvent = {
      event_id: "c87f3b89-6fa2-43bb-a53f-b64bb93be059",
      device_id: "device-hq-1",
      seq: 1,
      type: "ASSET_STATUS_SET",
      entity_type: "asset",
      entity_id: "asset-1",
      node_id: "node-1",
      payload: { asset_id: "asset-1", status: "DOWN" },
      observed_at: "2026-10-02T11:00:00.000Z",
      created_at_client: "2026-10-02T11:00:00.000Z",
      priority: 1,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const stateA = reduce(fixtureSeed, [eventOk, eventDown]);
    const stateB = reduce(fixtureSeed, [eventDown, eventOk]);

    expect(stateA.assets.get("asset-1")?.status).toBe("DOWN");
    expect(stateB.assets.get("asset-1")?.status).toBe("DOWN");
  });

  it("4. PERSON_MOVED (Class A): updates personnel node_id to destination node", () => {
    const movedEvent: OpEvent = {
      event_id: "97b1a134-8711-477e-9fca-bb98bca487cb",
      device_id: "device-sl-1",
      seq: 1,
      type: "PERSON_MOVED",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: {
        person_id: "person-1",
        from_node: "node-1",
        to_node: "node-2",
        depart: "2026-10-02T08:00:00.000Z",
        arrive: "2026-10-02T18:00:00.000Z",
      },
      observed_at: "2026-10-02T18:00:00.000Z",
      created_at_client: "2026-10-02T18:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const state = reduce(fixtureSeed, [movedEvent]);

    expect(state.personnel.get("person-1")?.nodeId).toBe("node-2");
    expect(state.personnel.get("person-1")?.lastObservedAt).toBe("2026-10-02T18:00:00.000Z");
  });

  it("5. Determinism / shuffle invariance: 10 mixed events shuffled 100 times produce identical State", () => {
    const mixedEvents: OpEvent[] = [
      {
        event_id: "10000000-0000-4000-8000-000000000001",
        device_id: "dev-1", seq: 1, type: "STOCK_COUNTED",
        entity_type: "inventory_item", entity_id: "item-1", node_id: "node-1",
        payload: { item_id: "item-1", qty: 90 },
        observed_at: "2026-10-02T08:00:00.000Z", created_at_client: "2026-10-02T08:00:00.000Z",
        priority: 2, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000002",
        device_id: "dev-1", seq: 2, type: "STOCK_ISSUED",
        entity_type: "inventory_item", entity_id: "item-1", node_id: "node-1",
        payload: { item_id: "item-1", qty: 10, reason: "generator daily" },
        observed_at: "2026-10-02T09:00:00.000Z", created_at_client: "2026-10-02T09:00:00.000Z",
        priority: 2, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000003",
        device_id: "dev-1", seq: 3, type: "STOCK_RECEIVED",
        entity_type: "inventory_item", entity_id: "item-1", node_id: "node-1",
        payload: { item_id: "item-1", qty: 25 },
        observed_at: "2026-10-02T10:00:00.000Z", created_at_client: "2026-10-02T10:00:00.000Z",
        priority: 2, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000004",
        device_id: "dev-hq", seq: 1, type: "LEG_UPDATED",
        entity_type: "leg", entity_id: "leg-1", node_id: "node-1",
        payload: { leg_id: "leg-1", eta: "2026-12-20T00:00:00.000Z", status: "IN_TRANSIT" },
        observed_at: "2026-10-02T11:00:00.000Z", created_at_client: "2026-10-02T11:00:00.000Z",
        priority: 3, actor_role: "HQ_OPS", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000005",
        device_id: "dev-hq", seq: 2, type: "LEG_DELAYED",
        entity_type: "leg", entity_id: "leg-1", node_id: "node-1",
        payload: { leg_id: "leg-1", new_eta: "2026-12-28T00:00:00.000Z", reason: "Sea ice" },
        observed_at: "2026-10-02T12:00:00.000Z", created_at_client: "2026-10-02T12:00:00.000Z",
        priority: 3, actor_role: "HQ_OPS", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000006",
        device_id: "dev-hq", seq: 3, type: "VESSEL_UPDATED",
        entity_type: "vessel", entity_id: "vessel-1", node_id: "node-1",
        payload: { vessel_id: "vessel-1", departure: "2026-11-05T00:00:00.000Z" },
        observed_at: "2026-10-02T13:00:00.000Z", created_at_client: "2026-10-02T13:00:00.000Z",
        priority: 3, actor_role: "HQ_OPS", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000007",
        device_id: "dev-1", seq: 4, type: "ASSET_STATUS_SET",
        entity_type: "asset", entity_id: "asset-1", node_id: "node-1",
        payload: { asset_id: "asset-1", status: "OK" },
        observed_at: "2026-10-02T14:00:00.000Z", created_at_client: "2026-10-02T14:00:00.000Z",
        priority: 1, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000008",
        device_id: "dev-2", seq: 1, type: "ASSET_STATUS_SET",
        entity_type: "asset", entity_id: "asset-1", node_id: "node-1",
        payload: { asset_id: "asset-1", status: "DEGRADED" },
        observed_at: "2026-10-02T15:00:00.000Z", created_at_client: "2026-10-02T15:00:00.000Z",
        priority: 1, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000009",
        device_id: "dev-1", seq: 5, type: "PERSON_MOVED",
        entity_type: "personnel", entity_id: "person-1", node_id: "node-1",
        payload: {
          person_id: "person-1", from_node: "node-1", to_node: "node-2",
          depart: "2026-10-02T08:00:00.000Z", arrive: "2026-10-02T16:00:00.000Z",
        },
        observed_at: "2026-10-02T16:00:00.000Z", created_at_client: "2026-10-02T16:00:00.000Z",
        priority: 1, actor_role: "STATION_LEADER", schema_version: 1,
      },
      {
        event_id: "10000000-0000-4000-8000-000000000010",
        device_id: "dev-sys", seq: 1, type: "LINK_STATE_SET",
        entity_type: "link", entity_id: "node-1", node_id: "node-1",
        payload: { node_id: "node-1", status: "DEGRADED" },
        observed_at: "2026-10-02T17:00:00.000Z", created_at_client: "2026-10-02T17:00:00.000Z",
        priority: 4, actor_role: "SYSTEM", schema_version: 1,
      },
    ];

    const baseState = reduce(fixtureSeed, mixedEvents);
    const baseSerialized = serializeState(baseState);

    let seed = 42;
    function pseudoRandom(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    function shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(pseudoRandom() * (i + 1));
        const temp = copy[i]!;
        copy[i] = copy[j]!;
        copy[j] = temp;
      }
      return copy;
    }

    for (let run = 0; run < 100; run++) {
      const shuffled = shuffle(mixedEvents);
      const state = reduce(fixtureSeed, shuffled);
      expect(serializeState(state)).toBe(baseSerialized);
      expect(state).toEqual(baseState);
    }
  });

  it("6. Stock issue does not reset the freshness clock (only STOCK_COUNTED does)", () => {
    const issueEvent: OpEvent = {
      event_id: "6a1f0c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b",
      device_id: "device-sl-1",
      seq: 1,
      type: "STOCK_ISSUED",
      entity_type: "inventory_item",
      entity_id: "item-1",
      node_id: "node-1",
      payload: { item_id: "item-1", qty: 10, reason: "generator daily run" },
      observed_at: "2026-10-05T00:00:00.000Z",
      created_at_client: "2026-10-05T00:00:00.000Z",
      priority: 2,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const state = reduce(fixtureSeed, [issueEvent]);

    expect(state.inventory.get("item-1")?.stock).toBe(90);
    expect(state.inventory.get("item-1")?.lastObservedAt).toBe("2026-10-01T00:00:00.000Z");
  });
  it("7. Non-critical person status is plain last-write-wins, not conservative", () => {
    const events: OpEvent[] = [
    {
      event_id: "7a000000-0000-4000-8000-000000000001",
      device_id: "device-a",
      seq: 1,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: { person_id: "person-1", status: "EVACUATED" },
      observed_at: "2026-10-02T10:00:00.000Z",
      created_at_client: "2026-10-02T10:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    },
    {
      event_id: "7b000000-0000-4000-8000-000000000002",
      device_id: "device-b",
      seq: 1,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: { person_id: "person-1", status: "ON_STATION" },
      observed_at: "2026-10-02T12:00:00.000Z",
      created_at_client: "2026-10-02T12:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    },
    ];

    const state = reduce(fixtureSeed, events);

    expect(state.personnel.get("person-1")?.status).toBe("ON_STATION");
  });

  it("8. Safety-critical person status still persists over a later benign update", () => {
    const events: OpEvent[] = [
    {
      event_id: "8a000000-0000-4000-8000-000000000001",
      device_id: "device-a",
      seq: 1,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: { person_id: "person-1", status: "ON_STATION" },
      observed_at: "2026-10-02T10:00:00.000Z",
      created_at_client: "2026-10-02T10:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    },
    {
      event_id: "8b000000-0000-4000-8000-000000000002",
      device_id: "device-b",
      seq: 1,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: { person_id: "person-1", status: "INJURED" },
      observed_at: "2026-10-02T11:00:00.000Z",
      created_at_client: "2026-10-02T11:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    },
    {
      event_id: "8a000000-0000-4000-8000-000000000003",
      device_id: "device-a",
      seq: 2,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "person-1",
      node_id: "node-1",
      payload: { person_id: "person-1", status: "ON_STATION" },
      observed_at: "2026-10-02T12:00:00.000Z",
      created_at_client: "2026-10-02T12:00:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    },
    ];

    const state = reduce(fixtureSeed, events);

    expect(state.personnel.get("person-1")?.status).toBe("INJURED");
  });
});
