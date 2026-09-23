import type { LoginRequest, LoginResponse } from "@dhruv/shared";
import type { DeviceIdentity } from "@dhruv/store";

/**
 * One browser tab is one device (section 9): the login lives in sessionStorage, which is per tab,
 * so an HQ tab and a Maitri tab in the same browser stay separate devices with separate stores.
 */
export interface Session {
  token: string;
  identity: DeviceIdentity;
}

const KEY = "dhruv.session";

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session lasts until reload.
  }
}

/** POST /auth/login. Throws with the server's message (wrong PIN, role not allowed at node). */
export async function login(request: LoginRequest): Promise<Session> {
  const res = await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const body = (await res.json().catch(() => null)) as (LoginResponse & { error?: { message: string } }) | null;
  if (!res.ok || !body?.token) throw new Error(body?.error?.message ?? `Server unavailable (HTTP ${res.status})`);
  return { token: body.token, identity: { device_id: request.device_id, role: body.role, node_id: body.node_id } };
}
