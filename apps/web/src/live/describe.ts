import type { OpEvent, PayloadOf } from "@dhruv/shared";

/** Short operational summary of an event for the timeline and audit (section 17 microcopy). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Feb" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "−70.62, 12.10" with a true minus sign. */
export function coords(lat: number, lon: number): string {
  const f = (v: number) => (v < 0 ? `−${Math.abs(v).toFixed(2)}` : v.toFixed(2));
  return `${f(lat)}, ${f(lon)}`;
}

const INCIDENT_TYPE: Record<string, string> = { OVERDUE_CHECKIN: "overdue", SOS: "SOS", MEDICAL: "medical", INJURY: "injury" };
/** "overdue" for OVERDUE_CHECKIN; unknown types fall back to lower-case words. */
export const incidentTypeLabel = (type: string) => INCIDENT_TYPE[type] ?? type.replaceAll("_", " ").toLowerCase();

const show = (v: unknown) => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

export function describeEvent(e: OpEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "LEG_DELAYED": {
      const x = p as PayloadOf<"LEG_DELAYED">;
      return `${x.leg_id} ETA → ${dayLabel(x.new_eta)} · ${x.reason}`;
    }
    case "SHIPMENT_CREATED": {
      const x = p as PayloadOf<"SHIPMENT_CREATED">;
      const cargo = x.cargo.map((c) => `${c.inventory_item_id} ${c.qty}`).join(", ");
      return `${x.shipment_id} created → ${x.dest_node_id} · ${x.name}${cargo ? ` · ${cargo}` : ""} · ${x.legs.length} leg${x.legs.length === 1 ? "" : "s"}`;
    }
    case "LEG_UPDATED": {
      const x = p as PayloadOf<"LEG_UPDATED">;
      return [x.leg_id, x.etd && `ETD ${dayLabel(x.etd)}`, x.eta && `ETA ${dayLabel(x.eta)}`, x.status].filter(Boolean).join(" · ");
    }
    case "VESSEL_UPDATED": {
      const x = p as PayloadOf<"VESSEL_UPDATED">;
      return [x.vessel_id, x.departure && `departure ${dayLabel(x.departure)}`, x.load_cutoff && `load cutoff ${dayLabel(x.load_cutoff)}`, x.eta_station && `station ETA ${dayLabel(x.eta_station)}`]
        .filter(Boolean)
        .join(" · ");
    }
    case "STOCK_COUNTED": {
      const x = p as PayloadOf<"STOCK_COUNTED">;
      return `${x.item_id} counted ${x.qty}`;
    }
    case "STOCK_ISSUED": {
      const x = p as PayloadOf<"STOCK_ISSUED">;
      return `${x.item_id} ×${x.qty} issued · ${x.reason}`;
    }
    case "STOCK_RECEIVED": {
      const x = p as PayloadOf<"STOCK_RECEIVED">;
      return `${x.item_id} ${x.qty} received${x.shipment_id ? ` from ${x.shipment_id}` : ""}`;
    }
    case "BURN_RATE_CHANGED": {
      const x = p as PayloadOf<"BURN_RATE_CHANGED">;
      return `${x.item_id} ${x.phase.toLowerCase()} burn ${x.new_rate !== undefined ? `→ ${x.new_rate}/day` : `${x.uplift_pct}%`}`;
    }
    case "ASSET_STATUS_SET": {
      const x = p as PayloadOf<"ASSET_STATUS_SET">;
      return `${x.asset_id} ${x.status}${x.note ? ` · ${x.note}` : ""}`;
    }
    case "PERSON_STATUS_SET": {
      const x = p as PayloadOf<"PERSON_STATUS_SET">;
      return `${x.person_id} ${x.status}`;
    }
    case "PERSON_MOVED": {
      const x = p as PayloadOf<"PERSON_MOVED">;
      return `${x.person_id} ${x.from_node} → ${x.to_node} · arrives ${dayLabel(x.arrive)}`;
    }
    case "CHECKIN_RECORDED": {
      const x = p as PayloadOf<"CHECKIN_RECORDED">;
      return `${x.person_or_team_id} check-in at ${coords(x.lat, x.lon)}`;
    }
    case "MISSION_UPDATED": {
      const x = p as PayloadOf<"MISSION_UPDATED">;
      const note = x.fields.note;
      return `${x.mission_id} ${typeof note === "string" ? note : `updated: ${Object.keys(x.fields).join(", ")}`}`;
    }
    case "ASSIGNMENT_SET": {
      const x = p as PayloadOf<"ASSIGNMENT_SET">;
      return `${x.person_id} assigned${x.mission_id ? ` to ${x.mission_id}` : ""}${x.task ? ` · ${x.task}` : ""}`;
    }
    case "LINK_STATE_SET": {
      const x = p as PayloadOf<"LINK_STATE_SET">;
      return `${x.node_id} link ${x.status} (simulated, never synced)`;
    }
    case "INCIDENT_OPENED": {
      const x = p as PayloadOf<"INCIDENT_OPENED">;
      return `${x.incident_id} opened · ${x.team_id ?? x.person_ids.join(", ")} ${incidentTypeLabel(x.type)}`;
    }
    case "INCIDENT_UPDATED": {
      const x = p as PayloadOf<"INCIDENT_UPDATED">;
      return `${x.incident_id} ${x.status}${x.note ? ` · ${x.note}` : ""}`;
    }
    case "DECISION_PROPOSED": {
      const x = p as PayloadOf<"DECISION_PROPOSED">;
      return `${x.decision_id} proposed with ${x.options.length} option${x.options.length === 1 ? "" : "s"}`;
    }
    case "DECISION_APPROVED": {
      const x = p as PayloadOf<"DECISION_APPROVED">;
      return `${x.decision_id} ${x.chosen_option_id} approved${x.verify_ack ? " · verify_ack" : ""}`;
    }
    case "DECISION_REJECTED": {
      const x = p as PayloadOf<"DECISION_REJECTED">;
      return `${x.decision_id} rejected · ${x.reason}`;
    }
    case "CONFLICT_FLAGGED": {
      const x = p as PayloadOf<"CONFLICT_FLAGGED">;
      const values = [...new Set(x.contenders.map((c) => show(c.value)))].join(" vs ");
      return `${x.entity_id} ${x.field}: ${values} · ${show(x.conservative_value)} kept`;
    }
    case "CONFLICT_RESOLVED": {
      const x = p as PayloadOf<"CONFLICT_RESOLVED">;
      return `${x.conflict_id} resolved as ${show(x.chosen_value)}`;
    }
    case "CLOCK_ADVANCED": {
      const x = p as PayloadOf<"CLOCK_ADVANCED">;
      return `Demo clock → ${x.now}`;
    }
  }
}
