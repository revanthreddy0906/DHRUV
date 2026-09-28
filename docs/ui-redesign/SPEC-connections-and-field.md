# Spec: Connections and Field Lead redesign

This spec extends CLAUDE.md. All CLAUDE.md rules apply, in particular:
- §2 (no engine, server or contract changes; tests stay green);
- §3 (colour only for abnormal);
- §4 (tokens and type);
- §6 (formatting);
- §11 (banned patterns).

---

## A. Connections (`/graph`, `GraphLive.tsx`)

### A.1 What is wrong now

- **Everything is drawn at once.** 43 records and 55 links are all on screen, so the dashed lines
  form spaghetti and no path stands out.
- **Low-value records dominate.** The "Items · people · assets" column is mostly 12 personnel
  roles and 6 asset types that are all fine. It stretches the page to 3× the height of the part
  that matters.
- **Cards are too narrow for their text.** Names truncate ("C-104 Diesel 48.0 kL (ISO ta…",
  "F-27 Ice-core traverse suppo…"), the vessel line overflows its card, and card details are in
  mono.
- **A permanent "How to read it" panel** takes a quarter of the width. If a view needs a manual
  beside it, the view is the problem.
- **No starting point.** Nothing is selected by default, so a first-time viewer (a judge) sees
  noise and has to click something before it means anything.

### A.2 What it becomes: a focused impact explorer

The question this screen answers is **"what does this depend on, and what would a problem here
reach?"** It does not answer "show me every relationship". Keep the left-to-right supply-chain
columns, because they are a good mental model. Render **only the selected record's paths**, and
collapse everything else into counts.

```
┌ Connections · Maitri ─────────────────────── [Find a record ▾]  [Station ▾] ┐
│ Focus: L2-C104 Mumbai → Cape Town   RED  "Leg ETA 7 Feb misses 4 Feb cutoff" │
├──────────────────────────────────────────────────────────┬──────────────────┤
│ Vessel      Legs & levers  Shipments   Items      Dimensions  Station         │ Selected record │
│ ┌────────┐  ┌──────────┐  ┌────────┐  ┌──────┐   ┌──────┐    ┌──────┐        │ what it is      │
│ │MV Ice  │──│L2-C104   │──│C-104   │──│Diesel│───│Fuel  │────│Maitri│        │ state + reason  │
│ │Star    │  │(focus)   │  │        │  │      │   │      │    │      │        │ depends on (n)  │
│ └────────┘  └──────────┘  └────────┘  └──────┘   └──┬───┘    └──────┘        │ reaches (n)     │
│             ┌──────────┐                            └──── F-27 mission       │ why each link   │
│             │Hold vessel│ (remedy, dashed)                                   │ [Open in Cargo] │
│             └──────────┘                                                     │                 │
│  + 4 more    + 6 more      + 1 more    + 17 more  + 4 more                   │                 │
└──────────────────────────────────────────────────────────┴──────────────────┘
```

**Focus**
- **Default focus:**
  1. the record that drives the station's worst state (after the slip, `L2-C104`);
  2. if the station is GREEN, the station's Fuel dimension.
- The URL carries the focus (`/graph?focus=L2-C104`), so the Command "Needs attention" items and
  the Station page can link straight to a focused view.
- Clicking any visible card refocuses on it.
- A **"Find a record"** combobox (keyboard searchable) lists all 43 records grouped by column.
  It replaces the "Try Diesel" buttons.

**What is visible**
- The focused record.
- Its **upstream** records (what it depends on).
- Its **downstream** impact records (what trouble would reach), using `impactOf()`.
- The **remedies** attached to anything on that path (levers, decisions), drawn dashed.
- Upstream traversal is a plain reverse walk over the graph edges returned by `knowledgeGraph()`.
  Put it in `apps/web/src/format/graphFocus.ts` (or similar) with unit tests. It is graph
  navigation, not readiness computation. Do not change `packages/engine`.
- **Everything else collapses** to one quiet row at the bottom of each column: "+ 17 more" (or,
  for people, "12 roles, all covered"; for assets, "16 assets OK"). Clicking it expands that
  column's hidden records.
- Aim for **at most about 12 cards on screen** in focus mode.
- A small **"Show all records"** toggle top-right brings back the full graph for anyone who
  wants it. Off by default.

**Cards**
- At least 200 px wide.
- Name in Inter 14/600, wrapping to two lines, never truncated.
- One detail line in Inter 12 `text-secondary`; mono only for the number inside it (e.g. "Ratio
  0.697", "ETA 7 Feb").
- State follows CLAUDE.md §3:
  - AMBER/RED cards get their tint ground and a state word;
  - GREEN cards are plain (no outline colour, no word).
- The focused card has a 2 px `accent` outline.

**Lines**
- Impact edges on the path: solid, 1.5 px, `border-strong`. When the path carries trouble (a RED
  or AMBER record on it), `state-red` or `state-amber`.
- Remedy and context edges: dashed, `border`.
- No other edges drawn in focus mode.
- Route lines with right-angle or smooth horizontal curves between column centres. They must not
  cross cards.

**Right panel: "Selected record"** (replaces "How to read it")
- Title, type, and the state word + reason sentence.
- **Depends on (n):** a list; each item has its link `why` text in one line.
- **A problem here reaches (n):** the downstream list, in order.
- **Remedies:** the levers or decisions touching this path, with their deadlines.
- One action button to the screen where the record is managed: "Open in Cargo", "Open
  inventory", "Open decision".
- Source note in `text-muted`: "From season data / engine rule R02 / event log".
- The three-colour legend becomes a single line under the page title: "Solid lines carry trouble
  forward. Dashed lines are remedies." No separate help panel.

**Empty or healthy state**
- If nothing on the focused path is abnormal, the focus line says so in plain text: "Nothing on
  this path is below threshold." Do not show "all GREEN" badges.

**Demo checks** (screenshot each)
1. Season start: focus on Maitri Fuel; a calm, mostly monochrome chain.
2. After the C-104 slip: focus on L2-C104, a red path to Maitri and F-27, and Hold vessel shown
   as a dashed remedy.
3. Clicking Diesel refocuses; "Find a record" works by keyboard.
4. Aurora scenario: the graph still builds and a focus is chosen.

---

## B. Field Lead (mobile, `FT3-TAB-01`)

### B.1 What is wrong now

- **Header.** It still uses the old style (all-caps mono) and wraps badly: "FT3-TAB-01 · Field
  Lead · FT-3" breaks around an icon, and "via Maitri · SYNC 0 simulated link" spills over four
  lines. The device id and "simulated link" are not things a field lead needs.
- **The most important field question isn't answered first:** *am I on schedule, and has my
  last check-in reached the station?* The check-in time appears twice ("last 25 Jan 07:00" on the
  button and "confirmed 25 Jan 07:00" in Position), and the due and overdue times are in small
  print at the bottom of a card.
- **Go / no-go** shows two identical white buttons with no current state. You cannot tell what is
  set.
- **"0 min"** instead of "just now" (CLAUDE.md §6).
- **A permanent role-explanation paragraph** at the bottom.
- **On a desktop projector** the phone sits in the top-left corner of a large empty canvas.

### B.2 Design constraints specific to the field

- Used outdoors in Antarctica: gloves, cold, glare, one hand.
  - Touch targets at least **56 px** tall.
  - Primary text at least 16 px.
  - High contrast. The light theme suits glare.
- Offline most of the time. Pending sends are first-class information, not a counter in a
  corner.
- Destructive or safety actions (NO-GO, Raise incident) need a confirmation step. Routine ones
  (Check in) do not.

### B.3 Layout, top to bottom

```
┌──────────────────────────────┐
│ FT-3 · Maitri   08:00 25 Jan │  header: team, station, sim time
│ ● Offline · 2 waiting to send│  link line (only this; amber when offline)
├──────────────────────────────┤
│ Synthetic demonstration data │  slim notice
├──────────────────────────────┤
│ On schedule                  │  check-in status card (the hero)
│ Checked in just now          │   state: On schedule / Due soon / Overdue
│ Next due 11:00 · overdue 14:00│
│ ┌──────────────────────────┐ │
│ │       Check in now       │ │  primary button, 56 px, accent
│ └──────────────────────────┘ │
│ Waiting to send: check-in 07:00│ (only when not yet synced)
├──────────────────────────────┤
│ Team status   [ GO | NO-GO ] │  segmented control showing current
│ Set GO at 06:40 by FT-3      │  value; changing to NO-GO confirms
├──────────────────────────────┤
│ Mission F-27 support         │
│ 3–10 Feb · with SK-4         │
│ Dr A. Verma, R. Nair         │
├──────────────────────────────┤
│ Last confirmed position      │
│ −70.62, 12.10 · just now     │
├──────────────────────────────┤
│                              │
│ [ Raise incident ]           │  red outline, separated, confirm sheet
└──────────────────────────────┘
```

**Header**
- One line: team and station on the left, sim time on the right. Inter, with mono only for the
  time.
- The second line is the link state (the one place for it):
  - "Online · synced 07:02";
  - "Via Maitri · synced …";
  - "Offline · 2 waiting to send" (amber).
- The device id, role name and the word "simulated" move into a user menu (initials button),
  as on desktop.

**Check-in status card** (the hero)
- The state is derived from the existing check-in data and the configured interval and grace
  period (already shown today as "Next check-in due 11:00 · overdue at 14:00 (3 h grace)"):
  - **On schedule:** plain text.
  - **Due soon** (within 30 min of due, a UI-only constant): amber.
  - **Overdue:** red tint.
- Lines: "Checked in {age}", then "Next due 11:00 · overdue from 14:00".
- The button reads "Check in now", accent fill, full width, 56 px. It no longer repeats the last
  time.
- **After tapping**, inline feedback in the card:
  - "Check-in saved on this device. Waiting to send." when offline;
  - "Check-in sent." once accepted.
  Use the existing write-status feedback, never assumed.
- **Waiting to send** lists the pending check-ins (time only) while the outbox holds them.

**Team status (go / no-go)**
- A two-option segmented control that **shows the current value**, with "Set GO at 06:40" under
  it. If nothing is set yet, it says "Not set".
- Switching to NO-GO opens a confirm sheet: "Set FT-3 to NO-GO? The station and HQ will see this
  when the link allows." Confirm / Cancel.
- Switching to GO needs no confirmation.
- Use the existing event and allowed actions from `EVENT_RULES`.

**Mission**
- Id and name, dates, vehicle, people.
- The state word only if the mission is AT_RISK.

**Position**
- "Last confirmed position", coordinates in mono, and the age per §6 ("just now", "9 h").
- Remove the duplicated confirmed time.

**Raise incident**
- At the bottom, separated by 24 px.
- Red **outline** button (no tint fill in the normal state), 56 px.
- Tapping it opens a sheet:
  1. incident type (from the existing incident types);
  2. an optional note;
  3. "Raise incident" confirm.
- After the write, the sheet shows the same saved/waiting/sent feedback as check-in.

**Remove**
- The role-explanation paragraph. If a Field Lead cannot do something, the relevant control says
  why, as CLAUDE.md §2.6 already requires.

**Desktop presentation**
- At viewport widths ≥ 768 px, centre the phone frame horizontally with a quiet caption above it:
  "Field Lead view (mobile)".
- Frame width 390 px, 8 px radius, `border`. No device bezel graphics.
- Below 768 px, full-screen, no frame.

**Demo checks** (screenshot each, at 390×844 and centred at 1440×900)
1. Season start: on schedule, GO set or "Not set", Online.
2. The Maitri-offline beat: "Via Maitri · Offline · n waiting to send", and a check-in shows as
   waiting to send.
3. The overdue moment in the demo (FT-3 last confirmed 9 h ago): the card is red "Overdue".
4. The NO-GO confirmation and the Raise incident sheet open and cancel cleanly.
5. After sync: "Check-in sent", and the waiting list is empty.