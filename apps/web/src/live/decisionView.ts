import { withCreatedShipments, type OpEvent, type PayloadOf, type Seed } from "@dhruv/shared";
import { LEVER_ACTIONS } from "@dhruv/seed";
import { evaluate, type Evaluation, type RankedOption, type StationEval } from "@dhruv/engine";
import type { DecisionOptionView, DecisionView } from "@dhruv/store";
import {
  actorLabel, appliedLeversSentence, compareRows, consequenceChain, deadlineHeadline, decisionPhase, expiredText, followUpSentence, formatDate, formatDateTime,
  leverEffect, optionName, rankingReason, triggerPhrase, verifySentence,
  type CompareRow, type DecisionPhase, type EngineStep, type OptionFacts, type RankCategory,
} from "../format";
import { approveReason } from "./ops";

/**
 * Everything the Decision detail screen shows, from one decision, this device's events and the
 * engine (docs/ui-redesign/CLAUDE.md section 9.3). One value rule:
 * - awaiting a decision, every option value is the live engine's for the decision's station,
 *   matched to the recorded option by its levers;
 * - once decided (or expired), option values are the recorded proposal's, nothing live mixed in.
 * The builder only selects and phrases; readiness is evaluate()'s.
 */

type Light = "GREEN" | "AMBER" | "RED";

export interface DecisionOptionColumn {
  /** "(a)" */
  label: string;
  /** The recorded option id the approval names (OPT-1). */
  optionId: string;
  levers: string[];
  name: string;
  facts: OptionFacts;
  /** Engine ranking 1 and its one-line reason. */
  top?: string;
  /** Why this option cannot be approved now (deadline passed, not offered, role). */
  blocked?: string;
  /** Verify-first lines for this option (live while awaiting). */
  verify: string[];
  /** "I have verified … with the station", when the option needs it. */
  verifySentence?: string;
}

export interface LeverRow { id: string; name: string; effect: string; deadline: string; cutoff: string; leadDays: number; daysLeft: number }

export interface DecisionScreenData {
  id: string;
  nodeId: string;
  station: string;
  title: string;
  phase: DecisionPhase;
  proposedAt: string;
  /** The decision was decided on this device and the event has not been sent yet. */
  waiting: boolean;
  /** A decision recorded on this device that the server refused; the decision is still open. */
  refused?: string;
  deadline?: { lead?: string; text: string };
  /** ISO point of no return used on the timeline (live while awaiting). */
  pnr?: string;
  stationNow: { state: Light; fuelRatio: number | null; fuelState?: Light };
  chain: string[];
  trigger?: { text: string; actor: string; at: string };
  options: DecisionOptionColumn[];
  rows: CompareRow[];
  valuesNote: string;
  levers: LeverRow[];
  /** Engine steps for "Why the engine says this" (live while awaiting, recorded once decided). */
  why: EngineStep[];
  units: Record<string, string>;
  outcome?: { title: string; actor?: string; at?: string; verified?: boolean; reason?: string };
  /** What the approval recorded (follow-up events) or, for engine-only levers, what it applied. */
  didLines: string[];
  atApproval?: { label: string; state?: Light; ratio: number | null };
  /** Station state now, for "What it did". */
  nowLine?: { state: Light; ratio: number | null };
  rejectBlocked?: string;
}

export interface DecisionScreenInput {
  decision: DecisionView;
  /** Events that count (the server's refusals left out). */
  events: OpEvent[];
  /** Every event on this device, refused ones included, to find a refused local decision. */
  allEvents: OpEvent[];
  pendingIds: Set<string>;
  rejected: Map<string, string>;
  /** The scenario seed before created shipments are merged in. */
  seed: Seed;
  evaluation: Evaluation;
  now: string;
  identity: { role: string; node_id: string; device_id: string };
  stationName: (nodeId: string) => string;
}

const sameLevers = (a: string[], b: string[]) => a.length === b.length && a.every((l) => b.includes(l));
const isDecisionEvent = (t: string) => t === "DECISION_PROPOSED" || t === "DECISION_APPROVED" || t === "DECISION_REJECTED";

function fuelOf(st: StationEval | undefined) {
  return st?.dimensions.find((d) => d.key === "FUEL");
}

/** Item names for verify lines ("INV-DSL" → "Diesel"). */
function itemNames(seed: Seed): Record<string, string> {
  return Object.fromEntries(seed.inventory_items.map((i) => [i.id, i.name]));
}

function vesselNames(seed: Seed): Record<string, string> {
  return Object.fromEntries(seed.vessels.map((v) => [v.id, v.name]));
}

function leverEffects(st: StationEval | undefined): Record<string, string> {
  return Object.fromEntries((st?.levers ?? []).map((l) => [l.id, leverEffect(l.effect)]));
}

const labelOf = (r: DecisionOptionView, i: number) => r.label ?? `(${String.fromCharCode(97 + i)})`;

function liveFacts(o: RankedOption, effects: Record<string, string>): OptionFacts {
  return {
    label: o.label,
    levers: o.leverIds,
    reachesTarget: o.reachesTarget,
    ratio: o.ratio,
    state: o.state,
    available: o.availability,
    required: o.requirement,
    unit: "kL",
    gap: o.gap,
    deadline: o.deadline,
    bindingLever: o.bindingLeverId,
    slackDays: o.slackDays,
    slackLeg: o.slackDays !== null ? o.cargoConfidence?.legId : undefined,
    cost: o.cost,
    costUnit: o.costUnit,
    straddleText: o.confidenceBand?.straddles ? o.confidenceBand.text : undefined,
    verify: o.requiresVerify ?? [],
    effects,
  };
}

function recordedFacts(r: DecisionOptionView, i: number, effects: Record<string, string>): OptionFacts {
  return {
    label: labelOf(r, i),
    levers: r.levers,
    reachesTarget: r.reachesTarget ?? r.state === "GREEN",
    ratio: r.ratio ?? NaN,
    state: r.state ?? "RED",
    unit: "kL",
    gap: r.gap,
    deadline: r.deadline,
    bindingLever: r.bindingLever,
    slackDays: r.slackDays ?? null,
    cost: r.cost,
    costUnit: r.costUnit,
    verify: r.requiresVerify,
    effects,
  };
}

/** The engine's trace steps recorded in the proposal (unknown[] in the payload). */
function recordedTrace(events: OpEvent[], id: string): EngineStep[] {
  const e = events.find((x) => x.type === "DECISION_PROPOSED" && (x.payload as { decision_id: string }).decision_id === id);
  const raw = (e?.payload as PayloadOf<"DECISION_PROPOSED"> | undefined)?.trace ?? [];
  return raw.filter((s): s is EngineStep => !!s && typeof (s as EngineStep).rule === "string" && typeof (s as EngineStep).text === "string");
}

/** Follow-up events a decision produced (the server stamps them with its decision_id). */
export function followUpsOf(events: OpEvent[], id: string): OpEvent[] {
  return events.filter((e) => !isDecisionEvent(e.type) && (e.payload as { decision_id?: unknown }).decision_id === id);
}

/** What approving these levers will record, from the same table the server uses (LEVER_ACTIONS). */
export function approvalPreview(levers: string[], seed: Seed, effects: Record<string, string> = {}): string[] {
  const vessels = vesselNames(seed);
  const lines = levers.flatMap((l) => (LEVER_ACTIONS[l]?.followUps ?? []).map((f) => followUpSentence(f, vessels)));
  const engineOnly = levers.filter((l) => (LEVER_ACTIONS[l]?.followUps.length ?? 0) === 0);
  const applied = appliedLeversSentence(engineOnly, effects);
  return applied ? [...lines, applied] : lines;
}

/**
 * The station as it stood when the decision was approved, recomputed from the log: the engine on
 * the events observed before the approval (the approval and its follow-ups left out), evaluated
 * at the approval time. Undefined when that replay is not possible.
 */
export function stationAtApproval(seed: Seed, events: OpEvent[], decision: DecisionView): { state: Light; ratio: number | null; fuelState: Light } | undefined {
  if (decision.status !== "APPROVED" || !decision.decided_at || !decision.decided_event_id) return undefined;
  const decidedAt = decision.decided_at;
  const followUps = new Set(followUpsOf(events, decision.id).map((e) => e.event_id));
  const before = events.filter((e) => e.observed_at < decidedAt && e.event_id !== decision.decided_event_id && !followUps.has(e.event_id));
  const st = evaluate({ seed: withCreatedShipments(seed, before), events: before }, decidedAt).stations.find((s) => s.nodeId === decision.node_id);
  const fuel = fuelOf(st);
  if (!st || !fuel) return undefined;
  return { state: st.state, ratio: fuel.ratio, fuelState: fuel.state };
}

export function buildDecisionScreen(input: DecisionScreenInput): DecisionScreenData {
  const { decision, events, allEvents, pendingIds, rejected, seed, evaluation, now, identity } = input;
  const station = input.stationName(decision.node_id);
  const liveStation = evaluation.stations.find((s) => s.nodeId === decision.node_id);
  const liveFuel = fuelOf(liveStation);
  const effects = leverEffects(liveStation);
  const names = itemNames(seed);
  const phase = decisionPhase({ status: decision.status, pnr: decision.pnr, optionDeadlines: decision.options.map((o) => o.deadline) }, now);
  const awaiting = phase === "AWAITING";
  const recordedSteps = recordedTrace(events, decision.id);

  // A title that stays the same for the life of the decision: the fuel state at proposal.
  const proposedState = recordedSteps.find((s) => s.rule === "R03")?.text.match(/(GREEN|AMBER|RED)\s*$/)?.[1];
  const title = proposedState === "RED" ? `${station} fuel below requirement` : proposedState === "AMBER" ? `${station} fuel close to requirement` : `${station} fuel decision`;

  const refusedEvent = allEvents.find((e) => rejected.has(e.event_id) && (e.type === "DECISION_APPROVED" || e.type === "DECISION_REJECTED") && (e.payload as { decision_id: string }).decision_id === decision.id);
  const refused = refusedEvent && decision.status === "PROPOSED" ? `Refused by HQ: ${rejected.get(refusedEvent.event_id)}. Still awaiting a decision.` : undefined;

  const rejectBlocked = identity.role !== "HQ_OPS" ? "Only HQ Ops can reject decisions" : undefined;

  // Options: identity from the proposal, values from one source.
  let options: DecisionOptionColumn[];
  if (awaiting) {
    const live = liveStation?.options ?? [];
    options = decision.options.map((r, i): DecisionOptionColumn => {
      const o = live.find((x) => sameLevers(x.leverIds, r.levers));
      const facts = o ? liveFacts(o, effects) : { ...recordedFacts(r, i, effects), ratio: NaN, verify: [] };
      const deadlinePassed = r.deadline && Date.parse(now) > Date.parse(r.deadline) ? `Deadline ${formatDate(r.deadline)} has passed` : undefined;
      const blocked = deadlinePassed ?? (o ? undefined : `The engine does not offer this option at ${formatDateTime(now)}`) ?? approveReason(decision, identity.role, identity.node_id, r.levers);
      return {
        label: o?.label ?? labelOf(r, i),
        optionId: r.id,
        levers: r.levers,
        name: optionName(r.levers),
        facts,
        top: o?.label === "(a)" ? rankingReason(o.category as RankCategory, o.reachesTarget) : undefined,
        blocked,
        verify: facts.verify,
        verifySentence: verifySentence(facts.verify, names),
      };
    });
    const offered = options.filter((c) => !Number.isNaN(c.facts.ratio));
    options = [...offered.sort((a, b) => a.label.localeCompare(b.label)), ...options.filter((c) => Number.isNaN(c.facts.ratio))];
  } else {
    options = decision.options.map((r, i): DecisionOptionColumn => {
      const facts = recordedFacts(r, i, effects);
      return {
        label: facts.label,
        optionId: r.id,
        levers: r.levers,
        name: optionName(r.levers),
        facts,
        top: i === 0 ? rankingReason(undefined, facts.reachesTarget) : undefined,
        verify: r.requiresVerify,
      };
    });
  }
  const rows = compareRows(options.map((o) => o.facts), now, names);

  // Header deadline: the engine's PNR now, else the top-ranked option's own deadline.
  const livePnr = liveStation?.pnr?.pnrDate ? { date: liveStation.pnr.pnrDate, daysLeft: liveStation.pnr.daysRemaining ?? undefined } : null;
  const topLive = options.find((o) => o.top && !Number.isNaN(o.facts.ratio));
  const deadline = awaiting ? deadlineHeadline({ now, pnr: livePnr, top: topLive?.facts.deadline ? { label: topLive.label, deadline: topLive.facts.deadline } : undefined }) : undefined;

  const trigger = events.find((e) => e.event_id === decision.trigger_event_id);
  const fuelItem = liveFuel?.items?.[0];
  const chain = awaiting && liveStation && liveFuel
    ? consequenceChain({
        trigger: triggerPhrase(trigger, vesselNames(seed)),
        trace: liveFuel.trace,
        fuel: fuelItem ? { have: fuelItem.have, need: fuelItem.need, unit: fuelItem.unit, ratio: liveFuel.ratio, state: liveFuel.state } : undefined,
        station: { name: station, state: liveStation.state },
        missions: (liveStation.missions ?? []).map((m) => ({ id: m.missionId, status: m.status })),
      })
    : [];

  const usedLevers = new Set(decision.options.flatMap((o) => o.levers));
  const levers: LeverRow[] = (liveStation?.levers ?? []).filter((l) => usedLevers.has(l.id)).map((l) => ({
    id: l.id,
    name: optionName([l.id]),
    effect: effects[l.id] ?? "",
    deadline: l.deadline,
    cutoff: l.cutoff,
    leadDays: l.leadDays,
    daysLeft: l.daysRemaining,
  }));

  // Outcome, for a decided or expired decision.
  const decided = events.find((e) => e.event_id === decision.decided_event_id);
  const waiting = !!decision.decided_event_id && pendingIds.has(decision.decided_event_id);
  let outcome: DecisionScreenData["outcome"];
  let didLines: string[] = [];
  let atApproval: DecisionScreenData["atApproval"];
  if (decision.status === "APPROVED") {
    const chosen = options.find((o) => o.optionId === decision.chosen_option_id);
    const p = decided?.payload as PayloadOf<"DECISION_APPROVED"> | undefined;
    outcome = {
      title: chosen ? `Approved option ${chosen.label}: ${chosen.name}` : `Approved option ${decision.chosen_option_id ?? "unknown"}`,
      actor: decided ? actorLabel(decided.actor_role, p?.approver) : undefined,
      at: decision.decided_at,
      verified: p?.verify_ack,
    };
    const recordedFollowUps = followUpsOf(events, decision.id).map((e) => followUpSentence(e, vesselNames(seed)));
    const chosenLevers = chosen?.levers ?? [];
    const engineOnly = appliedLeversSentence(chosenLevers.filter((l) => (LEVER_ACTIONS[l]?.followUps.length ?? 0) === 0), effects);
    didLines = waiting ? approvalPreview(chosenLevers, seed, effects) : [...recordedFollowUps, ...(engineOnly ? [engineOnly] : [])];
    const replay = waiting ? undefined : stationAtApproval(seed, events, decision);
    atApproval = replay
      ? { label: "Station at approval (recomputed from the log)", state: replay.state, ratio: replay.ratio }
      : chosen ? { label: "Expected at proposal", state: chosen.facts.state, ratio: Number.isNaN(chosen.facts.ratio) ? null : chosen.facts.ratio } : undefined;
  } else if (decision.status === "REJECTED") {
    const p = decided?.payload as PayloadOf<"DECISION_REJECTED"> | undefined;
    outcome = { title: "Rejected", actor: decided ? actorLabel(decided.actor_role, decided.device_id) : undefined, at: decision.decided_at, reason: p?.reason };
  } else if (phase === "EXPIRED") {
    outcome = { title: expiredText(decision.pnr, decision.options.map((o) => o.deadline)) };
  }

  return {
    id: decision.id,
    nodeId: decision.node_id,
    station,
    title,
    phase,
    proposedAt: decision.proposed_at,
    waiting,
    refused,
    deadline,
    pnr: awaiting ? livePnr?.date : undefined,
    stationNow: { state: liveStation?.state ?? "RED", fuelRatio: liveFuel?.ratio ?? null, fuelState: liveFuel?.state },
    chain,
    trigger: trigger ? { text: triggerPhrase(trigger, vesselNames(seed)) ?? trigger.type, actor: actorLabel(trigger.actor_role, trigger.device_id), at: trigger.observed_at } : undefined,
    options,
    rows,
    valuesNote: awaiting ? `Values as of now · proposed ${formatDateTime(decision.proposed_at)}` : `Options at the time of proposal (${formatDate(decision.proposed_at)})`,
    levers,
    why: awaiting ? (liveFuel?.trace ?? []) : recordedSteps,
    units: Object.fromEntries((liveFuel?.items ?? []).map((i) => [i.id, i.unit])),
    outcome,
    didLines,
    atApproval,
    nowLine: decision.status === "APPROVED" && liveStation ? { state: liveStation.state, ratio: liveFuel?.ratio ?? null } : undefined,
    rejectBlocked,
  };
}
