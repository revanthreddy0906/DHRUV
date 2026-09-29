import * as React from "react";
import { CircleAlert, CircleCheck, CloudUpload, OctagonAlert, Signal, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import type { CheckInStatus } from "../format";
import type { LinkStatus, Role } from "../data/types";
import { cx } from "./primitives";
import { UserMenu } from "./shell";

/**
 * Field Lead mobile view (SPEC B): outdoors, gloves, glare, one hand, mostly offline. Presentational
 * only; the live screen (screens/FieldLive) and the static /field preview both fill a FieldModel.
 */

/** Where a write from this device stands, from the device's own store (never assumed). */
export interface FieldFeedback {
  kind: "saving" | "pending" | "synced" | "rejected" | "error";
  text: string;
}

export interface FieldModel {
  team: string;
  station: string;
  /** Sim time: the date in Inter, the time in mono ("25 Jan", "08:00"). */
  clock: { date: string; time: string };
  link: { status: LinkStatus; text: string };
  user?: { role: Role; deviceId: string; onSignOut: () => void };
  checkIn: {
    status: CheckInStatus;
    /** Times of check-ins still in this device's outbox: "07:00". */
    waiting: string[];
    feedback?: FieldFeedback;
    /** Set when this role may not record a check-in (EVENT_RULES). */
    disabledReason?: string;
    busy?: boolean;
    onCheckIn?: () => void;
  };
  mission?: { id: string; name: string; dates: string; vehicle?: string; people: string[]; risk?: { state: "AMBER" | "RED"; word: string } };
  position?: { coords: string; age: string };
  incident: {
    types: { id: string; label: string }[];
    disabledReason?: string;
    feedback?: FieldFeedback;
    busy?: boolean;
    onRaise?: (type: string, note: string) => void;
  };
}

const LINK_ICON: Record<LinkStatus, typeof Wifi> = { ONLINE: Wifi, DEGRADED: Signal, OFFLINE: WifiOff };

function Header({ model }: { model: FieldModel }) {
  const Icon = LINK_ICON[model.link.status];
  return (
    <header className="shrink-0 border-b border-line bg-chrome px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-7 items-center justify-center rounded-sm border border-accent font-mono text-xs font-semibold text-accent">D</span>
          <span className="text-heading font-semibold text-fg">{model.team} · {model.station}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg">{model.clock.date} <span className="font-mono tabular-nums">{model.clock.time}</span></span>
          {model.user && <UserMenu role={model.user.role} station={model.station} deviceId={model.user.deviceId} onSignOut={model.user.onSignOut} />}
        </div>
      </div>
      <p aria-live="polite" className={cx("mt-1 flex items-center gap-1.5 text-sm", model.link.status === "ONLINE" ? "text-fg-2" : "text-warn")}>
        <Icon size={16} strokeWidth={1.75} aria-hidden />{model.link.text}
      </p>
    </header>
  );
}

export function Feedback({ feedback }: { feedback?: FieldFeedback }) {
  if (!feedback) return null;
  const bad = feedback.kind === "rejected" || feedback.kind === "error";
  const Icon = bad ? CircleAlert : feedback.kind === "synced" ? CircleCheck : CloudUpload;
  return (
    <p role={bad ? "alert" : "status"} className={cx("flex items-start gap-1.5 text-sm", bad ? "text-bad" : "text-fg")}>
      <Icon size={16} strokeWidth={1.75} aria-hidden className={cx("mt-0.5 shrink-0", !bad && (feedback.kind === "synced" ? "text-ok" : "text-fg-2"))} />{feedback.text}
    </p>
  );
}

const STATE_LOOK = {
  NONE: { card: "border-line bg-surface", text: "text-fg", Icon: null },
  ON_SCHEDULE: { card: "border-line bg-surface", text: "text-fg", Icon: null },
  DUE_SOON: { card: "border-warn/45 bg-warn-tint", text: "text-warn", Icon: TriangleAlert },
  OVERDUE: { card: "border-bad/50 bg-bad-tint", text: "text-bad", Icon: OctagonAlert },
} as const;

function CheckInCard({ checkIn }: { checkIn: FieldModel["checkIn"] }) {
  const { status } = checkIn;
  const look = STATE_LOOK[status.state];
  return (
    <section aria-label="Check-in" className={cx("space-y-3 rounded-lg border p-4", look.card)}>
      <div>
        <h2 className={cx("flex items-center gap-2 text-title font-semibold", look.text)}>
          {look.Icon && <look.Icon size={20} strokeWidth={1.75} aria-hidden />}{status.headline}
        </h2>
        {status.checkedIn && <p className="text-heading text-fg">{status.checkedIn}</p>}
        {status.schedule && <p className="text-heading text-fg-2">{status.schedule}</p>}
      </div>
      <button type="button" onClick={checkIn.onCheckIn} disabled={!!checkIn.disabledReason || checkIn.busy}
        className="h-14 w-full rounded-md bg-accent text-title font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45">
        Check in now
      </button>
      {checkIn.disabledReason && <p className="text-sm text-fg-2">{checkIn.disabledReason}</p>}
      <Feedback feedback={checkIn.feedback} />
      {checkIn.waiting.length > 0 && (
        <p className="text-sm text-fg">Waiting to send: {checkIn.waiting.map((t, i) => <React.Fragment key={i}>{i ? ", " : ""}check-in <span className="font-mono tabular-nums">{t}</span></React.Fragment>)}</p>
      )}
    </section>
  );
}

function MissionCard({ mission }: { mission: NonNullable<FieldModel["mission"]> }) {
  return (
    <section aria-label="Mission" className="space-y-1 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading font-semibold text-fg"><span className="font-mono">{mission.id}</span> {mission.name}</h2>
        {mission.risk && (
          <span className={cx("inline-flex items-center gap-1 text-sm font-semibold", mission.risk.state === "RED" ? "text-bad" : "text-warn")}>
            {mission.risk.state === "RED" ? <OctagonAlert size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />}{mission.risk.word}
          </span>
        )}
      </div>
      <p className="text-heading text-fg">{mission.dates}{mission.vehicle && <> · with <span className="font-mono">{mission.vehicle}</span></>}</p>
      {mission.people.length > 0 && <p className="text-heading text-fg-2">{mission.people.join(", ")}</p>}
    </section>
  );
}

function PositionCard({ position }: { position: NonNullable<FieldModel["position"]> }) {
  return (
    <section aria-label="Last confirmed position" className="space-y-1 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-heading font-semibold text-fg">Last confirmed position</h2>
      <p className="text-title text-fg"><span className="font-mono tabular-nums">{position.coords}</span> <span className="text-heading text-fg-2">· {position.age}</span></p>
      <p className="text-xs text-fg-3">Position from device (demo constant)</p>
    </section>
  );
}

function IncidentSheet({ incident, onClose }: { incident: FieldModel["incident"]; onClose: () => void }) {
  const [type, setType] = React.useState(incident.types[0]?.id ?? "");
  const [note, setNote] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const first = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { first.current?.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const done = sent && incident.feedback && incident.feedback.kind !== "error";
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-fg/40">
      <div role="dialog" aria-modal="true" aria-labelledby="raise-incident-title" className="space-y-4 rounded-t-lg border-t border-line bg-surface p-4">
        <h2 id="raise-incident-title" className="text-title font-semibold text-fg">Raise incident</h2>
        {done ? (
          <>
            <Feedback feedback={incident.feedback} />
            <button type="button" onClick={onClose} className="h-14 w-full rounded-md border border-line-strong bg-elevated text-title font-semibold text-fg">Close</button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(true); incident.onRaise?.(type, note.trim()); }}>
            <fieldset>
              <legend className="mb-2 text-heading font-semibold text-fg">Incident type</legend>
              <div role="radiogroup" className="grid gap-2">
                {incident.types.map((t, i) => (
                  <label key={t.id} className={cx("flex h-14 cursor-pointer items-center gap-3 rounded-md border px-4 text-heading",
                    type === t.id ? "border-accent bg-accent-tint text-fg" : "border-line-ctrl bg-surface text-fg")}>
                    <input ref={i === 0 ? first : undefined} type="radio" name="incident-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="size-5 accent-accent" />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-1 block text-heading font-semibold text-fg">Note <span className="font-normal text-fg-2">(optional)</span></span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-line-ctrl bg-surface p-3 text-heading text-fg" />
            </label>
            <Feedback feedback={incident.feedback?.kind === "error" ? incident.feedback : undefined} />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} className="h-14 rounded-md border border-line-strong bg-elevated text-title font-semibold text-fg">Cancel</button>
              <button type="submit" disabled={incident.busy} className="h-14 rounded-md border border-bad bg-bad text-title font-semibold text-on-accent disabled:opacity-45">Raise incident</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** The phone screen itself. */
export function FieldView({ model }: { model: FieldModel }) {
  const [sheet, setSheet] = React.useState(false);
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-fg">
      <Header model={model} />
      <main className="flex-1 space-y-4 overflow-auto p-4">
        <CheckInCard checkIn={model.checkIn} />
        {model.mission && <MissionCard mission={model.mission} />}
        {model.position && <PositionCard position={model.position} />}
        <div className="pt-2">
          <button type="button" onClick={() => setSheet(true)} disabled={!!model.incident.disabledReason}
            className="h-14 w-full rounded-md border-2 border-bad bg-surface text-title font-semibold text-bad disabled:cursor-not-allowed disabled:opacity-45">
            Raise incident
          </button>
          {model.incident.disabledReason && <p className="mt-1 text-sm text-fg-2">{model.incident.disabledReason}</p>}
        </div>
      </main>
      {sheet && <IncidentSheet incident={model.incident} onClose={() => setSheet(false)} />}
    </div>
  );
}

/**
 * Desktop presentation (B.3): at 768 px and wider the phone sits centred in a 390 px frame under a
 * quiet caption; below that it is the whole screen.
 */
export function FieldFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg md:flex md:flex-col md:items-center md:gap-3 md:py-6">
      <p className="hidden text-sm text-fg-2 md:block">Field Lead view (mobile)</p>
      <div className="h-dvh w-full md:h-[min(844px,calc(100dvh-96px))] md:w-[390px] md:overflow-hidden md:rounded-lg md:border md:border-line">
        {children}
      </div>
    </div>
  );
}
