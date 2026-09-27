import * as React from "react";
import { EVENT_RULES, PERSON_STATUSES, type EventType } from "@dhruv/shared";
import { NODES } from "@dhruv/seed";
import { Button, Card, SectionHeader } from "../components/primitives";
import { nodeLabel } from "./chrome";
import { parseEtaInput } from "./format";
import { WriteFeedback, useEventWriter } from "./writeStatus";

/** A person as the engine's reduce() has them now, with their name from the seed roster. */
export interface LivePerson {
  id: string;
  name: string;
  role: string;
  nodeId: string;
  status: string;
  lastObservedAt: string;
}

const PERSON_ACTIONS = [
  { type: "PERSON_STATUS_SET", label: "Set status" },
  { type: "PERSON_MOVED", label: "Move to another node" },
] as const satisfies readonly { type: EventType; label: string }[];
type PersonType = (typeof PERSON_ACTIONS)[number]["type"];

/** The personnel actions a role may record, from the event contract (EVENT_RULES). */
export function personActionsFor(role: string) {
  return PERSON_ACTIONS.filter((a) => (EVENT_RULES[a.type].allowedRoles as readonly string[]).includes(role));
}

/** Nodes a person can be moved to: every expedition node except where they are now. */
export const MOVE_TARGETS = [NODES.MAITRI, NODES.BHARATI, NODES.CAPE_TOWN, NODES.HQ];

const field = "h-8 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg";

/**
 * Person, Action, then only the fields that action's payload needs. Writes PERSON_STATUS_SET or
 * PERSON_MOVED through device.write(); the roster beside it is the engine's reduce() of the log.
 */
export function PersonnelActionForm({ role, node, people, now }: { role: string; node: string; people: LivePerson[]; now: string }) {
  const actions = personActionsFor(role);
  const [personId, setPersonId] = React.useState(people[0]?.id ?? "");
  const [action, setAction] = React.useState<PersonType>(actions[0]?.type ?? "PERSON_STATUS_SET");
  const [status, setStatus] = React.useState<string>("ON_STATION");
  const [toNode, setToNode] = React.useState<string>("");
  const [arrive, setArrive] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const { busy, error, last, submit } = useEventWriter();

  if (actions.length === 0 || people.length === 0) {
    return (
      <Card>
        <SectionHeader title="Personnel action" />
        <p className="text-sm text-fg-2">{people.length === 0 ? `No one is at ${nodeLabel(node)} now.` : "Read only for this role."}</p>
      </Card>
    );
  }

  const person = people.find((p) => p.id === personId) ?? people[0]!;
  const targets = MOVE_TARGETS.filter((n) => n !== person.nodeId);
  const to = targets.includes(toNode as (typeof targets)[number]) ? toNode : targets[0]!;
  // Arrival defaults to now (an internal move); a typed date must not be before departure.
  const arriveIso = arrive.trim() ? parseEtaInput(arrive) : now;
  const errors: { status?: string; arrive?: string } = {};
  if (action === "PERSON_STATUS_SET" && status === person.status) errors.status = `Already ${status.replace("_", " ").toLowerCase()}`;
  if (action === "PERSON_MOVED" && (!arriveIso || arriveIso < now)) errors.arrive = arriveIso ? "Arrival cannot be before now" : 'Enter a date like "2 Feb", or leave empty for now';
  const invalid = Object.keys(errors).length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (busy || invalid) return;
    // Station roles write for their own node (the server's node rule); HQ writes for the person's node.
    const nodeId = role === "HQ_OPS" ? person.nodeId : node;
    const ok =
      action === "PERSON_STATUS_SET"
        ? await submit(
            { type: "PERSON_STATUS_SET", entity_type: "person", entity_id: person.id, node_id: nodeId, payload: { person_id: person.id, status } },
            `${person.name} → ${status.replace("_", " ").toLowerCase()}`,
          )
        : await submit(
            { type: "PERSON_MOVED", entity_type: "person", entity_id: person.id, node_id: nodeId, payload: { person_id: person.id, from_node: person.nodeId, to_node: to, depart: now, arrive: arriveIso! } },
            `${person.name} ${nodeLabel(person.nodeId)} → ${nodeLabel(to)}`,
          );
    if (ok) {
      setTouched(false);
      setArrive("");
    }
  };

  return (
    <Card>
      <SectionHeader title="Personnel action" meta={<span className="text-[11px] text-fg-2">Saved on this device first, then synced</span>} />
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-4">
        <label className="text-xs text-fg-2">Person
          <select aria-label="Person" value={person.id} onChange={(e) => setPersonId(e.target.value)} className={`${field} mt-1 block w-60`}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
          <span className="mt-1 block text-[11px]">Now <span className="font-mono text-fg">{person.status}</span> at {nodeLabel(person.nodeId)}</span>
        </label>
        <label className="text-xs text-fg-2">Action
          <select aria-label="Personnel action" value={action} onChange={(e) => setAction(e.target.value as PersonType)} className={`${field} mt-1 block w-48`}>
            {actions.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
          </select>
        </label>
        {action === "PERSON_STATUS_SET" ? (
          <label className="text-xs text-fg-2">Status
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} mt-1 block w-40 font-mono`}>
              {PERSON_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {touched && errors.status && <span className="mt-1 block text-[11px] text-bad">{errors.status}</span>}
          </label>
        ) : (
          <>
            <label className="text-xs text-fg-2">To
              <select aria-label="Move to" value={to} onChange={(e) => setToNode(e.target.value)} className={`${field} mt-1 block w-36`}>
                {targets.map((n) => <option key={n} value={n}>{nodeLabel(n)}</option>)}
              </select>
            </label>
            <label className="text-xs text-fg-2">Arrives (optional)
              <input aria-label="Arrives" value={arrive} onChange={(e) => setArrive(e.target.value)} placeholder="now" className={`${field} mt-1 block w-28 font-mono`} />
              {touched && errors.arrive && <span className="mt-1 block text-[11px] text-bad">{errors.arrive}</span>}
            </label>
          </>
        )}
        <div className="pt-5">
          <Button variant="primary" type="submit" disabled={busy || (touched && invalid)}>{busy ? "Saving…" : "Submit"}</Button>
        </div>
      </form>
      <div className="mt-3"><WriteFeedback event={last?.event} summary={last?.summary} error={error} /></div>
    </Card>
  );
}
