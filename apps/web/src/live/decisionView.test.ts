import { describe, expect, it } from "vitest";
import { AURORA_BEATS, DEVICES, DIRECTOR_BEATS, IDS, LEVER_ACTIONS, NODES, aurora2016Seed, season48, type DirectorBeat } from "@dhruv/seed";
import { evaluate } from "@dhruv/engine";
import { withCreatedShipments, type OpEvent, type Seed } from "@dhruv/shared";
import { decisionsView } from "@dhruv/store";
import { approvalPreview, buildDecisionScreen, followUpsOf, stationAtApproval } from "./decisionView";
import { mergeVerify } from "./adapter";

/**
 * Events as the Director and the server write them: beat events in order, a proposal's options
 * and trace from evaluate() at its time (as engineProposal does), its trigger resolved to the
 * latest matching event.
 */
function replay(seed: Seed, beats: DirectorBeat[], upTo: string): OpEvent[] {
  const out: OpEvent[] = [];
  let seq = 0;
  for (const b of beats) {
    for (const e of b.events) {
      let payload = e.payload;
      if (b.proposeFromEngine && e.type === "DECISION_PROPOSED") {
        const trigger = b.resolveTrigger && [...out].reverse().find((x) => x.type === b.resolveTrigger!.type && x.entity_id === b.resolveTrigger!.entity_id);
        const st = evaluate({ seed: withCreatedShipments(seed, out), events: out }, e.observed_at).stations.find((s) => s.nodeId === b.proposeFromEngine!.node_id)!;
        payload = {
          ...payload,
          trigger_event_id: trigger?.event_id ?? "",
          options: (st.options ?? []).map((o, i) => ({
            id: `OPT-${i + 1}`, label: o.label, levers: o.leverIds, deadline: o.deadline, requiresVerify: o.requiresVerify ?? [], ratio: o.ratio, state: o.state, gap: o.gap,
            reaches_target: o.reachesTarget, binding_lever: o.bindingLeverId, slack_days: o.slackDays, cost: o.cost, cost_unit: o.costUnit,
          })),
          trace: st.dimensions.find((d) => d.key === "FUEL")?.trace ?? [],
        };
      }
      seq++;
      out.push({ ...e, payload, event_id: `ev-${seq}`, seq, created_at_client: e.observed_at, priority: 3, schema_version: 1 } as OpEvent);
    }
    if (b.beat === upTo) break;
  }
  return out;
}

/** An approval as the server writes it (device SERVER), with the levers' follow-ups. */
function approve(events: OpEvent[], opts: { id: string; option: string; approver: string; at: string; levers: string[]; role?: string; device?: string }): OpEvent[] {
  const approval: OpEvent = {
    event_id: "ev-approve", device_id: opts.device ?? DEVICES.SERVER, seq: 900, type: "DECISION_APPROVED", entity_type: "decision", entity_id: opts.id, node_id: NODES.MAITRI,
    payload: { decision_id: opts.id, chosen_option_id: opts.option, approver: opts.approver, verify_ack: true },
    observed_at: opts.at, created_at_client: opts.at, priority: 3, actor_role: (opts.role ?? "HQ_OPS") as OpEvent["actor_role"], schema_version: 1,
  };
  const followUps = opts.levers.flatMap((l) => LEVER_ACTIONS[l]?.followUps ?? []).map((f, i): OpEvent => ({
    ...f, event_id: `ev-follow-${i}`, device_id: DEVICES.SERVER, seq: 901 + i, payload: { ...f.payload, decision_id: opts.id },
    observed_at: opts.at, created_at_client: opts.at, priority: 3, actor_role: "SYSTEM", schema_version: 1,
  } as OpEvent));
  return [...events, approval, ...followUps];
}

const HQ = { role: "HQ_OPS", node_id: "HQ", device_id: "HQ-WEB-01" };
const LEADER = { role: "STATION_LEADER", node_id: "MAITRI", device_id: "MAITRI-TAB-01" };
const stationName = (id: string) => ({ MAITRI: "Maitri", BHARATI: "Bharati" })[id] ?? id;

function screen(seed: Seed, events: OpEvent[], now: string, opts: { identity?: typeof HQ; pending?: string[]; rejected?: [string, string][]; allEvents?: OpEvent[]; id?: string } = {}) {
  const rejected = new Map(opts.rejected ?? []);
  const counted = events.filter((e) => !rejected.has(e.event_id));
  const decision = decisionsView(counted).find((d) => d.id === (opts.id ?? IDS.decision1))!;
  return buildDecisionScreen({
    decision, events: counted, allEvents: opts.allEvents ?? events, pendingIds: new Set(opts.pending ?? []), rejected, seed,
    evaluation: evaluate({ seed: withCreatedShipments(seed, counted), events: counted }, now), now, identity: opts.identity ?? HQ, stationName,
  });
}

describe("season48 DEC-01 awaiting a decision (after beat 2)", () => {
  const events = replay(season48, DIRECTOR_BEATS, "2");
  const now = "2027-01-24T08:11:00.000Z";
  const s = screen(season48, events, now);

  it("leads with the question and the engine's point of no return", () => {
    expect(s.phase).toBe("AWAITING");
    expect(s.title).toBe("Maitri fuel below requirement");
    expect(s.deadline).toEqual({ text: "Decide by 3 Feb · 10 days" });
    expect(s.pnr).toBe("2027-02-03T00:00:00.000Z");
  });

  it("builds the consequence chain from the trigger and the engine's trace", () => {
    expect(s.chain).toEqual(["L2-C104 delayed to 7 Feb", "Misses vessel cutoff 4 Feb", "Cargo excluded by vessel cutoff", "Fuel 92.0 of 132.0 kL = 0.697, RED", "Maitri RED", "F-27 at risk"]);
  });

  it("never names the Director script as the actor", () => {
    expect(s.trigger?.actor).toBe("HQ Ops");
    expect(JSON.stringify(s)).not.toMatch(/DIRECTOR/);
  });

  it("takes every option value from the live engine, matched by levers", () => {
    expect(s.options.map((o) => [o.label, o.optionId, o.name])).toEqual([
      ["(a)", "OPT-1", "Hold vessel"],
      ["(b)", "OPT-2", "Conserve diesel, defer F-27 and hold vessel"],
      ["(c)", "OPT-3", "Partial airlift, conserve diesel and defer F-27"],
    ]);
    expect(s.options[0]!.facts.available).toBe(140);
    expect(s.options[0]!.top).toMatch(/^Cheapest option that restores GREEN/);
    expect(s.options[1]!.top).toBeUndefined();
    expect(s.rows.find((r) => r.key === "fuel")!.cells.map((c) => c.text)).toEqual(["+8.0 kL margin", "+21.2 kL margin", "−14.8 kL short"]);
    expect(s.valuesNote).toBe("Values as of now · proposed 24 Jan 08:11");
    expect(s.options.every((o) => !o.blocked)).toBe(true);
  });

  it("lists the levers the options use, with their windows", () => {
    expect(s.levers.map((l) => l.id).sort()).toEqual(["AIRLIFT_PARTIAL", "CONSERVE", "DEFER_F27", "HOLD_VESSEL"]);
    expect(s.levers.find((l) => l.id === "HOLD_VESSEL")).toMatchObject({ deadline: "2027-02-03T00:00:00.000Z", cutoff: "2027-02-06T00:00:00.000Z", leadDays: 3, daysLeft: 10 });
  });

  it("explains with the live fuel trace", () => {
    expect(s.why.some((t) => t.rule === "R03" && t.text.includes("0.6970"))).toBe(true);
  });

  it("blocks a Station Leader from vessel options and from rejecting, with the reason", () => {
    const l = screen(season48, events, now, { identity: LEADER });
    expect(l.options[0]!.blocked).toBe("Only HQ Ops can approve decisions touching vessels");
    expect(l.options[2]!.blocked).toBe("Only HQ Ops can approve decisions touching vessels");
    expect(l.rejectBlocked).toBe("Only HQ Ops can reject decisions");
  });

  it("previews what an approval records, from the server's own lever table", () => {
    expect(approvalPreview(["HOLD_VESSEL"], season48)).toEqual(["MV Ice Star departure moves to 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)", "Leg L3-C104 ETA moves to 27 Feb"]);
    expect(approvalPreview(["CONSERVE", "DEFER_F27"], season48, { CONSERVE: "saves 8.0 kL" })).toEqual(["Mission F-27 marked deferred", "Conserve diesel (saves 8.0 kL) applied to the fuel calculation."]);
  });

  it("is expired once the point of no return has passed", () => {
    const x = screen(season48, events, "2027-02-04T00:00:00.000Z");
    expect(x.phase).toBe("EXPIRED");
    expect(x.outcome?.title).toBe("Expired: no option was approved before the point of no return, 3 Feb.");
    expect(x.valuesNote).toBe("Options at the time of proposal (24 Jan)");
  });
});

describe("season48 DEC-01 approved (beat 11)", () => {
  const at = "2027-01-25T16:20:00.000Z";
  const events = approve(replay(season48, DIRECTOR_BEATS, "9"), { id: IDS.decision1, option: "OPT-1", approver: DEVICES.DIRECTOR, at, levers: ["HOLD_VESSEL"] });
  const s = screen(season48, events, at);

  it("puts the outcome first, with the role only for a script approval", () => {
    expect(s.phase).toBe("APPROVED");
    expect(s.outcome).toMatchObject({ title: "Approved option (a): Hold vessel", actor: "HQ Ops", at, verified: true });
  });

  it("shows a real approving device beside the role", () => {
    const real = screen(season48, approve(replay(season48, DIRECTOR_BEATS, "9"), { id: IDS.decision1, option: "OPT-1", approver: "HQ-WEB-01", at, levers: ["HOLD_VESSEL"] }), at);
    expect(real.outcome?.actor).toBe("HQ Ops on HQ-WEB-01");
  });

  it("lists the follow-up events it produced", () => {
    expect(followUpsOf(events, IDS.decision1)).toHaveLength(2);
    expect(s.didLines).toEqual(["MV Ice Star departure moves to 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)", "Leg L3-C104 ETA moves to 27 Feb"]);
  });

  it("recomputes the station at approval from the log and shows it next to now", () => {
    expect(s.atApproval?.label).toBe("Station at approval (recomputed from the log)");
    expect(s.atApproval?.state).toBe("RED");
    expect(s.atApproval?.ratio).toBeCloseTo(0.697, 3);
    expect(s.nowLine?.state).toBe("GREEN");
    expect(s.nowLine?.ratio).toBeCloseTo(1.0606, 3);
  });

  it("replays only events observed before the approval", () => {
    const decision = decisionsView(events).find((d) => d.id === IDS.decision1)!;
    const replayed = stationAtApproval(season48, events, decision);
    expect(replayed?.fuelState).toBe("RED");
  });

  it("uses the recorded proposal for the options, nothing live", () => {
    expect(s.valuesNote).toBe("Options at the time of proposal (24 Jan)");
    expect(s.rows.find((r) => r.key === "fuel")!.cells.map((c) => c.text)).toEqual(["1.061", "1.178", "−14.8 kL short"]);
    expect(s.options.every((o) => o.facts.available === undefined && o.facts.straddleText === undefined)).toBe(true);
    expect(s.options[0]!.top).toBeDefined();
    expect(s.deadline).toBeUndefined();
    expect(s.chain).toEqual([]);
  });

  it("falls back to the proposal's expected value when a replay is not possible", () => {
    const counted = events;
    const decision = { ...decisionsView(counted).find((d) => d.id === IDS.decision1)!, decided_event_id: undefined };
    const x = buildDecisionScreen({ decision, events: counted, allEvents: counted, pendingIds: new Set(), rejected: new Map(), seed: season48, evaluation: evaluate({ seed: season48, events: counted }, at), now: at, identity: HQ, stationName });
    expect(x.atApproval?.label).toBe("Expected at proposal");
    expect(x.atApproval?.ratio).toBeCloseTo(1.0606, 3);
  });
});

describe("season48 DEC-01 decided on this device", () => {
  const base = replay(season48, DIRECTOR_BEATS, "9");
  const at = "2027-01-25T16:00:00.000Z";

  it("says an offline approval is waiting to send, and previews its follow-ups", () => {
    const events = [...base, { ...approve([], { id: IDS.decision1, option: "OPT-1", approver: "HQ-WEB-01", at, levers: [], device: "HQ-WEB-01" })[0]! }];
    const s = screen(season48, events, at, { pending: ["ev-approve"] });
    expect(s.waiting).toBe(true);
    expect(s.outcome?.actor).toBe("HQ Ops on HQ-WEB-01");
    expect(s.didLines[0]).toBe("MV Ice Star departure moves to 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)");
    expect(s.atApproval?.label).toBe("Expected at proposal");
  });

  it("shows a refused local decision and keeps the decision open", () => {
    const local = approve([], { id: IDS.decision1, option: "OPT-1", approver: "MAITRI-TAB-01", at, levers: [], device: "MAITRI-TAB-01", role: "STATION_LEADER" })[0]!;
    const s = screen(season48, [...base, local], at, { rejected: [["ev-approve", "only HQ Ops can approve options touching shipments or vessels"]], identity: LEADER });
    expect(s.phase).toBe("AWAITING");
    expect(s.refused).toBe("Refused by HQ: only HQ Ops can approve options touching shipments or vessels. Still awaiting a decision.");
  });

  it("shows a rejection plainly with its reason and the role for a server-written event", () => {
    const rejection: OpEvent = {
      event_id: "ev-reject", device_id: DEVICES.SERVER, seq: 950, type: "DECISION_REJECTED", entity_type: "decision", entity_id: IDS.decision1, node_id: NODES.MAITRI,
      payload: { decision_id: IDS.decision1, reason: "Airlift slot confirmed separately" }, observed_at: at, created_at_client: at, priority: 3, actor_role: "HQ_OPS", schema_version: 1,
    };
    const s = screen(season48, [...base, rejection], at);
    expect(s.phase).toBe("REJECTED");
    expect(s.outcome).toMatchObject({ title: "Rejected", actor: "HQ Ops", reason: "Airlift slot confirmed separately" });
    const offline = screen(season48, [...base, { ...rejection, device_id: "HQ-WEB-01" }], at);
    expect(offline.outcome?.actor).toBe("HQ Ops on HQ-WEB-01");
  });
});

describe("aurora2016 DEC-AGROUND", () => {
  it("with no PNR, leads with the top-ranked option's deadline", () => {
    const events = replay(aurora2016Seed, AURORA_BEATS, "A7");
    const s = screen(aurora2016Seed, events, "2027-02-26T15:00:00.000Z", { id: "DEC-AGROUND" });
    expect(s.phase).toBe("AWAITING");
    expect(s.deadline?.lead).toBe("No option restores GREEN on its own");
    expect(s.deadline?.text).toMatch(/^Act by 2 Mar \(option \(a\)\) · \d+ days?$/);
    expect(s.options[0]!.top).toMatch(/no option restores GREEN on its own/);
    expect(s.rows.find((r) => r.key === "restores")!.cells.every((c) => c.text === "Does not restore GREEN")).toBe(true);
  });

  it("once approved, says what the engine-only levers applied", () => {
    const at = "2027-02-27T09:00:00.000Z";
    const events = approve(replay(aurora2016Seed, AURORA_BEATS, "A7"), { id: "DEC-AGROUND", option: "OPT-1", approver: DEVICES.DIRECTOR, at, levers: ["AIRLIFT_PARTIAL", "CONSERVE"] });
    const s = screen(aurora2016Seed, events, "2027-03-12T08:00:00.000Z", { id: "DEC-AGROUND" });
    expect(s.outcome?.title).toBe("Approved option (a): Partial airlift and conserve diesel");
    expect(s.outcome?.actor).toBe("HQ Ops");
    expect(s.didLines).toEqual(["Partial airlift (+12.0 kL) and conserve diesel (saves 8.0 kL) applied to the fuel calculation."]);
    expect(s.atApproval?.label).toBe("Station at approval (recomputed from the log)");
  });
});

describe("mergeVerify", () => {
  it("drops a recorded line about an input the live engine already names", () => {
    expect(mergeVerify(["Fuel count 0h old (band straddles RED)"], ["Fuel count 112h old (band straddles RED)", "INV-DSL count is STALE (112h old)", "Inbound shipment L2-C104 is UNCERTAIN (591h old, 2d slack)"]))
      .toEqual(["Fuel count 0h old (band straddles RED)", "Inbound shipment L2-C104 is UNCERTAIN (591h old, 2d slack)"]);
  });
});
