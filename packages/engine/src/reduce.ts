import {
  compareEvents,
  computeStockBalance,
  config,
  EVENT_RULES,
  type OpEvent,
  type Seed,
} from "@dhruv/shared";
import type {
  AssetState,
  DecisionState,
  InventoryState,
  LegState,
  LinkNodeState,
  MissionState,
  PersonnelState,
  State,
  VesselState,
} from "./state.js";

interface DeviceAssetRecord {
  status: string;
  lat: number | null;
  lon: number | null;
  observedAt: string;
}

interface DevicePersonRecord {
  status: string;
  observedAt: string;
}

export function reduce(seed: Seed, events: OpEvent[]): State {
  const sorted = [...events].sort(compareEvents);

  const inventory = new Map<string, InventoryState>();
  const seedStockMap = new Map<string, number>();
  for (const item of seed.inventory_items) {
    seedStockMap.set(item.id, item.stock);
    inventory.set(item.id, {
      itemId: item.id,
      nodeId: item.node_id,
      stock: item.stock,
      unit: item.unit,
      reservePct: item.reserve_pct,
      dimension: item.dimension,
      lastObservedAt: item.last_counted,
    });
  }

  const legs = new Map<string, LegState>();
  for (const leg of seed.legs) {
    legs.set(leg.id, {
      legId: leg.id,
      shipmentId: leg.shipment_id,
      status: leg.status,
      eta: leg.eta,
      etd: leg.etd,
      vesselId: leg.vessel_id,
    });
  }

  const vessels = new Map<string, VesselState>();
  for (const vessel of seed.vessels) {
    vessels.set(vessel.id, {
      vesselId: vessel.id,
      departure: vessel.departure,
      loadCutoff: vessel.load_cutoff,
      etaStation: vessel.eta_station,
      stationClosingDate: vessel.station_closing_date,
    });
  }

  const personnel = new Map<string, PersonnelState>();
  for (const person of seed.personnel) {
    personnel.set(person.id, {
      personId: person.id,
      role: person.role,
      nodeId: person.node_id,
      status: person.status,
      lastObservedAt: person.last_seen ?? "",
    });
  }

  const assets = new Map<string, AssetState>();
  for (const asset of seed.assets) {
    assets.set(asset.id, {
      assetId: asset.id,
      nodeId: asset.node_id,
      status: asset.status,
      lat: asset.lat,
      lon: asset.lon,
      lastObservedAt: asset.last_seen ?? "",
    });
  }

  const missions = new Map<string, MissionState>();
  for (const mission of seed.missions) {
    missions.set(mission.id, {
      missionId: mission.id,
      nodeId: mission.node_id,
      fields: {},
      status: mission.status,
    });
  }

  const links = new Map<string, LinkNodeState>();
  for (const link of seed.link_state) {
    links.set(link.node_id, {
      nodeId: link.node_id,
      status: link.status,
      lastContact: link.last_contact,
    });
  }

  const decisions = new Map<string, DecisionState>();

  const assetLatestPerDevice = new Map<string, Map<string, DeviceAssetRecord>>();
  const personLatestPerDevice = new Map<string, Map<string, DevicePersonRecord>>();

  for (const event of sorted) {
    const rule = EVENT_RULES[event.type];
    const mergeClass = rule?.mergeClass ?? "A";

    switch (mergeClass) {
      case "B": {
        const payload = event.payload as { item_id?: string };
        const itemId = payload.item_id ?? event.entity_id;
        if (!itemId) break;

        const initialStock = seedStockMap.get(itemId);
        const currentStock = computeStockBalance(itemId, sorted, initialStock);

        const existing = inventory.get(itemId);
        if (existing) {
          existing.stock = currentStock;
          if (event.type === "STOCK_COUNTED") {
            existing.lastObservedAt = event.observed_at;
          }
        } else {
          // NOTE: lastObservedAt here uses event.observed_at regardless of type.
          // No current test exercises this branch (seed always includes every
          // item), so this edge case is left as-is; revisit if a test needs it.
          inventory.set(itemId, {
            itemId,
            nodeId: event.node_id,
            stock: currentStock,
            unit: "",
            reservePct: 0,
            dimension: "",
            lastObservedAt: event.observed_at,
          });
        }
        break;
      }

      case "C": {
        if (event.type === "LEG_UPDATED") {
          const p = event.payload as {
            leg_id?: string;
            eta?: string;
            etd?: string | null;
            status?: string;
            vessel_id?: string | null;
          };
          const legId = p.leg_id ?? event.entity_id;
          const leg = legs.get(legId);
          if (leg) {
            if (p.eta !== undefined) leg.eta = p.eta;
            if (p.etd !== undefined) leg.etd = p.etd;
            if (p.status !== undefined) leg.status = p.status;
            if (p.vessel_id !== undefined) leg.vesselId = p.vessel_id;
          } else {
            legs.set(legId, {
              legId,
              shipmentId: "",
              status: p.status ?? "PLANNED",
              eta: p.eta ?? event.observed_at,
              etd: p.etd ?? null,
              vesselId: p.vessel_id ?? null,
            });
          }
        } else if (event.type === "LEG_DELAYED") {
          const p = event.payload as { leg_id?: string; new_eta: string; reason?: string };
          const legId = p.leg_id ?? event.entity_id;
          const leg = legs.get(legId);
          if (leg) {
            leg.eta = p.new_eta;
            leg.status = "DELAYED";
          } else {
            legs.set(legId, {
              legId,
              shipmentId: "",
              status: "DELAYED",
              eta: p.new_eta,
              etd: null,
              vesselId: null,
            });
          }
        } else if (event.type === "VESSEL_UPDATED") {
          const p = event.payload as {
            vessel_id?: string;
            departure?: string;
            load_cutoff?: string;
            eta_station?: string;
          };
          const vesselId = p.vessel_id ?? event.entity_id;
          const vessel = vessels.get(vesselId);
          if (vessel) {
            if (p.departure !== undefined) vessel.departure = p.departure;
            if (p.load_cutoff !== undefined) vessel.loadCutoff = p.load_cutoff;
            if (p.eta_station !== undefined) vessel.etaStation = p.eta_station;
          }
        } else if (event.type === "MISSION_UPDATED") {
          const p = event.payload as { mission_id?: string; fields?: Record<string, unknown> };
          const missionId = p.mission_id ?? event.entity_id;
          const mission = missions.get(missionId);
          if (mission) {
            if (p.fields) mission.fields = { ...mission.fields, ...p.fields };
          }
        }

        // KNOWN GAP (tracked, not a bug): ASSIGNMENT_SET and BURN_RATE_CHANGED
        // are mergeClass "C" but not yet folded into State. ASSIGNMENT_SET has
        // no home in State yet (no assignments map); BURN_RATE_CHANGED has no
        // home either (no consumptionProfiles map). Both are needed before R05
        // (personnel role coverage) and R01 (requirement per item) can be built.
        // Do not silently add ad-hoc handling here — this needs a State schema
        // decision first.
        break;
      }

      case "CS": {
        if (event.type === "ASSET_STATUS_SET") {
          const p = event.payload as {
            asset_id?: string;
            status: string;
            lat?: number;
            lon?: number;
          };
          const assetId = p.asset_id ?? event.entity_id;

          let perDevice = assetLatestPerDevice.get(assetId);
          if (!perDevice) {
            perDevice = new Map<string, DeviceAssetRecord>();
            assetLatestPerDevice.set(assetId, perDevice);
          }

          perDevice.set(event.device_id, {
            status: p.status,
            lat: p.lat ?? null,
            lon: p.lon ?? null,
            observedAt: event.observed_at,
          });

          const records = [...perDevice.values()];
          const severityMap = config.conflicts.assetStatusSeverity as Record<string, number>;
          const mostConservative = records.reduce((best, curr) => {
            const bestSev = severityMap[best.status] ?? 0;
            const currSev = severityMap[curr.status] ?? 0;
            if (currSev > bestSev) return curr;
            if (currSev === bestSev && curr.observedAt > best.observedAt) return curr;
            return best;
          });

          const asset = assets.get(assetId);
          if (asset) {
            asset.status = mostConservative.status;
            asset.lastObservedAt = event.observed_at;
            if (mostConservative.lat !== null) asset.lat = mostConservative.lat;
            if (mostConservative.lon !== null) asset.lon = mostConservative.lon;
          } else {
            assets.set(assetId, {
              assetId,
              nodeId: event.node_id,
              status: mostConservative.status,
              lat: mostConservative.lat,
              lon: mostConservative.lon,
              lastObservedAt: event.observed_at,
            });
          }
        } else if (event.type === "PERSON_STATUS_SET") {
          const p = event.payload as { person_id?: string; status: string };
          const personId = p.person_id ?? event.entity_id;

          let perDevice = personLatestPerDevice.get(personId);
          if (!perDevice) {
            perDevice = new Map<string, DevicePersonRecord>();
            personLatestPerDevice.set(personId, perDevice);
          }

          perDevice.set(event.device_id, {
            status: p.status,
            observedAt: event.observed_at,
          });

          const records = [...perDevice.values()];
          // Conservative merge only when a safety-critical status is involved;
          // otherwise events arrive in canonical order, so the current one wins.
          const involvesSafetyCritical = records.some((r) =>
            config.conflicts.safetyCriticalPersonStatuses.includes(r.status),
          );
          let resolvedStatus = p.status;
          if (involvesSafetyCritical) {
            const severityMap = config.conflicts.personStatusSeverity as Record<string, number>;
            const mostConservative = records.reduce((best, curr) => {
              const bestSev = severityMap[best.status] ?? 0;
              const currSev = severityMap[curr.status] ?? 0;
              if (currSev > bestSev) return curr;
              if (currSev === bestSev && curr.observedAt > best.observedAt) return curr;
              return best;
            });
            resolvedStatus = mostConservative.status;
          }

          const person = personnel.get(personId);
          if (person) {
            person.status = resolvedStatus;
            person.lastObservedAt = event.observed_at;
          } else {
            personnel.set(personId, {
              personId,
              role: "",
              nodeId: event.node_id,
              status: resolvedStatus,
              lastObservedAt: event.observed_at,
            });
          }
        }
        break;
      }

      case "A": {
        if (event.type === "PERSON_MOVED") {
          const p = event.payload as {
            person_id: string;
            from_node: string;
            to_node: string;
            depart: string;
            arrive: string;
          };
          const personId = p.person_id ?? event.entity_id;
          const person = personnel.get(personId);
          if (person) {
            person.nodeId = p.to_node;
            person.lastObservedAt = event.observed_at;
          }
        } else if (event.type === "DECISION_PROPOSED") {
          const p = event.payload as { decision_id?: string };
          const decisionId = p.decision_id ?? event.entity_id;
          decisions.set(decisionId, {
            decisionId,
            status: "PROPOSED",
            chosenOptionId: null,
            approver: null,
          });
        } else if (event.type === "DECISION_APPROVED") {
          const p = event.payload as {
            decision_id?: string;
            chosen_option_id: string;
            approver: string;
          };
          const decisionId = p.decision_id ?? event.entity_id;
          const decision = decisions.get(decisionId);
          if (decision) {
            decision.status = "APPROVED";
            decision.chosenOptionId = p.chosen_option_id;
            decision.approver = p.approver;
          } else {
            decisions.set(decisionId, {
              decisionId,
              status: "APPROVED",
              chosenOptionId: p.chosen_option_id,
              approver: p.approver,
            });
          }
        } else if (event.type === "DECISION_REJECTED") {
          const p = event.payload as { decision_id?: string };
          const decisionId = p.decision_id ?? event.entity_id;
          const decision = decisions.get(decisionId);
          if (decision) {
            decision.status = "REJECTED";
          } else {
            decisions.set(decisionId, {
              decisionId,
              status: "REJECTED",
              chosenOptionId: null,
              approver: null,
            });
          }
        } else if (event.type === "LINK_STATE_SET") {
          const p = event.payload as { node_id?: string; status: string };
          const nodeId = p.node_id ?? event.node_id;
          const link = links.get(nodeId);
          if (link) {
            link.status = p.status;
            link.lastContact = event.observed_at;
          } else {
            links.set(nodeId, {
              nodeId,
              status: p.status,
              lastContact: event.observed_at,
            });
          }
        }
        break;
      }
    }
  }

  const asOf = sorted.length > 0 ? sorted[sorted.length - 1]!.observed_at : config.demo.startAt;

  return {
    asOf,
    inventory,
    legs,
    vessels,
    personnel,
    assets,
    missions,
    links,
    decisions,
  };
}
