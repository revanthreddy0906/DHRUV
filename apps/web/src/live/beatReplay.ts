import { evaluate } from "@dhruv/engine";
import { withCreatedShipments, type OpEvent, type Seed } from "@dhruv/shared";
import type { DirectorBeat } from "@dhruv/seed";

/**
 * A Director script as events, in order, the way the Director and the server write them: a
 * proposal's options and trace come from evaluate() at its time (as the server's engineProposal
 * does), and its trigger is the latest matching event. Used by the signed-out design reference
 * and the tests; nothing is sent anywhere.
 */
export function replayBeats(seed: Seed, beats: DirectorBeat[], opts: { upTo: string; where?: DirectorBeat["where"][] }): OpEvent[] {
  const out: OpEvent[] = [];
  let seq = 0;
  for (const b of beats) {
    if (!opts.where || opts.where.includes(b.where)) {
      for (const e of b.events) {
        let payload = e.payload;
        if (b.proposeFromEngine && e.type === "DECISION_PROPOSED") {
          const trigger = b.resolveTrigger && [...out].reverse().find((x) => x.type === b.resolveTrigger!.type && x.entity_id === b.resolveTrigger!.entity_id);
          const st = evaluate({ seed: withCreatedShipments(seed, out), events: out }, e.observed_at).stations.find((s) => s.nodeId === b.proposeFromEngine!.node_id);
          payload = {
            ...payload,
            trigger_event_id: trigger?.event_id ?? "",
            options: (st?.options ?? []).map((o, i) => ({
              id: `OPT-${i + 1}`, label: o.label, levers: o.leverIds, deadline: o.deadline, requiresVerify: o.requiresVerify ?? [], ratio: o.ratio, state: o.state, gap: o.gap,
              reaches_target: o.reachesTarget, binding_lever: o.bindingLeverId, slack_days: o.slackDays, cost: o.cost, cost_unit: o.costUnit,
            })),
            trace: st?.dimensions.find((d) => d.key === "FUEL")?.trace ?? [],
          };
        }
        seq++;
        out.push({ ...e, payload, event_id: `ev-${seq}`, seq, created_at_client: e.observed_at, priority: 3, schema_version: 1 } as OpEvent);
      }
    }
    if (b.beat === opts.upTo) break;
  }
  return out;
}
