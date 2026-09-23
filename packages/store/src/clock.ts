import { config, type OpEvent } from "@dhruv/shared";
import type { DhruvDb } from "./db.js";

/**
 * clock.now() (section 8). In demo mode the time is the latest local CLOCK_ADVANCED jump
 * (absolute, v2 C5), or the demo start if none; real mode uses the system time.
 * CLOCK_ADVANCED is local-only and never synced, so reading it needs no network.
 */
export async function now(db: DhruvDb, { demoMode = true }: { demoMode?: boolean } = {}): Promise<string> {
  if (!demoMode) return new Date().toISOString();
  const jumps = await db.events.where("type").equals("CLOCK_ADVANCED").toArray();
  const latest = jumps.sort((a, b) => a.seq - b.seq).at(-1) as OpEvent | undefined;
  return latest ? (latest.payload as { now: string }).now : config.demo.startAt;
}
