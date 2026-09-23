import { NODES, STATION_NODES } from "@dhruv/seed";
import type { LoginRole } from "@dhruv/shared";

const DEV_SECRET = "dhruv-demo-secret-change-me";
const demoMode = (process.env.DEMO_MODE ?? "true") === "true";

// Outside demo mode a guessable signing key would let anyone mint tokens.
if (!demoMode && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set when DEMO_MODE is not true");
}

/** Section 16 environment keys: PORT, JWT_SECRET, ANTHROPIC_API_KEY (optional), DEMO_MODE. */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? DEV_SECRET,
  demoMode,
  dbFile: process.env.DHRUV_DB_FILE ?? "dhruv.db",
  /** Comma-separated browser origins allowed to call the API (the Vite dev server by default). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((o) => o.trim()).filter(Boolean),
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
