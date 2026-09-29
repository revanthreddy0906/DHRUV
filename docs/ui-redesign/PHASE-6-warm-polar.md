# Phase 6: warm polar redesign

Branch `frontend-redesign`, from develop `2f2155a`. Source: the v0 mock supplied on 29 Sep 2026,
kept in `docs/ui-redesign/reference/v0-warm-polar/`. Web-only: no changes to `packages/*` or
`apps/server`, no new events, endpoints or dependencies. Golden tests unchanged.

## Decisions

- **Port the look, not the stack.** The mock is a one-page Next.js 16 / shadcn app with fixture data.
  We kept our Vite app, routes, hooks and tests and took its visual language.
- **Adapt it to our rules** (CLAUDE.md sections 3, 4 and 11):
  - the warm ivory and copper palette, darkened until every text use passes WCAG AA;
  - 12 px minimum, sentence case, 8 px radius;
  - no shadows except drawers, no hover lift, no looping animation.
- **Keep every screen and nav item**, and take the mock's Command composition.

## What changed

### Tokens (`styles/theme.css`)
- New values for every colour token, plus a `chrome` token for the frame. The table with contrast
  ratios is in CLAUDE.md section 4.
- **Accent:** copper `#955e36`. It is close to `state-red` in lightness, so the two differ by hue
  only. That is acceptable because a state is always a word plus an icon. The fallback is pine
  `#315c4b`.
- `.dh-grid`: the schematic's 32 px grid.

### Chrome (`components/shell.tsx`, `DemoDock.tsx`, `screens/Frame.tsx`)
- **Top bar:** 64 px on `chrome`.
  - The brand block (copper "D" monogram, DHRUV, "Polar operations") sits over the sidebar.
  - The season phase is shown from 1360 px wide.
  - Sim time has a clock icon.
- **Sidebar:** 232 px on `chrome`, in two groups, "Operations" and "Analysis". Where data lives
  joins Analysis.
- **Demo dock:** on `chrome`, still dashed and labelled as not the product.

### Primitives (`components/primitives.tsx`)
- **`Card` header bar:** `heading`, `meta`, `action` and `bodyClassName` props.
- **`PageHeader`:** title, one sentence and actions at the right.
- **`FIELD`:** one input and select style, used by every form.
- **`STATE_META`:** gains `stroke` for SVG.

### Command Center (`screens/CommandCenter.tsx`, `components/command.tsx`, `live/command.ts`, `live/network.ts`, `components/network.tsx`)
The mock's composition on live data, from top to bottom:

1. **Page header** with three plain counts: stations needing attention, open incidents, decisions due.
2. **The status sentence** (still the headline).
3. **A band of three columns** from 1400 px wide; below that, two columns with the last two cards
   side by side:
   - **Needs attention.**
   - **Network position:** HQ, the ports, the stations and FT-3 on a quiet grid.
     - Supply legs are coloured only when delayed.
     - Stations show their state word and driving ratio.
     - The team shows its check-in status.
     - Each station opens its Station page.
     - It is static: nothing pulses or loops.
   - **Recent events and the Season card.** The card shows the vessel ETA large, how old that report
     is (the engine's R12 class for a cargo ETA), the window timeline and the phase line.
4. **Station readiness table:** a station code box, the link age under the name, and the critical
   resource with its amount and ratio. Below 1400 px, "Show the math" becomes its Σ icon (the
   accessible name is kept).
5. **Decision callout:** "Decision required." with the title, the consequence chain and the deadline.
   It is built from the Decision screen's own view (`buildDecisionScreen`), so both say the same thing.

The signed-out preview builds its network from the season48 Director script replayed to beat 2.

### Other screens
- **Station page:** a station code box, the driving headline in its state colour, and titled cards.
- **Inventory, Personnel, Cargo, Map, Audit, Where data lives:** `PageHeader` with the actions at
  the right, and forms and tables in titled cards.
- **Cargo:**
  - the Edit ETA preview sits on its own tinted line;
  - loading is a quiet line instead of a spinner.
- **Personnel:**
  - routine statuses are plain words; only injured, unavailable or evacuated take colour;
  - mission status is a word ("On plan", "At risk", "Blocked"), not an `AT_RISK` chip.
- **Incident panel:** headings without `·` chains.
- **Audit:** filters in the field style.
- **Login and Field Lead header:** they carry the monogram.
- **Director:** bold weights normalised.
- **Decision detail** (redesigned in PR #16) only takes the tokens.

### Removed
- `components/events.tsx`, which nothing imported.
- `components/readiness.tsx`: `BaselineB0Badge` moved to `components/station.tsx`; the rest was unused.
- `components/director.tsx` stays, because the signed-out Director preview uses it.

## Not taken from the mock
- Uppercase letter-spaced 9–11 px labels, 14 px radius cards with shadows and hover lift, coloured
  left bars, and an icon before every card title.
- The pulsing station rings, animated dashed lines, dark schematic panel and header blur.
- The fixed bottom status bar (the sync button and sim time already say this), the "device healthy"
  sidebar footer, and the Configuration page.
- Next.js, shadcn, `@vercel/analytics` and `tw-animate-css`.

## Verification
- `pnpm typecheck && pnpm test` after every commit: web 152 (3 new, for `networkView`), server 127,
  engine 97, store 38, map 19.
- **Browser runs** (Playwright from a scratch directory, three tabs), all with zero page errors:

  | Run | Result |
  |---|---|
  | season48 beats 1–11 | Completed |
  | aurora2016 A0–A12 | 1.0606, 1.0024 and 1.2297, as documented |
  | marion2026 M0–M16 | 0.7111 after conserving, 13.3333 after evacuation, 7.8 kL on reconnect, 25.4505 after P-210, as in the replay test |

- **Screenshots:**
  - every signed-in screen at 1440×900;
  - Command, Station, Decision and Cargo at 1280×720;
  - Field Lead at 390×844;
  - Login and the signed-out previews.
- **The browser scripts needed updating for PR #16:**
  - the form buttons are named for the action;
  - options are native radios;
  - approval goes through the confirmation dialog.
- **Behaviour confirmed:** the Decision screen preselects the first option the viewer may approve,
  so a Station Leader lands on Conserve in DEC-MARION.
