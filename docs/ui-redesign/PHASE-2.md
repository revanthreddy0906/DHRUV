# Phase 2 — Command and Station

Branch `ui/polar-light`. All three items are done. `pnpm typecheck && pnpm test` passes after every
commit: 311 tests (engine 97, server 122, store 38, map 19, web 41). The web count grew from 31 to
41 with the status, trace, timeline and attention-order tests.

## What changed

| Item | Commit | Summary |
|---|---|---|
| 2.2 Station page | `b21bb35` | New `/stations/:nodeId` (and `/stations`) route, Stations nav item and signed-out note. The page has: header (state, reason sentence, POB, link age, driving headline, Show the math, What if…), six-dimension table, fuel outlook, missions, and an "Analysis and stress tests" disclosure (B0, Γ panel moved from Inventory, Connections link). `format/status.ts` phrases `evaluate()` output. |
| 2.1 Command rewrite | `b0808fb`, then `419b0ac` | Status line, incident strip, stations table, Needs attention (decision queue folded in: decisions first, at most six, steps on click), Season panel with a vessel-window timeline, and recent events. The tiles, PNR strip, map and comms strip are removed from Command. **Empty-state bug fixed.** |
| 2.3 Trace drawer | `29db4a3` | Opens on the dimension clicked; the header button opens the driving dimension. Steps are grouped Inputs / Calculation / Result with the engine line verbatim on expand, and the footer holds the B0 line and "Explain this alert". **Wrong-dimension bug fixed.** |

2.2 was committed before 2.1, because Command's what-if button had to have a new home (the Station
page header) before Command lost it.

## The two bugs

- **All-clear shown while RED.** The sentence was the decision queue's empty state, shown whenever
  no `DECISION_PROPOSED` existed. It now needs `isAllClear()` to hold on the same evaluation as the
  stations table (no pending decision, every station GREEN) and Needs attention to be empty. The
  regression test is in `format/status.test.ts`: food count 3 with no decision is not all-clear.
- **Food RED opened fuel.** Every Show the math used `traceSteps`, which is the focus station's fuel
  trace. The Station page now passes the clicked dimension's own steps. `traceSteps` is unchanged
  for the Decision page and the golden tests.

## Verified

- Season 48 beats 1–11 and Aurora A0–A12, scripted across four tabs: all complete.
- End states:
  - Season 48: the INC-01 strip reads "Last confirmed 9 h 20 m ago", the SK-2 conflict and the
    cargo items are under Needs attention, and the held cutoff reads 7 Feb.
  - Aurora: its critically old counts show.
- Section 13 states checked on Command and the Station page:
  - offline banner;
  - emergency (incident strip);
  - conflict present;
  - stale and critical data (Verify tag, italics, hatch only behind CRITICAL);
  - read-only station role: fixed station, redirected to its own station page.
- The signed-out preview (`/command?moment=…`, `?trace=1`, `?whatif=1`, `/what-if`) renders the new
  layout from the fixtures.
- Screenshots are in `docs/ui-redesign/after-phase2/` (ignored by git).

## Decisions and deviations

- **Ratio truncation shows Maitri fuel as 0.696, not 0.697.** The engine's ratio is 92 / 132 =
  0.69697…, and section 6 says to truncate toward zero. The section 6 example "0.6970 → 0.697"
  starts from the 4-decimal rounded value, and the what-if drawer (unchanged, its own rounding)
  still shows 0.697. **Needs a decision**; see below.
- **Status line** is 15 px medium (`text-heading`), not 16 px, to keep to the five-size type scale.
  An open incident is named first ("INC-01: FT-3 overdue is open.").
- **Needs attention order** follows section 8 literally: decisions, RED, AMBER, then stale. A
  CRITICAL (red) stale count therefore ranks after AMBER cargo items.
- **Lever deadlines** ("Act by 31 Jan") show in the stations table only when fuel drives the
  station, because the catalogued levers are fuel levers.
- **Trace grouping** reorders across groups (Inputs, Calculation, Result) but keeps the engine's
  propagation order inside each group. The sentence for a step is cut from the engine's text; the
  numbers are the engine's characters.
- **Station roles** opening another station's page are sent to their own station, matching the
  token-scoped views elsewhere.
- **"Explain this alert"** shows the template explanation (dimension reason and PNR). It appears
  only when the dimension is not GREEN.

## Open

- Section 2 item 9: the rule text was not included in the request (it read "[paste the block
  above]"), so it has not been added.
