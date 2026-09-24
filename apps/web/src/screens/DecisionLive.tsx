import * as React from "react";
import { SearchX } from "lucide-react";
import type { ApproveRequest, ApproveResponse, RejectRequest } from "@dhruv/shared";
import { decisionsView, type DecisionOptionView } from "@dhruv/store";
import { DecisionDetail, type DecisionStatus } from "../components/decisions";
import { FRESHNESS_TRACE_HQ_2501600, HERO_TRACE, LEVERS, MOMENTS, OPTIONS_AFTER_SLIP, OPTIONS_HQ_2501600, OPTIONS_HQ_2501620 } from "../data/demo";
import type { OptionEval } from "../data/types";
import { useDevice, type LiveDevice } from "../live/DeviceProvider";
import { nodeLabel } from "../live/chrome";
import { dayLabel, describeEvent } from "../live/describe";
import { formatShort } from "../live/format";
import { approveReason, daysLeft, fullDate, useLiveOps } from "../live/ops";
import { Frame } from "./Frame";

const sameLevers = (a: string[], b: string[]) => a.length === b.length && a.every((l) => b.includes(l));

/** Options, traces and ratios are engine output (A): the design fixture for the live demo moment. */
function fixtureOptions(moment: string): OptionEval[] {
  if (moment === "hq-2501600") return OPTIONS_HQ_2501600;
  if (moment === "hq-2501620" || moment === "hq-2600900") return OPTIONS_HQ_2501620;
  return OPTIONS_AFTER_SLIP;
}

function outcomeText(device: LiveDevice, decision: ReturnType<typeof decisionsView>[number], optionLabel: (id: string) => string): DecisionStatus | undefined {
  if (decision.status === "PROPOSED") return undefined;
  const snap = device.snapshot;
  const waiting = !!decision.decided_event_id && !!snap?.pendingIds.has(decision.decided_event_id);
  const verb = decision.status === "APPROVED" ? `Approved option ${optionLabel(decision.chosen_option_id ?? "?")}` : "Rejected";
  const who = `${decision.decided_by ?? "unknown device"} at ${decision.decided_at ? formatShort(decision.decided_at) : "?"}`;
  if (waiting) return { tone: "warn", text: `${verb} on this device (${who}). Recorded as an event, waiting to sync; the server applies the same checks when it arrives.` };
  return { tone: decision.status === "APPROVED" ? "ok" : "bad", text: `${verb} by ${who}.` };
}

/**
 * Decision Detail for the signed-in device (F3). The decision, its recorded options and deadlines,
 * the trigger and the outcome come from events. Approve and reject go to the API when this
 * device's link is up; otherwise they are written as DECISION_APPROVED / DECISION_REJECTED events
 * and sync later (section 9: offline station-level decisions sync as events).
 */
export function LiveDecisionDetail({ id }: { id: string }) {
  const device = useDevice()!;
  const ops = useLiveOps();
  const snap = device.snapshot;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  if (!snap || !ops) return null;
  const moment = ops.mockMoment;
  const { identity } = device.session;
  const events = snap.events.filter((e) => !snap.rejected.has(e.event_id));
  const decision = decisionsView(events).find((d) => d.id === id) ?? ops.openDecisions.find((d) => d.id === id);

  if (!decision) {
    return (
      <Frame moment={moment} nav="decisions">
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-dashed border-line-strong p-6 text-sm text-fg-2">
            <SearchX size={18} className="mb-2 text-fg-2" aria-hidden />
            <p className="font-semibold text-fg">Decision {id} is not on this device.</p>
            <p className="mt-1">It may not have synced here yet. Local operations continue; it appears after the next sync that brings it in.</p>
          </div>
        </div>
      </Frame>
    );
  }

  const now = snap.now;
  // A decision this device recorded offline that the server then refused.
  const refused = snap.events.find(
    (e) => snap.rejected.has(e.event_id) && (e.type === "DECISION_APPROVED" || e.type === "DECISION_REJECTED") && (e.payload as { decision_id: string }).decision_id === id,
  );

  const realFor = (o: OptionEval): DecisionOptionView | undefined => decision.options.find((r) => sameLevers(r.levers, o.levers));
  const rawOptions = ops?.options && ops.options.length > 0 ? ops.options : fixtureOptions(moment);
  const options = rawOptions.map((o): OptionEval => {
    const real = realFor(o);
    const expired = real?.deadline && Date.parse(real.deadline) < Date.parse(now) ? `Deadline ${dayLabel(real.deadline)} has passed` : o.expired;
    return { ...o, deadline: real?.deadline ? dayLabel(real.deadline) : o.deadline, requiresVerify: [...new Set([...o.requiresVerify, ...(real?.requiresVerify ?? [])])], expired };
  });
  const optionBlocked = (optionId: string) => {
    const o = options.find((x) => x.id === optionId);
    if (!o) return undefined;
    if (o.expired) return o.expired;
    if (!realFor(o)) return `Option (${o.id}) is engine output not yet in the recorded proposal`;
    return undefined;
  };

  // Lever windows: deadline = cutoff - lead (section 13 seed), counted down on this device's clock.
  const seedLevers = snap.seed?.levers ?? [];
  const levers = LEVERS.map((l) => {
    const s = seedLevers.find((x) => x.id === l.id);
    if (!s) return l;
    const deadline = new Date(Date.parse(s.cutoff) - s.lead_days * 86_400_000).toISOString();
    return { ...l, deadline: dayLabel(deadline), daysLeft: daysLeft(now, deadline) };
  });

  const trigger = events.find((e) => e.event_id === decision.trigger_event_id);
  const mock = MOMENTS[moment].decisions.find((d) => d.id === id) ?? MOMENTS.slip.decisions.find((d) => d.id === id);
  const currentFuel = ops?.maitriStation.dimensions.find((d) => d.key === "FUEL");
  const current = currentFuel
    ? { state: currentFuel.state, ratio: currentFuel.ratio ?? 0, text: currentFuel.state === "RED" ? "Fuel below required threshold" : "All dimensions within thresholds" }
    : { ...(mock?.current ?? { state: "AMBER", ratio: 0 }), text: mock ? "Fuel below required threshold" : "Engine evaluation pending" };
  const trace = ops?.traceSteps && ops.traceSteps.length > 0
    ? ops.traceSteps
    : (moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : HERO_TRACE);
  const online = snap.link === "ONLINE";

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await run();
      device.syncNow();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const approve = (optionId: string, verifyAck: boolean) => {
    const o = options.find((x) => x.id === optionId);
    const real = o && realFor(o);
    if (!real) return;
    void act(async () => {
      if (online) {
        const body: ApproveRequest = { chosen_option_id: real.id, verify_ack: verifyAck, observed_at: now };
        await device.call<ApproveResponse>(`/decisions/${id}/approve`, { method: "POST", body: JSON.stringify(body) });
      } else {
        await device.write({
          type: "DECISION_APPROVED",
          entity_type: "decision",
          entity_id: id,
          node_id: decision.node_id,
          payload: { decision_id: id, chosen_option_id: real.id, approver: identity.device_id, verify_ack: verifyAck },
        });
      }
    });
  };

  const reject = (reason: string) =>
    void act(async () => {
      if (online) {
        const body: RejectRequest = { reason, observed_at: now };
        await device.call(`/decisions/${id}/reject`, { method: "POST", body: JSON.stringify(body) });
      } else {
        await device.write({ type: "DECISION_REJECTED", entity_type: "decision", entity_id: id, node_id: decision.node_id, payload: { decision_id: id, reason } });
      }
    });

  // The recorded option id (OPT-1) as the operator sees it: "(a) · OPT-1".
  const optionLabel = (realId: string) => {
    const shown = options.find((o) => realFor(o)?.id === realId);
    return shown ? `(${shown.id}) · ${realId}` : realId;
  };

  const refusedText = refused ? `The server refused the ${refused.type === "DECISION_APPROVED" ? "approval" : "rejection"} recorded on this device: ${snap.rejected.get(refused.event_id)}. The decision is still open.` : undefined;

  return (
    <Frame moment={moment} nav="decisions">
      <DecisionDetail
        key={`${id}-${moment}`}
        id={id}
        title={mock?.title ?? `Decision ${id}`}
        station={nodeLabel(decision.node_id)}
        current={current}
        trigger={trigger ? `${trigger.type} ${describeEvent(trigger)} · ${trigger.device_id} · ${formatShort(trigger.observed_at)}` : `Proposed ${formatShort(decision.proposed_at)}`}
        pnr={decision.pnr ? { date: fullDate(decision.pnr), daysLeft: daysLeft(now, decision.pnr) } : (ops?.pnr ? { date: ops.pnr.date, daysLeft: ops.pnr.daysLeft } : null)}
        trace={trace}
        levers={levers}
        options={options}
        role={identity.role}
        today={dayLabel(now)}
        blocked={{ approve: approveReason(decision, identity.role, identity.node_id), reject: identity.role !== "HQ_OPS" ? "Only HQ Ops can reject decisions" : undefined }}
        optionBlocked={optionBlocked}
        status={outcomeText(device, decision, optionLabel)}
        busy={busy}
        error={error ?? refusedText}
        note={online ? undefined : `Link ${snap.link.toLowerCase()} (simulated): the decision is written on this device as an event and syncs when the link allows. The server applies the same checks then.`}
        onApprove={approve}
        onReject={reject}
      />
    </Frame>
  );
}
