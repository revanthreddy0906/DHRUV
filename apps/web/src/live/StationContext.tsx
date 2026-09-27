import { MapPin } from "lucide-react";
import { STATION_NODES } from "@dhruv/seed";
import { Tag } from "../components/primitives";
import { nodeLabel } from "./chrome";

const ROLE_LABEL: Record<string, string> = { HQ_OPS: "HQ Ops", STATION_LEADER: "Station Leader", FIELD_LEAD: "Field Lead" };

/**
 * The station a screen is scoped to. Station users are fixed to the node in their token (a badge,
 * never a picker); HQ Ops may look at either station. This is presentation only: the server checks
 * node and ownership on every event whatever the screen shows.
 */
export function StationContext({ role, node, onChange }: { role: string; node: string; onChange?: (node: string) => void }) {
  const hq = role === "HQ_OPS";
  return (
    <div className="flex items-center gap-2">
      <Tag tone="accent">{ROLE_LABEL[role] ?? role}</Tag>
      {hq && onChange ? (
        <label className="flex items-center gap-1.5 text-xs text-fg-2">
          <MapPin size={13} aria-hidden />Station
          <select aria-label="Station" value={node} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg">
            {STATION_NODES.map((n) => <option key={n} value={n}>{nodeLabel(n)}</option>)}
          </select>
        </label>
      ) : (
        <span className="flex items-center gap-1 rounded-md border border-line-strong bg-elevated px-2 py-1 text-xs text-fg" title="Fixed by your sign-in">
          <MapPin size={12} aria-hidden />{nodeLabel(node)}
        </span>
      )}
    </div>
  );
}
