# CLAUDE.md — DHRUV frontend redesign ("Warm polar")

This file governs the UI/UX redesign of `apps/web`. It sits on top of the repo's existing
rules (README "Contributing", the handoff doc's section 10). Where they conflict on anything
visual, this file wins. On anything about data, events, engine or API, the existing rules win.

Deadline: **28 Sep 2026**. Work in the phases in section 12, in order. Each phase must leave
the full demo path working before the next one starts.

---

## 1. What DHRUV is, and who looks at it

DHRUV is a decision-support layer for India's Antarctic stations (Maitri, Bharati) and Goa HQ.
When something changes (a ship slips, a link drops, a field team goes quiet) it shows what breaks,
by when someone must act (point of no return), and how far to trust the data.

Users:
- **HQ Ops** at Goa, desktop, all stations.
- **Station Leader** on a tablet, own station.
- **Field Lead** on a phone.

The audience this week is **SIH judges watching a projector**. They get about 3 minutes, so every
screen must be legible at a glance from the back of a room.

The problem we are fixing: the current UI gives everything equal weight. Tiny all-caps mono labels,
colour on every value, the same fact in five places, demo controls mixed into product chrome, and
analysis panels on overview screens. It reads as a prototype and overloads the viewer. The target
is a calm, professional operations product.

## 2. Hard constraints (never break)

1. **Do not modify** `packages/engine`, `packages/shared`, `packages/store`, `packages/seed`,
   `packages/map` logic, or `apps/server`. This is a presentation-layer change.
   If you believe a change there is unavoidable, stop and ask.
2. **Event, API and schema contracts are locked.** Every write still goes through
   `device.write()` / `useEventWriter()` with `WriteFeedback`. No new endpoints and no new
   event types.
3. **Components never compute readiness, ratios, bands, deadlines or states.** They format
   what `evaluate()` / `useLiveOps()` return.
   - The only allowed arithmetic is in `apps/web/src/format/` (see section 6).
   - It is pure, unit-tested and display-only.
4. **Golden numbers must not change.** `pnpm typecheck && pnpm test` must pass after every
   commit. The season48 and aurora2016 golden tests are the proof.
5. **No new runtime dependencies** without asking. We already have React 18, Tailwind 4,
   lucide-react, Leaflet and Zustand. No component kits (shadcn, MUI, Chakra), no animation
   libraries, no chart libraries.
6. **Allowed actions come from `EVENT_RULES`.** Never hand-write role lists. A control a role
   cannot use is disabled **with its reason printed**, not hidden, where the reason helps the
   demo.
7. **Keep every existing route working**, including `/director`, `/screens`, `/data`,
   `/graph` and the Aurora scenario.
8. **Playwright / e2e selectors.** Before moving or renaming controls, grep the tests for their
   selectors and update them in the same commit.
9. **Git: commit only, never push, never touch develop.**
   - Never run `git push` in any form (including `--force`, `--force-with-lease`, or pushing tags).
     Pushing is always done by the human. When work is ready, say so and stop.
   - Commit only on the current working branch (`frontend-redesign`; earlier work used `ui/polar-light`). Before every commit, run
     `git branch --show-current` and stop if it is `develop` or `main`.
   - Never check out, commit to, merge into, rebase, reset or rewrite `develop` or `main`.
     Reading them (`git log develop..HEAD`, `git diff develop`) is fine.
   - Do not create, delete or switch branches unless asked. A backup branch the human requested is
     the only exception.
   - Never change git config, remotes or hooks.

## 3. Design principles (apply in this order)

1. **Dark cockpit / ISA-101 colour discipline.** Normal is quiet. GREEN is plain text plus a
   small check icon: no tinted fill, no pill, no border. Only AMBER and RED get colour and tint.
   A healthy screen should be almost monochrome, so a RED is seen instantly.
2. **Four display levels (ISA-101 hierarchy).** Never mix levels on one screen.
   - **L1 Command:** is anything wrong, what must be decided by when.
   - **L2 Station:** the six dimensions of one station.
   - **L3 Item / shipment / person:** the detail rows.
   - **L4 Trace, Audit, Γ, B0, Connections, Where data lives:** diagnostics.
   Deeper levels open by click, drawer or disclosure.
3. **One fact, one place.** Link status, role, device, sim time and season window each have
   exactly one home (section 7). Delete duplicates.
4. **Say it in a sentence first, then the number.** Every state has a one-line reason in plain
   English: "Food below requirement: 3 of 8,280 person-days". Numbers are in real units before
   ratios.
5. **Show consequences before commit.** Forms preview what the engine will say after the event
   (section 9.4). This is DHRUV's thesis applied to data entry.
6. **The demo harness is visibly not the product.** All simulation controls live in one Demo
   dock (section 7.3).
7. **Management by exception.** Lists put problems first and collapse healthy items into a count
   ("15 of 17 assets OK").
8. **Don't show absence.** No "No point of no return active" or "no straddle" text.
   Show the thing when it exists; leave the space empty otherwise.
9. **Every number still opens its math in one click** (Show the math / row expand). Hiding
   detail is not deleting it.

## 4. Visual tokens ("Warm polar")

The palette was "Polar light" (cool greys, blue accent) until 29 Sep 2026. It is now "Warm polar",
adapted from the v0 mock in `docs/ui-redesign/reference/v0-warm-polar/`. The mock's own hues were
darkened until every text use passes WCAG AA (ratios below are on `surface` / `bg`). Put these in
`apps/web/src/styles/theme.css` only. `grep -rn "#[0-9a-fA-F]\{3,6\}" apps/web/src` must return
only the theme file.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `bg` | `#f3f1eb` | App background (warm ivory) | – |
| `chrome` | `#fbfaf7` | Top bar, sidebar, Demo dock | – |
| `surface` | `#ffffff` | Cards, panels, drawers | – |
| `surface-elevated` | `#e9e6de` | Table headers, hover, secondary buttons, synthetic notice | – |
| `border` | `#d8d5cc` | Hairlines, card outlines | – |
| `border-strong` | `#bdb8ac` | Secondary button outline, timeline connectors, gridlines | – |
| `border-control` | `#7a7468` | Inputs, selects, checkboxes | 4.6 / 4.1 |
| `text-primary` | `#222725` | Body, values, headings | 15.2 / 13.4 |
| `text-secondary` | `#58635d` | Labels, metadata, ages | 6.3 / 5.5 |
| `text-muted` | `#656c66` | Device ids, footnotes, tick labels | 5.4 / 4.8 |
| `state-green` | `#3d6b4b` | GREEN word and icon only (no fill on overview screens) | 6.2 / 5.5 |
| `state-amber` | `#8f5a12` | AMBER, aging, verify | 5.8 / 5.1 |
| `state-red` | `#b23a2c` | RED, blocked, below threshold | 5.9 / 5.3 |
| `state-green-tint` | `#e7efe8` | Only for an approval confirmation | – |
| `state-amber-tint` | `#f7ebd3` | Ground behind AMBER rows, verify gate, pending sync | amber on it 4.9 |
| `state-red-tint` | `#f8e3df` | Ground behind RED rows, PNR pill, incident strip | red on it 4.8 |
| `accent` | `#955e36` | Interaction only (copper): primary buttons, links, selection, focus, now-marker. Never a state | 5.3 / 4.7; white on it 5.3 |
| `accent-tint` | `#f3e6da` | Selected nav item, selected option | – |
| `on-accent` | `#ffffff` | Text on accent fill | – |

Copper (`accent`) and `state-red` are close in lightness and differ by hue. That is acceptable only
because a state is always a word plus an icon and copper is never a state. If a screen makes them
hard to tell apart, the fallback accent is pine `#315c4b` (7.6:1).

Focus ring: 2 px solid `accent`, 2 px offset, on every interactive element.

**Elevation.** Borders and contrast, not shadows. One shadow is allowed, on right-hand drawers
only: `0 8px 24px rgba(15,27,45,.12)`.

**Radius.**
- 4 px for chips and tags.
- 6 px for buttons and inputs.
- 8 px for cards and drawers.

This is deliberately smaller than typical SaaS. Hierarchy comes from spacing and type, not
rounding.

**Spacing.** 4 px base: 4, 8, 12, 16, 20, 24, 32.
- Cards pad 16.
- Page gutter 24.
- Table rows are at least 40 px tall.

**Typography.**
- **Inter** for all interface text, including labels, headings, buttons and table headers.
- **JetBrains Mono** only for numeric values, ids (C-104, INC-01), timestamps, the sim clock and
  trace formulas. Never for labels or prose.
- Numbers use `font-variant-numeric: tabular-nums`, right-aligned in tables.

Type scale (five sizes; do not add more):

| Role | Size / line | Weight |
|---|---|---|
| Screen title | 20 / 28 | 600 |
| Section heading | 15 / 22 | 600, sentence case, `text-primary` |
| Body | 14 / 20 | 400 |
| Small / meta | 12 / 16 | 400, `text-secondary` |
| Headline number (station page, decision options) | 28 / 34 mono | 600 |

Nothing on screen is smaller than 12 px. **No uppercase anywhere** except the DHRUV wordmark and
state words (GREEN / AMBER / RED, which are domain terms). Section headings are sentence case
("Needs attention", not "RISK AND FRESHNESS").

**Icons.** lucide-react, 16 px, stroke 1.75, `currentColor`. Use an icon only where it carries
meaning:
- state: `CircleCheck`, `TriangleAlert`, `OctagonAlert`;
- link: `Wifi`, `WifiOff`, `Signal`;
- navigation items;
- `Sigma` for Show the math.

No icon beside every heading or label.

**Motion.** 150–200 ms opacity and transform only, on user-triggered changes (drawer open, row
expand, confirmation). Keep the existing cascade reveal on the slip beat. No entrance animations
and no hover lift on cards. Respect `prefers-reduced-motion`.

## 5. Deviations from the team design-system README (intentional)

The team README (`docs/design/design-system-README.md`, if copied in) stays the reference for
copy, roles and freshness semantics. These parts are overridden:

- The Command Center 30/45/25 zone lock is removed. See section 8.
- Section labels are sentence case, not uppercase.
- **Freshness visuals:**
  - FRESH = no mark at all, just the age in `text-secondary` where age is shown.
  - AGING = amber dot + age.
  - STALE = amber dot + age + the word "stale", value in italics.
  - CRITICAL = red dot + age + "Verify" tag, and the **only** place the 135° hatch is allowed
    is behind a CRITICAL value.
- GREEN is never tinted on overview screens.
- Station cards with six dimension chips are replaced by station rows (L1) and a station page
  (L2).

## 6. Number and text formatting (display only)

Create `apps/web/src/format/` with unit tests (`*.test.ts`) and route all display formatting
through it.

**`formatRatio(r)`**
- Round to 3 decimals (half up). If the rounded value falls in a different band than the engine
  value (bands: < 0.95, 0.95 to < 1.05, >= 1.05), truncate to 3 decimals instead. The trace
  drawer shows full engine precision.
- 0.69697 → `0.697`, 1.0606 → `1.061`, 1.04996 → `1.049`, 0.94996 → `0.949`, 1.05 → `1.050`,
  1.0334 → `1.033`.

**`formatMargin(available, required, unit)`**
- The headline number for stock dimensions, from the engine's own available and required
  values: `+8.0 kL margin` or `−40.0 kL short`.
- Person-days and kits use their own units and decimals.
- If the engine output does not expose both values for a dimension, show the ratio as the
  headline for that dimension instead. Do not reconstruct inputs.

**Ages**
- `4 h`, `6 h 50 m`, `36 h`, `46 h`, `3 d 6 h` (hours up to 48 h, then days + hours; minutes
  are dropped from 24 h).
- `just now` for under 1 minute. Never show `0 m`.

**Dates and time**
- Dates: `3 Feb`, `24 Jan 08:00`.
- Sim clock: `24 Jan 2027, 08:00` (sentence case, not all-caps).

**Units** always follow a space: `92.0 kL`, `27 km`.

**Unknown** values render `unknown`, never `0` and never `—` alone.

**Separators.** Avoid long chains joined by `·`. At most one `·` per line. Otherwise use layout
(columns, a second line).

## 7. Chrome (every signed-in screen)

### 7.1 Top bar (single row, 56 px, `surface`, bottom border)

Left to right:

1. **`DHRUV` wordmark.**
2. **Station context.** HQ: a select "All stations / Maitri / Bharati". Station roles: a fixed
   station name, no control.
3. **Flexible space.**
4. **PNR pill, only when a point of no return exists.** `Point of no return 3 Feb · 10 days`,
   `state-red-tint` ground, red text, links to the decision. This is the one global alarm.
5. **Sync indicator (one button).** It opens the existing Sync drawer:
   - `Online · synced 20:35`
   - `Offline · 5 pending` (amber)
   - `Degraded · 2 pending` (amber)
   It shows this device's link, and replaces the link switch, "SYNC 0" and "synced …" text.
6. **Sim time,** read-only: `Sim time 24 Jan 2027, 08:00` (mono for the value).
7. **User menu** (initials button). It shows role, station, device id and Sign out.

Remove from the top bar: the role switcher, Online/Degraded/Offline switch, "SIMULATED LINK",
+1 h / +6 h / +30 h, Reset, and the "DEMO" tag. All of these move to the Demo dock.

### 7.2 Synthetic data notice

One slim line (28 px, `surface-elevated`, 12 px text, centred) under the top bar:
"Synthetic demonstration data. Not operational NCPOR data." Keep it on every screen. It is a
note, not a warning: no icon colour.

### 7.3 Demo dock (new component `DemoDock`)

- **Collapsed:** a small button fixed bottom-left, above the sidebar edge, labelled "Demo
  controls", dashed `border-strong` outline.
- **Expanded:** a panel with a dashed border and a "Demo harness — not part of the product" caption.
- **It contains:**
  - role / view switcher (if the current app has one);
  - simulated link for this device (Online / Degraded / Offline);
  - clock jumps (+1 h, +6 h, +30 h and the absolute jumps the Director uses);
  - Reset;
  - a link to `/director`.
- Keep all existing handlers. Only move them.
- Keyboard: `Shift+D` toggles the dock.
- Hide it for Field Lead mobile views unless expanded.

### 7.4 Sidebar

- 220 px, `surface`, right border.
- Nav order:
  1. Command
  2. Decisions
  3. Stations (new, section 9.1)
  4. Cargo
  5. Inventory
  6. Personnel
  7. Map
  8. Audit
- Then a divider and a quieter group, "Analysis": Connections, Where data lives (if present on
  the branch).
- Selected item: `accent-tint` ground, `accent` text, no left colour bar.
- Badge counts only for things that need action (pending decisions, open conflicts), as plain
  numbers.
- **Delete the sidebar footer** (role / station / device / link). It lives in the user menu and
  the sync indicator.
- Follow the repo's convention for new screens: `NavKey` + `NAV` entry (`components/shell.tsx`),
  `NAV_PATH` (`screens/Frame.tsx`), route (`app/App.tsx`) with the SignedOut note.

### 7.5 Offline banner

When this device is Offline, show one amber line under the synthetic notice:
"Offline. Local operations active. 5 events pending, oldest 6 h 50 m."
It is the only other full-width strip allowed.

## 8. Command Center (L1): rewrite

Purpose: in five seconds, answer *is anything wrong, what must be decided by when, and how are
the stations*.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Status line (sentence)                                               │
│ "Maitri is RED: fuel short 40.0 kL for winter. 1 decision due by     │
│  3 Feb." / "All stations within thresholds. Next vessel cutoff 4 Feb."│
├──────────────────────────────────────────────────────────────────────┤
│ Stations (table, one row per station)                                │
│ Station │ State │ Reason (sentence)            │ Deadline │ Link │ ›  │
├───────────────────────────────────────────┬──────────────────────────┤
│ Needs attention (ranked list)             │ Season                   │
│ decisions, incidents, RED, ... (see below)│ vessel window mini-      │
│ each: severity word, title, owner,        │ timeline: cutoff, depart,│
│ deadline, one-line cause, action button   │ ETA, closing, "now"      │
│                                           ├──────────────────────────┤
│                                           │ Recent events (5)        │
│                                           │ link to Audit            │
└───────────────────────────────────────────┴──────────────────────────┘
```

**Status line**
- One or two sentences, 16 px.
- Built from engine output via a formatter in `format/`, not free text scattered in components.

**Stations table**
- Columns: state (word + icon, coloured only if AMBER/RED), reason sentence, deadline (PNR or
  next lever deadline, else blank), link age, and a chevron that opens the Station page.
- RED rows get a `state-red-tint` ground.
- GREEN rows read e.g. "All six dimensions within thresholds · slip tolerance 22 d".

**Needs attention**
- Use the existing `exceptionsOf()` / `forViewer()` (on the `improvements` branch) as the source.
  Fold the old Decision queue into it.
- Order: pending decisions, then open incidents and safety conflicts, then RED states, then
  CRITICAL data (verify required), then AMBER states, then at-risk or missed milestones, then
  events the server refused, then STALE data. Ties go by earliest deadline.
- Each item has:
  - severity word;
  - title;
  - owner role;
  - deadline;
  - one-line cause;
  - one primary action ("Review decision", "Record count", "Open cargo").
- The numbered playbook steps expand on click. They are not shown by default.
- Show at most 6 items, then "Show all (n)".

**Empty state.** Show "No active decisions. All monitored stations are within their thresholds."
**only when that is actually true**. It must be derived from the same evaluation as the stations
table. (Current bug: it shows while Maitri is RED.)

**Removed from Command:**
- the six dimension tiles, band line, slip tolerance line, B0 line and mission chips (all move to
  the Station page);
- the world map (it lives on Map; do not duplicate);
- the season strip (it becomes the Season panel);
- the bottom comms strip.

**Incident open.** An incident strip appears above the stations table (`state-red-tint`) with the
incident title, last confirmed position age, and an "Open incident" button. Keep the existing
incident panel behaviour behind that button.

## 9. Screen specs

### 9.1 Station page (L2, new route `/stations/:nodeId`)

**Header**
- Station name (20 px).
- State word + icon.
- Reason sentence.
- Link age, POB, "Show the math" for the driving dimension.

**Dimensions table** (the core of the page), one row per dimension:

| Column | Content |
|---|---|
| Dimension | Fuel, Food, Medical, Spares and power, Personnel, Comms |
| State | word + icon; colour only if AMBER/RED |
| Headline | `formatMargin` (stock dims), or `2 of need 1`-style coverage (Personnel), or `VSAT + IRD` (Comms) |
| Ratio | `formatRatio`, `text-secondary` |
| Why | one line from the engine / trace summary |
| Data age | freshness per section 5 |
| (action) | `Show the math` link opens the trace drawer **on this dimension** |

- RED and AMBER rows get their tint.
- GREEN rows stay plain.

**Fuel outlook** (below the table, a small section)
- The slip tolerance sentence.
- Or reserve breach date + days short, labelled as arithmetic at current burn, not a prediction.

**Missions** (compact list)
- Mission id, name, dates, status.
- Only AT_RISK missions are coloured.

**Analysis** (collapsed disclosure, "Analysis and stress tests")
- The B0 baseline comparison line.
- The Γ fuel robustness panel, moved here from Inventory, unchanged in logic.
- A link to Connections filtered to this station.

HQ reaches this page from the stations table. Station Leaders reach their own station from the
sidebar "Stations" item, which goes straight to their station.

### 9.2 Trace drawer

- **Opens on the dimension the user clicked.** From a station-level "Show the math", it opens the
  dimension that drives the station's state. (Current bug: a RED-for-food station opened the fuel
  trace.)
- **Header:** "Maitri · Fuel", state word, "As seen by HQ-WEB-01 at 24 Jan 2027, 08:00".
- **Body:** three groups with sentence-case headings: *Inputs*, *Calculation*, *Result*.
  - Each step is one row: a rule tag (`R03`, small, `surface-elevated`, mono) plus one plain
    sentence with its result, e.g. "Availability vs requirement: 140.0 of 132.0 kL = 1.0606, GREEN".
  - The full formula line from the engine expands on click (mono, 12 px). Keep the engine's own
    trace text verbatim inside the expansion. Do not rewrite numbers.
- **Footer:** the B0 line, greyed, as v2 C8 specifies ("A stock-level alert would show nothing
  here: on-hand stock has not changed."), and "Explain this alert" if already wired.
- Propagation order and determinism stay as they are.

### 9.3 Decision detail

Apply the tokens and type. The content stays as the existing screen has it (v2 spec):
- option cards with ratio (28 px mono), state, slack days, straddle text ("GREEN, could be AMBER
  (count 36 h old)");
- verify gate;
- lever deadlines;
- Approve / Reject.

Changes:
- The recommended option gets an `accent` outline and the text "Engine ranking: 1". Never
  "recommended by AI".
- Approve names the option: "Approve option (a): hold vessel".
- Disabled with reason where the role can't approve.

### 9.4 Inventory

**Transaction form**
- Keep the fields and `useEventWriter`.
- Add the unit inside the quantity field as a suffix ("kL", "person-days", "kits").
- **Consequence preview.** When item, action and quantity are valid, show one line under the
  form before Submit: "Diesel 92.0 → 91.0 kL · fuel ratio 1.061 → 1.053 · stays GREEN" (or
  "turns AMBER" in amber).
  - Compute it by running the existing client-side engine with the draft as a hypothetical
    overlay event. Use whatever the what-if drawer / `/scenarios/run` path already uses locally.
    Find it; do not write engine code.
  - Debounce 200 ms.
- **Plausibility guard.** If a Count differs from the current derived stock by more than 50 %,
  or is 0 for an item with a requirement, replace Submit with an inline confirmation: "This count
  is 99.97 % lower than the recorded 8,900 person-days. Record 3 person-days anyway?" with
  Confirm / Edit.
  - UI-only threshold constant in `apps/web/src/format/` or a `ui-config.ts`. Not in
    `packages/shared/config.ts`.
- **After success**, the `WriteFeedback` line stays. Add a "Record correction" link that
  pre-fills a Count, because events are append-only.
- Button label: "Record issue", "Record receipt" or "Record count" to match the action. Not
  "Submit".

**Table**
- Columns: Item, On hand, Inbound (feasible), Required, Margin (`formatMargin`), State, Count age.
- Ratio moves into the row expansion with the requirement-by-phase trace.
- Only non-GREEN rows are tinted. No hatching except CRITICAL.
- **Remove the Γ panel from this page** (it moves to the Station page, Analysis).

### 9.5 Cargo

- Keep leg timelines and `MilestoneStrip`. The vessel load cutoff is the visual anchor: a single
  vertical line labelled "Vessel cutoff 4 Feb", `text-primary`, not orange.
- Shipments with an at-risk or missed milestone are expanded and listed first. The others
  collapse to one row: id, name, priority, slack, state.
- Slack as text: "2 d slack". "0 d slack" is amber.
- R17 UNCERTAIN inbound shows "ETA report 48 h old · verify".
- The HQ "New shipment" form sits behind a "New shipment" button (a drawer), not always open.

### 9.6 Personnel and missions

- Role coverage: one compact row of four, each "Doctor 2 / need 1", with the state word only if
  not GREEN.
- **People table** grouped by status, ON_STATION first but **uncoloured**.
  - Status text is plain for routine statuses (ON_STATION, FIELD).
  - Colour only for INJURED / UNAVAILABLE / overdue (red or amber per engine state).
  - "Last update" shows the event time if a status event exists, else "Seed roster". Never "0 m".
- The action form stays as is, restyled, with the button named for the action.
- Fill the page: missions and people side by side at ≥ 1280 px, stacked below that.

### 9.7 Map (phase 4, stretch)

- Default view centred on the Antarctic stations (Maitri, Bharati, the Cape Town leg), not a
  world view where Antarctica is a smear. If `@dhruv/map`'s schematic supports a polar layout, use
  it as the default.
  - Do not add proj4 or new tile sources without asking.
- The Goa → Mumbai → Cape Town → Maitri route also appears as a simple horizontal route diagram
  with cutoff and ETA markers.
- Assets list: only non-OK assets, then "15 of 17 assets OK" (expandable).

### 9.8 Audit, Connections, Where data lives, Director

- Apply tokens and type.
- Tables get sentence-case headers, 40 px rows and right-aligned numbers.
- Filters sit in one row with a "Clear filters" text button.
- No structural changes.

### 9.9 Login

- Light theme.
- Three role cards become a segmented radio group (Role).
- Station select and PIN are visible. Device ID sits under an "Advanced" disclosure, prefilled.
- Primary button: "Sign in".

## 10. Copy rules

- Plain operational English, sentence case, no exclamation marks, no emoji.
- **Verbatim phrases to keep:**
  - "Fuel below required threshold."
  - "Could be AMBER."
  - "Verify before acting."
  - "Point of no return."
  - "Cargo excluded by vessel cutoff."
  - "Decision required."
  - "Local operations active."
  - "Last confirmed 9 h ago."
- **Never write:** "Oops", "Something went wrong", "AI recommends", "Smart", "real-time",
  "live position" (unless under 1 h old), "first", "only", "digital twin".
- Errors say what happened, what is affected, whether local operations continue, and what to do.
- Buttons say what they do ("Record count", "Approve option (a)"). Never "Submit" or "OK".
- No `→` appended to button or link text.

## 11. Banned patterns (the "vibe-coded" tells)

Do not introduce any of these, and remove them where they exist:

- **Colour and surface:**
  - dark navy / near-black backgrounds with neon cyan or green;
  - gradients, glassmorphism, glows, backdrop blur;
  - coloured left-border "accent bars" on cards;
  - hover-lift or scale on cards.
- **Type:**
  - all-caps tracked labels;
  - monospace used for labels or prose.
- **Badges and chips:**
  - a pill badge on every row;
  - GREEN pills;
  - status chips that repeat the column header.
- **Layout:**
  - KPI tiles with trend arrows or sparklines;
  - identical-card grids for heterogeneous content;
  - heavy radius (> 8 px) and soft shadows on everything.
- **Icons and decoration:**
  - an icon in front of every heading;
  - sparkle / magic-wand AI affordances.
- **Motion and feedback:**
  - skeleton shimmer beyond a single loading state;
  - entrance animations;
  - toasts for things already shown inline.
- **Content:**
  - text that states an absence ("No X active") where an empty space would do;
  - long `A · B · C · D` metadata chains.

## 12. Phases (deadline 28 Sep)

Branch: `ui/polar-light`, from the branch the team confirms (see the prompt). One commit per
numbered item.

At the end of each phase:
1. Run `pnpm typecheck && pnpm test`.
2. Run the demo path: `pnpm seed`, then Director beats 1–11 (and the Aurora scenario if on
   `improvements`).
3. Take screenshots of the touched screens at 1440×900 (Playwright if available) and review
   them against sections 3, 4 and 11.
4. Write a short `docs/ui-redesign/PHASE-n.md` noting what changed and anything deferred.

**Phase 1 — foundation (must)**
1. Tokens and fonts in the theme; strip hard-coded colours.
2. Type scale and removal of uppercase / mono labels.
3. `format/` helpers with tests.
4. Top bar, synthetic notice, sidebar (footer removed), user menu.
5. `DemoDock`, with all demo controls moved into it and their selectors updated.
6. Offline banner restyle.

**Phase 2 — Command and Station (must)**
1. Command Center rewrite (section 8), including the empty-state bug fix.
2. Station page (section 9.1) with the Γ panel moved.
3. Trace drawer (section 9.2), including the correct-dimension fix.

**Priority (deadline 28 Sep).** Phases 1 and 2 are must-do. After them, only Phase 3.1's
Inventory consequence preview and plausibility guard come next, if time allows. Everything else
below is stretch.

**Phase 3 — forms and lists**
1. Inventory (section 9.4): consequence preview and plausibility guard (next if time allows).
   The rest of 9.4 (table, labels, correction link) is stretch.
2. Personnel (section 9.6). Stretch.
3. Decision detail restyle (section 9.3). Stretch.

**Phase 4 — stretch (only if everything above is green)**
1. Cargo.
2. Map.
3. Login.
4. Audit / Connections / Data / Director polish.

If time runs short, cut stretch items from the bottom up. Never ship a half-finished phase:
revert to the last green commit instead.

**Decisions recorded (27 Sep)**
- What-if: a "What if…" button in the Station page header opens the existing what-if drawer
  unchanged. Keep any existing Decision-detail entry point. Not in the Season panel.
- Demo dock clock jumps apply to this device only; the group is labelled "Clock (this device)".
  The Director remains the way to move all tabs.
- Screenshots use `playwright-core` from a scratch directory, never added to the repo.
- `docs/ui-redesign/` is committed: design README, tokens, `PHASE-n.md`, and a copy of this file
  at `docs/ui-redesign/CLAUDE.md`, kept identical to the root file. Screenshots are gitignored
  (`docs/ui-redesign/**/*.png|jpg|jpeg|webp`) and kept on disk only.

## 13. Every screen must handle

Empty, loading (one quiet line, not shimmer), error, offline, stale data, emergency active,
conflict present, and read-only role. Check each on the screens you touch.

## 14. Accessibility

- WCAG AA contrast (the tokens already pass; do not invent new greys).
- State is always word + icon, never colour alone.
- All actions are keyboard reachable.
- Option pickers are radio groups.
- The PNR pill, sync indicator and form feedback use `aria-live="polite"`.