import { NODES, STATION_NODES } from "@dhruv/seed";
import type { LoginRole } from "@dhruv/shared";

/** Section 16 environment keys: PORT, JWT_SECRET, ANTHROPIC_API_KEY (optional), DEMO_MODE. */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dhruv-demo-secret-change-me",
  demoMode: (process.env.DEMO_MODE ?? "true") === "true",
  dbFile: process.env.DHRUV_DB_FILE ?? "dhruv.db",
};

/** Fixed demo PINs per node (section 15, e.g. MAITRI-2027). Production needs real authentication. */
export const DEMO_PINS: Record<string, string> = {
  [NODES.HQ]: "HQ-2027",
  [NODES.MAITRI]: "MAITRI-2027",
  [NODES.BHARATI]: "BHARATI-2027",
};

/** Section 4 roles: HQ Ops sits at HQ; Station and Field Leads belong to a station. */
export function roleAllowedAtNode(role: LoginRole, nodeId: string): boolean {
  if (role === "HQ_OPS") return nodeId === NODES.HQ;
  return STATION_NODES.includes(nodeId);
}
