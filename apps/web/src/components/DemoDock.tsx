import * as React from "react";
import { Link } from "react-router-dom";
import { Clapperboard, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { LinkStatus, Role } from "../data/types";
import { ROLE_LABEL } from "../data/demo";
import { LinkSwitch } from "./shell";

/**
 * The demo harness (section 7.3): every simulation control in one place, visibly not the product.
 * Only moved here; each control keeps the handler it had in the top bar. Shift+D toggles it.
 */
export function DemoDock({ role, link, onRoleChange, onLinkChange, onJump, onJumpTo, onReset, clockJumps = [], director }: {
  role: Role;
  link: LinkStatus;
  onRoleChange?: (r: Role) => void;
  onLinkChange?: (l: LinkStatus) => void;
  /** Clock controls act on this device only; absent when the tab is not signed in. */
  onJump?: (hours: number) => void;
  onJumpTo?: (iso: string) => void;
  onReset?: () => void;
  clockJumps?: { label: string; iso: string }[];
  /** Whether this tab can run the Scenario Director (HQ Ops). */
  director?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "d") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) {
    // Field Leads work on a phone: the collapsed button stays out of their way (Shift+D still opens it).
    if (role === "FIELD_LEAD") return null;
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} aria-keyshortcuts="Shift+D"
        className="fixed bottom-3 left-3 z-50 flex h-8 items-center gap-1.5 rounded-md border border-dashed border-line-strong bg-surface px-2.5 text-xs text-fg-2 hover:text-fg">
        <SlidersHorizontal size={14} aria-hidden />Demo controls
      </button>
    );
  }

  const btn = "h-8 rounded-md border border-line-strong bg-elevated px-2.5 text-xs text-fg hover:border-accent/60";
  return (
    <section role="dialog" aria-label="Demo controls" aria-keyshortcuts="Shift+D"
      className="fixed bottom-3 left-3 z-50 w-[320px] space-y-4 rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-heading font-semibold text-fg">Demo controls</h2>
          <p className="text-xs text-fg-2">Demo harness — not part of the product. Shift+D toggles.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close demo controls" className="rounded-md p-1 text-fg-2 hover:bg-elevated hover:text-fg"><X size={16} /></button>
      </header>

      <label className="block">
        <span className="text-xs text-fg-2">View as role</span>
        <select value={role} onChange={(e) => onRoleChange?.(e.target.value as Role)} aria-label="Role (demo)"
          className="mt-1 block h-8 w-full rounded-md border border-line-ctrl bg-surface px-2 text-sm text-fg">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <span className="mt-1 block text-xs text-fg-2">Switching role signs this tab in as another device.</span>
      </label>

      <div>
        <span className="text-xs text-fg-2">Simulated link (this device)</span>
        <div className="mt-1"><LinkSwitch value={link} onChange={onLinkChange} caption={false} /></div>
      </div>

      {onJump && (
        <div role="group" aria-label="Clock (this device)">
          <span className="text-xs text-fg-2">Clock (this device)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([1, 6, 30] as const).map((h) => <button key={h} type="button" onClick={() => onJump(h)} className={btn}>+{h} h</button>)}
            <button type="button" onClick={onReset} aria-label="Reset demo clock to 24 Jan 08:00" className={`${btn} inline-flex items-center gap-1`}>
              <RotateCcw size={12} aria-hidden />Reset
            </button>
          </div>
          {onJumpTo && clockJumps.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {clockJumps.map((c) => <button key={c.iso} type="button" onClick={() => onJumpTo(c.iso)} className={btn}>{c.label}</button>)}
            </div>
          )}
          <p className="mt-1 text-xs text-fg-2">The Director moves every tab at once.</p>
        </div>
      )}

      {director ? (
        <Link to="/director" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          <Clapperboard size={16} aria-hidden />Open the Scenario Director
        </Link>
      ) : (
        <p className="text-xs text-fg-2">The Scenario Director runs in an HQ Ops tab at /director.</p>
      )}
    </section>
  );
}
