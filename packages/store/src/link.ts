import type { DhruvDb } from "./db.js";

export type LinkState = "online" | "degraded" | "offline";

const LINK_KEY = "link_state";

/**
 * Simulated link state (section 2.1: "simulated link: Online / Degraded /
 * Offline"). Drives whether drainOutbox attempts to push at all, and how
 * much it pushes when degraded — see priorityDrain in outbox.ts.
 */
export async function setLinkState(db: DhruvDb, state: LinkState): Promise<void> {
  await db.meta.put({ key: LINK_KEY, value: state });
}

export async function getLinkState(db: DhruvDb): Promise<LinkState> {
  const entry = await db.meta.get(LINK_KEY);
  return (entry?.value as LinkState) ?? "online";
}
