import * as React from "react";
import { Pencil, TriangleAlert } from "lucide-react";
import { IDS, DEVICES, NODES } from "@dhruv/seed";
import { getMeta, setMeta } from "@dhruv/store";
import type { OpEvent } from "@dhruv/shared";
import { CARGO_START, type ShipmentView } from "../data/demo";
import { LegTimeline } from "../components/ops";
import { Button, Card, SectionHeader } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { dayLabel } from "../live/describe";
import { formatAge } from "../live/format";
import { Frame } from "./Frame";

function parseEtaInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "7 Feb" || trimmed === "7 Feb 2027" || trimmed === "2027-02-07") {
    return "2027-02-07T00:00:00.000Z";
  }
  try {
    const d = new Date(trimmed.includes("2027") ? trimmed : `${trimmed} 2027`);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // fallback
  }
  return "2027-02-07T00:00:00.000Z";
}

export function LiveCargoScreen() {
  const device = useDevice();
  const ops = useLiveOps();

  if (!device || !ops) {
    return (
      <Frame moment="start" nav="cargo">
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-fg-2">
            <div className="size-6 animate-spin rounded-full border-2 border-line-ctrl border-t-accent" />
            <span className="font-mono text-xs tracking-wider">HYDRATING EXPEDITION STATE...</span>
          </div>
        </div>
      </Frame>
    );
  }

  const snap = device.snapshot;
  const events = snap ? (snap.rejected.size ? snap.events.filter((e) => !snap.rejected.has(e.event_id)) : snap.events) : [];

  const delayedEvent = events.find(
    (e) => e.type === "LEG_DELAYED" && (e.entity_id === IDS.legC104Feeder || (e.payload as any)?.leg_id === IDS.legC104Feeder)
  );
  const isDelayed = !!delayedEvent;

  const vesselEvent = events.find(
    (e) => e.type === "VESSEL_UPDATED" && (e.entity_id === IDS.vessel || (e.payload as any)?.vessel_id === IDS.vessel)
  );
  const isVesselHeld = !!vesselEvent;

  const [edit, setEdit] = React.useState(!isDelayed);
  const [newEtaInput, setNewEtaInput] = React.useState("7 Feb");
  const [reasonInput, setReasonInput] = React.useState("feeder vessel delayed");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!isDelayed) {
      setEdit(true);
    }
  }, [isDelayed]);

  const shipments: ShipmentView[] = React.useMemo(() => {
    if (!isDelayed) return CARGO_START;

    const delayedEtaLabel = delayedEvent?.payload?.new_eta
      ? dayLabel(delayedEvent.payload.new_eta as string)
      : "7 Feb";
    const freshnessAge = delayedEvent?.observed_at
      ? formatAge(delayedEvent.observed_at, snap?.now ?? "2027-01-24T08:10:00.000Z")
      : "1 m";

    return CARGO_START.map((s): ShipmentView => {
      if (s.id === "C-104") {
        if (!isVesselHeld) {
          return {
            ...s,
            slack: "−3 d",
            slackState: "RED",
            feasible: "EXCLUDED",
            note: "Cargo excluded by vessel cutoff (window cliff)",
            legs: s.legs.map((l) =>
              l.id === "L2"
                ? {
                    ...l,
                    eta: delayedEtaLabel,
                    status: "DELAYED",
                    freshness: { cls: "FRESH", age: freshnessAge },
                  }
                : l
            ),
          };
        } else {
          return {
            ...s,
            cutoff: "7 Feb (held)",
            slack: "0 d",
            slackState: "AMBER",
            feasible: "FEASIBLE",
            legs: s.legs.map((l) =>
              l.id === "L2"
                ? {
                    ...l,
                    eta: delayedEtaLabel,
                    status: "DELAYED",
                    freshness: { cls: "FRESH", age: freshnessAge },
                  }
                : l.id === "L3"
                ? {
                    ...l,
                    etd: "9 Feb",
                    eta: "27 Feb",
                  }
                : l
            ),
          };
        }
      }

      if (isVesselHeld) {
        return {
          ...s,
          cutoff: "7 Feb (held)",
          slack: s.id === "C-107" ? "8 d" : "4 d",
          slackState: "GREEN",
          legs: s.legs.map((l) =>
            l.id === "L3" ? { ...l, etd: "9 Feb", eta: "27 Feb" } : l
          ),
        };
      }

      return s;
    });
  }, [isDelayed, isVesselHeld, delayedEvent, snap?.now]);

  const handleRecordDelayed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (busy || !snap) return;
    setBusy(true);
    setError(undefined);
    try {
      const observedAt =
        Date.parse(snap.now) <= Date.parse("2027-01-24T08:10:00.000Z")
          ? "2027-01-24T08:10:00.000Z"
          : snap.now;
      const newEtaIso = parseEtaInput(newEtaInput);
      const reason = reasonInput.trim() || "feeder vessel delayed";

      const isHq = device.session.identity.role === "HQ_OPS";
      if (isHq) {
        await device.write({
          type: "LEG_DELAYED",
          entity_type: "leg",
          entity_id: IDS.legC104Feeder,
          node_id: NODES.HQ,
          payload: {
            leg_id: IDS.legC104Feeder,
            new_eta: newEtaIso,
            reason,
          },
          observed_at: observedAt,
        });
        device.syncNow();
      } else {
        const seq = (await getMeta<number>(device.db, "seq", 0)) + 1;
        const event: OpEvent = {
          event_id: crypto.randomUUID(),
          device_id: DEVICES.HQ_WEB,
          seq,
          type: "LEG_DELAYED",
          entity_type: "leg",
          entity_id: IDS.legC104Feeder,
          node_id: NODES.HQ,
          payload: {
            leg_id: IDS.legC104Feeder,
            new_eta: newEtaIso,
            reason,
          },
          observed_at: observedAt,
          created_at_client: new Date().toISOString(),
          priority: 3,
          actor_role: "HQ_OPS",
          schema_version: 1,
        };
        await setMeta(device.db, "seq", seq);
        await device.db.events.add(event);
      }
      setEdit(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const moment = ops.mockMoment;
  return (
    <Frame moment={moment} nav="cargo">
      <div className="space-y-4 p-5">
        <div className="flex items-end gap-3">
          <div>
            <h1 className="text-xl font-semibold text-fg">Cargo</h1>
            <p className="mt-0.5 text-sm text-fg-2">
              Inbound to Maitri · MV Ice Star load cutoff{" "}
              <span className="font-mono">{isVesselHeld ? "7 Feb (held)" : "4 Feb"}</span> · departs{" "}
              {isVesselHeld ? "9 Feb" : "6 Feb"} · closing 28 Feb
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>
              Edit ETA
            </Button>
          </div>
        </div>

        {edit && (
          <Card className="border-accent/60">
            <SectionHeader title="Edit ETA · C-104 L2 Mumbai → Cape Town · consequence preview" />
            <form onSubmit={handleRecordDelayed} className="flex flex-wrap items-center gap-4">
              <label className="text-xs text-fg-2">
                New ETA{" "}
                <input
                  value={newEtaInput}
                  onChange={(e) => setNewEtaInput(e.target.value)}
                  className="ml-2 h-8 w-24 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-sm text-fg"
                />
              </label>
              <label className="text-xs text-fg-2">
                Reason{" "}
                <input
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="ml-2 h-8 w-56 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg"
                />
              </label>
              <div className="flex items-center gap-2 rounded-md border border-bad/50 bg-bad-tint px-3 py-1.5 text-[12px] text-fg">
                <TriangleAlert size={14} className="text-bad" aria-hidden />
                Preview: 7 Feb &gt; cutoff 4 Feb · C-104 excluded · Maitri Fuel 1.0606 →{" "}
                <b className="font-mono text-bad">0.697 RED</b> · PNR 3 Feb
              </div>
              <Button variant="primary" type="submit" disabled={busy}>
                Record LEG_DELAYED
              </Button>
              <Button variant="ghost" type="button" onClick={() => setEdit(false)}>
                Cancel
              </Button>
            </form>
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          </Card>
        )}

        {shipments.map((s) => (
          <LegTimeline
            key={s.id}
            s={s}
            today={isVesselHeld ? "26 Jan" : "24 Jan"}
            originalEta={isDelayed && s.id === "C-104" ? "2 Feb" : undefined}
          />
        ))}

        <p className="text-[11px] text-fg-2">
          Cargo-leg freshness is shown as a badge. When an ETA report is STALE or worse and slack ≤ 2 d, R17 marks the inbound UNCERTAIN and the band's low side excludes it.
        </p>
      </div>
    </Frame>
  );
}

