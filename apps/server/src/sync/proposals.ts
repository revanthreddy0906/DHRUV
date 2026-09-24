import type Database from "better-sqlite3";
import { evaluate } from "@dhruv/engine";
import { listAllEvents } from "../db/events.js";
import { loadSeed } from "../db/seedData.js";

/**
 * One option of a DECISION_PROPOSED as recorded. `id`, `levers`, `deadline` and `requiresVerify`
 * are what approval checks read (sync/authorize.ts); the rest is the engine's evaluation at the
 * time of the proposal, so every device shows the same options, offline included.
 */
export interface ProposedOption {
  id: string;
  label: string;
  levers: string[];
  deadline: string;
  requiresVerify: string[];
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  gap: number;
  reaches_target: boolean;
  binding_lever: string;
  slack_days: number | null;
  cost: number;
  cost_unit: string;
}

export interface EngineProposal {
  options: ProposedOption[];
  trace: { rule: string; text: string }[];
  pnr: string | null;
}

/**
 * R08-R11 for a station at `now`, on everything the server holds: the ranked options (at most 3)
 * with stable ids OPT-1..3 in rank order, and the trace. Null when the station needs no decision
 * (its fuel is GREEN, so the engine proposes nothing).
 */
export function engineProposal(db: Database.Database, nodeId: string, now: string): EngineProposal | null {
  const evaluation = evaluate({ seed: loadSeed(db), events: listAllEvents(db) }, now);
  const station = evaluation.stations.find((s) => s.nodeId === nodeId);
  const ranked = station?.options ?? [];
  if (ranked.length === 0) return null;

  return {
    options: ranked.map((o, i) => ({
      id: `OPT-${i + 1}`,
      label: o.label,
      levers: o.leverIds,
      deadline: o.deadline,
      requiresVerify: o.requiresVerify ?? [],
      ratio: o.ratio,
      state: o.state,
      gap: o.gap,
      reaches_target: o.reachesTarget,
      binding_lever: o.bindingLeverId,
      slack_days: o.slackDays,
      cost: o.cost,
      cost_unit: o.costUnit,
    })),
    trace: station?.dimensions.find((d) => d.key === "FUEL")?.trace ?? [],
    pnr: station?.pnr?.pnrDate ?? null,
  };
}
