import * as React from "react";
import { Link, Navigate } from "react-router-dom";
import { SearchX } from "lucide-react";
import type { ApproveRequest, ApproveResponse, RejectRequest } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { decisionsView } from "@dhruv/store";
import { DecisionScreen } from "../components/decisions";
import { TraceDrawer } from "../components/trace";
import { actorLabel, formatSimClock } from "../format";
import { useDevice } from "../live/DeviceProvider";
import { nodeLabel } from "../live/chrome";
import { approvalPreview, buildDecisionScreen } from "../live/decisionView";
import { useLiveOps } from "../live/ops";
import { Frame, QuietLine, REFRESHING_AFTER_RESET } from "./Frame";

/**
 * Decision Detail for the signed-in device (F3). The decision, its recorded options and outcome
 * come from events; while it awaits a decision the option values are the live engine's for the
 * decision's station. Approve and reject go to the API when this device's link is up; otherwise
 * they are written as DECISION_APPROVED / DECISION_REJECTED events and sync later (section 9:
 * offline station-level decisions sync as events).
 */
export function LiveDecisionDetail({ id }: { id: string }) {
  const device = useDevice()!;
  const ops = useLiveOps();
  const snap = device.snapshot;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [showMath, setShowMath] = React.useState(false);

  const data = React.useMemo(() => {
    if (!snap || !ops) return undefined;
    const events = snap.events.filter((e) => !snap.rejected.has(e.event_id));
    const decision = decisionsView(events).find((d) => d.id === id);
    if (!decision) return undefined;
    return buildDecisionScreen({
      decision, events, allEvents: snap.events, pendingIds: snap.pendingIds, rejected: snap.rejected, seed: snap.seed ?? season48,
      evaluation: ops.evaluation, now: snap.now, identity: device.session.identity, stationName: nodeLabel,
    });
  }, [snap, ops, id, device.session.identity]);

  // Frame shows "Checking this device's data…" until the data is confirmed; a reset's reload says so.
  if (!device.dataConfirmed) return <Frame moment="start" nav="decisions">{null}</Frame>;
  if (device.refreshing) return <Frame moment="start" nav="decisions"><QuietLine>{REFRESHING_AFTER_RESET}</QuietLine></Frame>;
  if (!snap || !ops) return null;
  const { identity } = device.session;

  if (!data) {
    const others = decisionsView(snap.events.filter((e) => !snap.rejected.has(e.event_id)));
    return (
      <Frame moment="start" nav="decisions">
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong p-6 text-sm text-fg-2">
            <SearchX size={18} className="mb-2 text-fg-2" aria-hidden />
            {device.resetSeen ? (
              // After a Reset to Start the old run's decisions are gone for good: do not promise a sync.
              <>
                <p className="font-semibold text-fg">Decision {id} is not part of the current run.</p>
                <p className="mt-1">The server was reset to Start since this device loaded it. <Link to="/decisions" className="text-accent hover:underline">Open decisions</Link> for what this device holds now.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-fg">Decision {id} is not on this device.</p>
                <p className="mt-1">It may not have synced here yet. Local operations continue; it appears after the next sync that brings it in.</p>
              </>
            )}
            {others.length > 0 && <DecisionLinks decisions={others} />}
          </div>
        </div>
      </Frame>
    );
  }

  const now = snap.now;
  const online = snap.link === "ONLINE";
  const decision = data;

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

  const approve = (optionId: string, verifyAck: boolean) =>
    void act(async () => {
      if (online) {
        const body: ApproveRequest = { chosen_option_id: optionId, verify_ack: verifyAck, observed_at: now };
        await device.call<ApproveResponse>(`/decisions/${id}/approve`, { method: "POST", body: JSON.stringify(body) });
      } else {
        await device.write({
          type: "DECISION_APPROVED",
          entity_type: "decision",
          entity_id: id,
          node_id: decision.nodeId,
          payload: { decision_id: id, chosen_option_id: optionId, approver: identity.device_id, verify_ack: verifyAck },
        });
      }
    });

  const reject = (reason: string) =>
    void act(async () => {
      if (online) {
        const body: RejectRequest = { reason, observed_at: now };
        await device.call(`/decisions/${id}/reject`, { method: "POST", body: JSON.stringify(body) });
      } else {
        await device.write({ type: "DECISION_REJECTED", entity_type: "decision", entity_id: id, node_id: decision.nodeId, payload: { decision_id: id, reason } });
      }
    });

  const effects = Object.fromEntries(data.options.flatMap((o) => Object.entries(o.facts.effects ?? {})));
  const seed = snap.seed ?? season48;

  return (
    <Frame moment="start" nav="decisions"
      drawer={showMath && (
        <TraceDrawer title={`${data.station} · Fuel`} state={data.stationNow.fuelState} subtitle={`As seen by ${identity.device_id} at ${formatSimClock(now)}`}
          steps={data.why} units={data.units} b0={data.b0} onClose={() => setShowMath(false)} />
      )}>
      <DecisionScreen
        key={id}
        data={data}
        viewer={actorLabel(identity.role, identity.device_id)}
        now={now}
        preview={(levers) => approvalPreview(levers, seed, effects)}
        linkNote={online ? undefined : `Link ${snap.link.toLowerCase()} (simulated). Local operations active: the decision is recorded on this device and sent when the link allows. HQ applies the same checks then.`}
        busy={busy}
        error={error}
        onShowMath={() => setShowMath(true)}
        onApprove={approve}
        onReject={reject}
      />
    </Frame>
  );
}

function DecisionLinks({ decisions }: { decisions: ReturnType<typeof decisionsView> }) {
  return (
    <div className="mt-3">
      <p className="text-fg">Decisions on this device:</p>
      <ul className="mt-1 space-y-1">
        {decisions.map((d) => (
          <li key={d.id}>
            <Link to={`/decisions/${d.id}`} className="font-mono text-accent hover:underline">{d.id}</Link>
            <span className="ml-2 text-xs">{nodeLabel(d.node_id)} · {d.status.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * /decisions for a signed-in device: the first decision still waiting (the queue's order), else the
 * most recent one. Decision ids depend on the scenario (DEC-01 in season48, DEC-AGROUND in the 2016
 * run-through), so the sidebar never links to a fixed id.
 */
export function LiveDecisionsIndex() {
  const device = useDevice();
  const snap = device?.snapshot;
  // Pick only from data confirmed as the current run, so a stale store never chooses the redirect.
  if (device && !device.dataConfirmed) return <Frame moment="start" nav="decisions">{null}</Frame>;
  if (device?.refreshing) return <Frame moment="start" nav="decisions"><QuietLine>{REFRESHING_AFTER_RESET}</QuietLine></Frame>;
  if (!snap) return null;
  const decisions = decisionsView(snap.events.filter((e) => !snap.rejected.has(e.event_id)));
  const pick = decisions.find((d) => d.status === "PROPOSED") ?? [...decisions].sort((a, b) => b.proposed_at.localeCompare(a.proposed_at))[0];
  if (pick) return <Navigate to={`/decisions/${pick.id}`} replace />;
  return (
    <Frame moment="start" nav="decisions">
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-dashed border-line-strong p-6 text-sm text-fg-2">
          <p className="font-semibold text-fg">No decisions on this device yet.</p>
          <p className="mt-1">The engine proposes one when a station falls below its thresholds and a lever can help. It appears here, and in the Command Center's queue, as soon as it reaches this device.</p>
        </div>
      </div>
    </Frame>
  );
}
