DHRUV is a consequence-aware operational decision-support system for polar logistics (SIH 2026, PS 26062). It is a polar operations room in daylight: serious, calm, precise, dense and human-controlled, built to stay legible on a projector. Every screen answers, in this order of visual weight: immediate operational risk → decision deadline (point of no return) → consequence → confidence and freshness → available options → details → audit metadata. If a component does not help the operator see what changed, what breaks, when to act, how far to trust it and what they can do, simplify it or remove it.

The UI renders the output of one deterministic `evaluate(state, now)` engine. Components never compute ratios, states, bands or deadlines; they receive them. Every colour, number and date must open to its trace in one click.

## Content fundamentals

- Name the product **DHRUV**, in capitals, set in `wordmark`. No logo exists; do not draw one.
- Every screen carries `SyntheticDataBanner`: "Synthetic demonstration data. Not operational NCPOR data." It is a transparency note, never an error.
- Voice: plain operational English, sentence case, third person, no exclamation marks, no emoji. Numbers first, then the reason: "Fuel: C-104 misses vessel cutoff".
- Use these phrases verbatim: "Fuel below required threshold." "Could be AMBER." "Verify before acting." "Point of no return." "Cargo excluded by vessel cutoff." "Decision required." "Local operations active." "4 events pending." "Last confirmed 9 h ago." "No active decisions. All monitored stations are within their thresholds."
- Never write: "Oops", "Something went wrong", "AI says", "AI recommends", "Smart recommendation", "Optimize now", "live position" (unless under 1 h old), "first", "only", "real-time".
- AI only explains a trace or drafts a brief. Label template output "Explanation generated from engine trace (template)." and model output "Explanation drafted by AI from the engine's trace. The engine is the source of truth." The engine's top option is "engine ranking", never an AI opinion.
- Errors say what happened, what is affected, whether local operations continue, and what to do: "Map tiles unavailable. Operational state remains available. Using schematic map."
- A control a role cannot use is disabled **with its reason printed**: "Only HQ Ops can approve decisions touching vessels."
- Unknown values render as `unknown`, never as zero. Positions older than FRESH are always "last known position · 9 h ago".
- Dates: `3 Feb`, `24 Jan 08:10`; clock: `24 JAN 2027 08:00`; ages: `36 h`, `3 d 6 h`, `6 h 50 m`; units after a space: `92.0 kL`, `27 km`. Costs carry "synthetic".

## Visual foundations

**Colour.** One light theme, "Polar light" (it replaces the Bible's dark palette by team decision). `bg` behind everything, `surface` for cards and panels, `surface-elevated` for table heads, banners and hover. `text-primary` on every ground; `text-secondary` for labels, metadata and ages; `text-muted` for quieter metadata such as device ids, tick labels and footnotes. Elevation is borders (`border`, `border-strong`) and contrast, not shadows; `drawer-shadow` exists only for right-hand drawers. Inputs use `border-control`.

**State.** `state-green` GREEN = sufficient; `state-amber` AMBER = attention, aging, uncertainty, verify; `state-red` RED = below threshold or blocked. A state is always word + icon + context (`StateBadge`): check-circle for GREEN, triangle for AMBER, octagon for RED. RED and AMBER dimension chips take their tint ground (`state-red-tint`, `state-amber-tint`); GREEN stays quiet so a RED is significant. `accent` is interaction only (actions, selection, links, focus, the "now" marker) and never a state. Thresholds are synthetic: GREEN ≥ 1.05, AMBER 0.95 to < 1.05, RED < 0.95. Station state = worst dimension, never an average.

**Freshness** uses one language everywhere a number appears (`FreshnessChip`): FRESH green dot; AGING amber dot; STALE amber 135° stripes with the value in italics (`.dh-stale`); CRITICAL red stripes with a VERIFY chip (`.dh-critical`). Freshness changes numbers, not just labels: it widens the asymmetric `ConfidenceBand`, can mark inbound cargo UNCERTAIN, forces `VerifyGate`, and grows the `UncertaintyCircle` (radius `min(age_h × 3 km/h, 30 km)`). The straddle flag ("GREEN, could be AMBER") belongs on the option in Decision Detail, not on the station card.

| Source | FRESH | AGING | STALE | CRITICAL |
|---|---|---|---|---|
| Person / vehicle position | < 1 h | < 6 h | < 24 h | ≥ 24 h |
| Fuel / critical stock count | < 24 h | < 72 h | < 7 d | ≥ 7 d |
| Cargo leg status | < 12 h | < 48 h | < 7 d | ≥ 7 d |
| Link contact | < 1 h | < 6 h | < 24 h | ≥ 24 h |
| Asset status | < 6 h | < 24 h | < 72 h | ≥ 72 h |

**Type.** Inter (`sans`) for interface text; JetBrains Mono (`mono`) for traces, numbers, ratios, timestamps, ids, coordinates and the clock. Both load from Google Fonts. Use `ratio-xl` for option ratios, `ratio` in dimension chips, `trace` for trace lines, `section-label` (uppercase, `text-secondary`) for section headers. Numbers are tabular.

**Spacing and shape.** 4 px scale (`space-1` … `space-6`). Cards pad `space-4`; station cards and large panels `space-5`. Radius `radius-sm` for tags and chips, `radius-md` for buttons and chips, `radius-lg` (12 px, the maximum) for cards and drawers.

**Layout.** Desktop is designed at 1440 × 900. Command Center zones are locked: full-width top strip (`PnrStrip`); left column 30 % (`DecisionQueue`, then `RiskList`); centre 45 % (`StationCard` Maitri and Bharati, or `IncidentPanel` in emergency mode); right 25 % (mini `SchematicMap`, `EventTimeline`); bottom comms and sync strip. Chrome on every screen: `TopBar`, `SyntheticDataBanner`, `Sidebar`, and `SimulationOverlay` whenever the what-if drawer shows hypothetical results. Offline adds `OfflineBanner` under the banner.

**Motion.** 150–250 ms transitions. The cascade reveals one step every 250 ms (`--cascade-step`) in propagation order (leg → cutoff → inbound excluded → ratio → station RED → F-27 AT_RISK) while `TraceDrawer` fills at the same pace. Sync drain removes items one by one in (priority, seq) order. `prefers-reduced-motion` shows the end state at once. No decorative animation.

**Accessibility.** WCAG AA: `text-primary` ≥ 14.7:1, `text-secondary` ≥ 5.9:1 and `text-muted` ≥ 4.7:1 on every ground and tint; `state-green`, `state-amber` and `state-red` all pass on every ground and tint (4.9:1 or better). Green and red are close in lightness, so the word and icon are mandatory. Focus ring: 2 px solid `focus-ring`, 2 px offset, 5.9:1 on surface. Every action is keyboard reachable; options and scenario pickers are radio groups; alerts, the clock, PNR and pending counts use `aria-live`. Meaning is never carried by colour alone.

## Iconography

Lucide (`lucide-react`), 12–20 px, stroke 2, inheriting `currentColor`, always paired with a word. State icons: `CircleCheck` GREEN, `TriangleAlert` AMBER, `OctagonAlert` RED. Freshness uses a 6 px dot, not an icon. Dimensions: `Fuel`, `Utensils`, `HeartPulse`, `Cog`, `Users`, `RadioTower`. Navigation: `Radar` Command, `Scale` Decisions, `Ship` Cargo, `Package` Inventory, `Users` Personnel and Missions, `Map`, `Siren` Incident, `ScrollText` Audit. Other: `Sigma` Show the math, `Hourglass` countdowns, `WifiOff`/`Signal`/`Wifi` link states, `CloudUpload` sync, `GitMerge` conflicts, `FlaskConical` simulation. No illustrations, emoji, gradients, glassmorphism or decorative charts.

## Roles and gating

HQ Ops (desktop, `HQ-WEB-01`, Goa HQ) edits ETAs and approves decisions touching shipments, vessels or cross-station allocation. Station Leader (tablet, `MAITRI-TAB-01`) records counts, issues, personnel and asset status and incidents, approves station-level decisions, escalates incidents. Field Lead (mobile PWA, `FT3-TAB-01`, team FT-3) checks in, raises incidents and sets go/no-go for their own team; never approves or edits shipments. Emergency is a mode, not a role. Nothing changes operational state without an explicit approval event.

## Using the components

Load `tokens.css`, `components/bundle.css`, React 18 and `components/bundle.js`; components are on `window.DHRUV`, and the frozen demo values are on `window.DHRUV.data`. In the app, import the same components from `src/components/*` and the tokens from `src/styles/theme.css` (Tailwind 4 `@theme inline` maps them to utilities such as `bg-surface`, `text-fg-2`, `border-bad/50`). Pass engine output in; never compute in a component. Every screen must cover the state checklist: empty, loading, error, offline, stale data, emergency active, conflict present, read-only role.
