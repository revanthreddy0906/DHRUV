import type Database from "better-sqlite3";

/**
 * Build Bible section 14 (LOCKED). The events table is the source of truth; every other
 * table is seed/reference data or a read-friendly view that can be rebuilt from events.
 */
export function applySchema(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      event_id           TEXT PRIMARY KEY,
      device_id          TEXT NOT NULL,
      seq                INTEGER NOT NULL,
      type               TEXT NOT NULL,
      entity_type        TEXT NOT NULL,
      entity_id          TEXT NOT NULL,
      node_id            TEXT NOT NULL,
      payload            TEXT NOT NULL,
      observed_at        TEXT NOT NULL,
      created_at_client  TEXT NOT NULL,
      recorded_at_server TEXT,
      priority           INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 5),
      actor_role         TEXT NOT NULL,
      schema_version     INTEGER NOT NULL DEFAULT 1,
      server_cursor      INTEGER,
      UNIQUE (device_id, seq)
    );
    CREATE INDEX IF NOT EXISTS ix_events_entity ON events (entity_type, entity_id, observed_at);
    CREATE INDEX IF NOT EXISTS ix_events_cursor ON events (server_cursor);
    CREATE INDEX IF NOT EXISTS ix_events_type   ON events (type, observed_at);

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('HQ','PORT','CITY','VESSEL','STATION')),
      lat REAL, lon REAL
    );

    CREATE TABLE IF NOT EXISTS vessels (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      departure TEXT NOT NULL, load_cutoff TEXT NOT NULL,
      eta_station TEXT NOT NULL, station_closing_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL','HIGH','NORMAL')),
      dest_node_id TEXT NOT NULL REFERENCES nodes(id)
    );

    CREATE TABLE IF NOT EXISTS legs (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id),
      seq INTEGER NOT NULL,
      from_node TEXT NOT NULL REFERENCES nodes(id),
      to_node   TEXT NOT NULL REFERENCES nodes(id),
      etd TEXT, eta TEXT NOT NULL,
      vessel_id TEXT REFERENCES vessels(id),
      status TEXT NOT NULL CHECK (status IN ('PLANNED','IN_TRANSIT','DONE','DELAYED'))
    );
    CREATE INDEX IF NOT EXISTS ix_legs_shipment ON legs (shipment_id, seq);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES nodes(id),
      name TEXT NOT NULL, category TEXT NOT NULL,
      unit TEXT NOT NULL,
      stock REAL NOT NULL,
      reserve_pct REAL NOT NULL,
      requirement_mode TEXT NOT NULL CHECK (requirement_mode IN ('BURN','FIXED')),
      fixed_requirement REAL,
      dimension TEXT NOT NULL CHECK (dimension IN ('FUEL','FOOD','MEDICAL','SPARES_POWER')),
      last_counted TEXT NOT NULL,
      count_source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consumption_profiles (
      item_id TEXT NOT NULL REFERENCES inventory_items(id),
      phase TEXT NOT NULL CHECK (phase IN ('CLOSING','WINTER','MOBILISATION')),
      rate_per_day REAL NOT NULL,
      PRIMARY KEY (item_id, phase)
    );

    CREATE TABLE IF NOT EXISTS cargo_items (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id),
      inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
      qty REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personnel (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      role TEXT NOT NULL, node_id TEXT NOT NULL REFERENCES nodes(id),
      status TEXT NOT NULL, last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
      type TEXT NOT NULL, status TEXT NOT NULL,
      lat REAL, lon REAL, last_seen TEXT, speed_kmh REAL
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
      name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      fuel_kl REAL DEFAULT 0, needs TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS levers (
      id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
      label TEXT NOT NULL, effect TEXT NOT NULL,
      cutoff TEXT NOT NULL, lead_days INTEGER NOT NULL,
      cost_amount REAL, cost_unit TEXT, synthetic INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS dependencies (
      from_type TEXT NOT NULL, from_id TEXT NOT NULL,
      to_type TEXT NOT NULL, to_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (from_type, from_id, to_type, to_id, kind)
    );

    CREATE TABLE IF NOT EXISTS link_state (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id),
      status TEXT NOT NULL CHECK (status IN ('ONLINE','DEGRADED','OFFLINE')),
      last_contact TEXT
    );

    -- Read-friendly views of DECISION_* and CONFLICT_* events.
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY, trigger_event_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PROPOSED','APPROVED','REJECTED')),
      options TEXT NOT NULL, trace TEXT NOT NULL,
      chosen_option_id TEXT, approver TEXT, verify_ack INTEGER, decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      field TEXT NOT NULL, contenders TEXT NOT NULL, conservative_value TEXT,
      status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED')),
      resolved_value TEXT, resolver TEXT
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL,
      opened_at TEXT NOT NULL, last_confirmed_at TEXT, involved TEXT NOT NULL
    );
  `);
}

export const SEED_TABLES = [
  "nodes",
  "vessels",
  "shipments",
  "legs",
  "inventory_items",
  "consumption_profiles",
  "cargo_items",
  "personnel",
  "assets",
  "missions",
  "levers",
  "dependencies",
  "link_state",
] as const;

/** Child tables before parents, so deletes respect foreign keys. */
export const DERIVED_TABLES = ["events", "decisions", "conflicts", "incidents"] as const;
