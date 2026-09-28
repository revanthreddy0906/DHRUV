import { checkCargoFeasibilityConfidence, classifyFreshness, reduce } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import type { LegView, ShipmentView } from "../data/demo";
import { nodeLabel } from "./chrome";
import { dayLabel } from "./describe";
import { formatAge } from "./format";

/*
 * Moved unchanged from screens/CargoLive.tsx so the stock card can show an item's inbound shipments
 * with the same feasibility (R02, R16, R17) as Cargo.
 */

/** When a leg's ETA was last reported (LEG_UPDATED / LEG_DELAYED). */
export function reportedAt(events: OpEvent[], legId: string): string | undefined {
  return events
    .filter((e) => (e.type === "LEG_DELAYED" || e.type === "LEG_UPDATED") && (e.payload as { leg_id?: string }).leg_id === legId)
    .map((e) => e.observed_at)
    .sort()
    .at(-1);
}

/** Shipments from the seed with this device's leg and vessel state; feasibility and slack are the engine's (R02, R16, R17). */
export function shipmentsOf(seed: Seed, events: OpEvent[], now: string): { shipments: ShipmentView[]; original: Record<string, string> } {
  const state = reduce(seed, events);
  const original: Record<string, string> = {};
  const shipments = seed.shipments.map((sh): ShipmentView => {
    const legs = seed.legs.filter((l) => l.shipment_id === sh.id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = legs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feeder = [...legs].reverse().find((l) => !l.vessel_id && l.status !== "DONE");
    const feederState = feeder ? state.legs.get(feeder.id) : undefined;

    let feasible: ShipmentView["feasible"] = "FEASIBLE";
    let slack = "—";
    let slackState: ShipmentView["slackState"] = "GREEN";
    let note: string | undefined;
    if (feederState && vessel) {
      const fresh = classifyFreshness(feederState.legId, "cargoEta", reportedAt(events, feederState.legId) ?? feederState.eta, now);
      const conf = checkCargoFeasibilityConfidence(feederState.legId, feederState.eta, vessel.loadCutoff, fresh);
      slack = `${conf.slackDays < 0 ? "−" : ""}${Math.abs(conf.slackDays)} d`;
      slackState = conf.slackDays < 0 ? "RED" : conf.slackDays <= 2 ? "AMBER" : "GREEN";
      feasible = !conf.feasible ? "EXCLUDED" : conf.uncertain ? "UNCERTAIN" : "FEASIBLE";
      if (!conf.feasible) note = "Cargo excluded by vessel cutoff.";
      else if (conf.uncertain) note = `ETA report ${formatAge(reportedAt(events, feederState.legId) ?? feederState.eta, now)} old · verify`;
      if (feederState.eta !== feeder!.eta) original[sh.id] = dayLabel(feeder!.eta);
    }

    const legViews: LegView[] = legs.map((l) => {
      const s = state.legs.get(l.id);
      const at = reportedAt(events, l.id);
      return {
        id: `L${l.seq}`,
        from: nodeLabel(l.from_node),
        to: nodeLabel(l.to_node),
        etd: l.vessel_id && vessel ? dayLabel(vessel.departure) : (s?.etd ?? l.etd) ? dayLabel((s?.etd ?? l.etd)!) : undefined,
        eta: dayLabel(l.vessel_id && vessel ? vessel.etaStation : (s?.eta ?? l.eta)),
        status: (s?.status ?? l.status) as LegView["status"],
        vessel: !!l.vessel_id,
        freshness: at ? { cls: classifyFreshness(l.id, "cargoEta", at, now).freshness, age: formatAge(at, now) } : undefined,
      };
    });

    return { id: sh.id, contents: sh.name, priority: sh.priority, legs: legViews, cutoff: vessel ? dayLabel(vessel.loadCutoff) : "—", slack, slackState, feasible, note };
  });
  return { shipments, original };
}
