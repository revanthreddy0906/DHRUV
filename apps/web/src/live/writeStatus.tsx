import * as React from "react";
import { CircleAlert, CircleCheck, CloudUpload } from "lucide-react";
import type { OpEvent } from "@dhruv/shared";
import { useDevice } from "./DeviceProvider";

/**
 * Where an event this device wrote stands, read from the device's own store (never assumed):
 * saving (not in the local log yet), pending (in the outbox), synced (accepted and out of the
 * outbox) or rejected (the server refused it on sync, with its reason).
 */
export type WriteStatus =
  | { kind: "saving" }
  | { kind: "pending" }
  | { kind: "synced" }
  | { kind: "rejected"; reason: string };

export function useWriteStatus(eventId: string | undefined): WriteStatus | undefined {
  const snap = useDevice()?.snapshot;
  if (!eventId || !snap) return undefined;
  const reason = snap.rejected.get(eventId);
  if (reason !== undefined) return { kind: "rejected", reason };
  // The event and its outbox entry are written in one transaction, so once the live query
  // holds the event, pendingIds is current for it too.
  if (!snap.events.some((e) => e.event_id === eventId)) return { kind: "saving" };
  return snap.pendingIds.has(eventId) ? { kind: "pending" } : { kind: "synced" };
}

/** One line under a transaction form: what was written and where it is on its way to the server. */
export function WriteFeedback({ event, summary, error }: { event?: OpEvent; summary?: string; error?: string }) {
  const status = useWriteStatus(event?.event_id);
  if (error) {
    return <p role="alert" className="flex items-center gap-1.5 text-xs text-bad"><CircleAlert size={13} aria-hidden />{error}</p>;
  }
  if (!event || !status) return null;
  const head = <span className="font-mono">{event.type}</span>;
  const tail = summary ? <> · {summary}</> : null;
  switch (status.kind) {
    case "rejected":
      return <p role="alert" className="flex items-center gap-1.5 text-xs text-bad"><CircleAlert size={13} aria-hidden />{head}{tail} · rejected by server: {status.reason}. It is not counted in any view.</p>;
    case "synced":
      return <p role="status" className="flex items-center gap-1.5 text-xs text-ok"><CircleCheck size={13} aria-hidden />{head}{tail} · saved locally and accepted by the server.</p>;
    default:
      return <p role="status" className="flex items-center gap-1.5 text-xs text-fg-2"><CloudUpload size={13} aria-hidden />{head}{tail} · saved locally, pending sync (in the outbox).</p>;
  }
}

/** Shared busy / error / last-event state for a form that writes through device.write(). */
export function useEventWriter() {
  const device = useDevice();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [last, setLast] = React.useState<{ event: OpEvent; summary: string }>();

  /** Writes locally, then asks for an immediate sync. Resolves true only if the local write succeeded. */
  const submit = React.useCallback(
    async (draft: Parameters<NonNullable<typeof device>["write"]>[0], summary: string): Promise<boolean> => {
      if (!device) return false;
      setBusy(true);
      setError(undefined);
      try {
        const event = await device.write(draft);
        setLast({ event, summary });
        device.syncNow();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [device],
  );

  return { busy, error, last, submit, setError };
}
