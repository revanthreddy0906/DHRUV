# Phase 1 — foundation

Branch `ui/polar-light`. All six items are done. `pnpm typecheck && pnpm test` passes after every
commit: 307 tests (engine 97, server 122, store 38, map 19, web 31, of which 13 are new format tests).

## What changed

| Item | Commit | Summary |
|---|---|---|
| 1.1 Tokens and fonts | `7b2d062` | Polar light palette in `styles/theme.css`. The utility names are unchanged, so every component follows. Radius is 4 / 6 / 8 px. There is one drawer shadow token. Hatching is used only for CRITICAL. Hard-coded colours outside the theme are gone. |
| 1.2 Type scale | `746e40f` | Five sizes (12 / 14 / 15 / 20 / 28); Tailwind's other sizes are unset and nothing is below 12 px. `uppercase` and letter-spacing are removed (except the DHRUV wordmark), and labels and prose are off mono. GREEN is now a plain word and icon. Freshness follows section 5. |
| 1.3 `format/` | `75f28d5` | `formatRatio` (truncated), `formatMargin`, `formatQty`, ages (`just now`, never `0 m`), dates and the sim clock, with tests. `live/format.ts` delegates to these. `ui-config.ts` holds the count plausibility limit (used in Phase 3). |
| 1.5 Demo dock | `02851e1` | `components/DemoDock.tsx` holds the role switcher, simulated link, "Clock (this device)" jumps (+1 / +6 / +30 h, Reset, and the scenario's absolute jumps) and the Director link. Shift+D toggles it. The handlers were moved, not changed. `device.jumpTo(iso)` is new and uses the same `jumpClock` path. |
| 1.4 Top bar, sidebar, user menu | `50af87d` | Single-row top bar: station context (HQ select, shared via `?station=`), PNR pill only when a PNR exists, one sync indicator, read-only sim time, user menu. The sidebar has no footer and has an Analysis group. |
| 1.6 Offline banner | `b677fc6` | One amber line: "Offline. Local operations active. 5 events pending, oldest 6 h 50 m." |

1.5 was committed before 1.4. That way no commit leaves the demo controls unreachable: the dock
existed before the top bar lost them.

## Verified

- Hex colours appear only in `styles/theme.css`. There are no `uppercase` classes and no sizes below 12 px.
- Demo path, scripted in one browser with Director, HQ, Maitri and Field Lead tabs:
  - Season 48 beats 1–11 all complete.
  - Aurora 2016 beats A0–A12 all complete.
  - End states match the runbook: INC-01 open in emergency mode, SK-2 conflict flagged on sync,
    DEC-01 approved, and Aurora DEC-AGROUND approved.
- The signed-out preview (`/command?moment=slip`) and `/director` still render.
- No Playwright or DOM test in the repo references a moved control, so no test selectors needed updating.

## Decisions and deviations

- **Ages.** Section 6 says "hours up to 48 h, then days + hours", but its own example `1 d 22 h` is
  46 h. The rule was followed: 46 h shows as `46 h`. Minutes are dropped from 24 h on, so the
  example `36 h` holds.
- **Sync time** is wall-clock (`synced 21:48`), as in the section 7.1 example. The sim time sits
  beside it and is labelled.
- **The Incident nav item** shows, in red, right after Command while an incident is open. It is not
  in the section 7.4 list, but `/incident` must stay reachable.
- **The PNR pill** is the earliest point of no return among the stations this viewer watches (HQ:
  all; station roles: their own). It is taken from `evaluate()` and falls back to a proposed
  decision's PNR.
- **The Sync drawer** no longer has a link switch in the signed-in app. It shows the link read-only,
  and switching is in the dock. The signed-out `/sync` design mock keeps its switch.
- **Absolute clock jumps** in the dock come from the scenario that matches this device's seed.
  Reset still goes to 24 Jan 08:00 (unchanged behaviour, also for Aurora).

## Deferred to later phases

- Command still has its old body: PNR strip, station cards, map and comms strip. It is rewritten in
  Phase 2.1, which also fixes the all-clear shown while a station is RED.
- The trace drawer still opens fuel. The per-dimension fix is Phase 2.3.
- Screens outside the chrome (Decision, Cargo, Audit, Director, Login, Field mock) have tokens and
  type applied but no structural changes. That is Phase 3 and 4 stretch.
- The design-fixture strings in `data/demo.ts` (signed-out previews) keep their own caps clock text.
