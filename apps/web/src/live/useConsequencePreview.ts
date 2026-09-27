import * as React from "react";
import { evaluate, type Evaluation } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { DIMENSION_LABEL, consequenceLine } from "../format";

/** A stock transaction as typed in the form, before it is recorded. */
export interface StockDraft {
  type: "STOCK_ISSUED" | "STOCK_RECEIVED" | "STOCK_COUNTED";
  itemId: string;
  node: string;
  qty: number;
  role: string;
}

function findItem(evaluation: Evaluation, node: string, itemId: string) {
  const st = evaluation.stations.find((s) => s.nodeId === node);
  for (const d of st?.dimensions ?? []) {
    const item = d.items?.find((i) => i.id === itemId);
    if (item) return { d, item };
  }
  return undefined;
}

/**
 * What the engine will say after this draft (section 9.4): the same evaluate() the what-if drawer
 * uses, on this device's events plus the draft as one hypothetical overlay event. Nothing is
 * written. Returns the line to show, or undefined when the item is not in the evaluation.
 */
export function previewConsequence(draft: StockDraft, ctx: { seed: Seed; events: OpEvent[]; now: string; evaluation?: Evaluation }) {
  const { seed, events, now } = ctx;
  const payload = draft.type === "STOCK_ISSUED" ? { item_id: draft.itemId, qty: draft.qty, reason: "preview" } : { item_id: draft.itemId, qty: draft.qty };
  const overlay = {
    event_id: "preview-overlay", device_id: "PREVIEW", seq: 0, observed_at: now, created_at_client: now, actor_role: draft.role, schema_version: 1, priority: 2,
    type: draft.type, entity_type: "inventory_item", entity_id: draft.itemId, node_id: draft.node, payload,
  } as OpEvent;
  const before = findItem(ctx.evaluation ?? evaluate({ seed, events }, now), draft.node, draft.itemId);
  const after = findItem(evaluate({ seed, events: [...events, overlay] }, now), draft.node, draft.itemId);
  if (!before || !after || before.item.stock === undefined || after.item.stock === undefined) return undefined;
  const name = seed.inventory_items.find((i) => i.id === draft.itemId)?.name ?? draft.itemId;
  return consequenceLine({
    item: name, unit: before.item.unit, dimension: DIMENSION_LABEL[before.d.key] ?? before.d.key,
    stock: { before: before.item.stock, after: after.item.stock },
    ratio: { before: before.d.ratio, after: after.d.ratio },
    state: { before: before.d.state, after: after.d.state },
  });
}

/** previewConsequence, debounced 200 ms while the operator types; undefined until the draft is valid. */
export function useConsequencePreview(draft: StockDraft | undefined, ctx: Parameters<typeof previewConsequence>[1]) {
  const key = draft ? JSON.stringify(draft) : "";
  const [result, setResult] = React.useState<{ key: string; line: ReturnType<typeof previewConsequence> }>();
  const { seed, events, now, evaluation } = ctx;
  React.useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => setResult({ key, line: previewConsequence(draft, { seed, events, now, evaluation }) }), 200);
    return () => clearTimeout(t);
    // The draft is identified by its key; re-run when the device's events or clock move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, seed, events, now, evaluation]);
  return draft && result?.key === key ? result.line : undefined;
}
