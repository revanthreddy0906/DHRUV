# Phase 5 — Connections and Field Lead

Branch `ui/polar-light`. Spec: `SPEC-connections-and-field.md`. One commit per step. After every
commit, `pnpm typecheck && pnpm test` passed: 357 tests (engine 97, server 122, store 38, map 19,
web 81 including 26 new).

## What changed

| Step | Commit | Summary |
|---|---|---|
| Focus helpers | `6599d1f` | `format/graphFocus.ts`: upstream walk (reverse over impact edges), downstream reach (`impactOf`), remedies, route context, default focus, collapsed counts. `format/graphText.ts`: card lines, reason sentences, source notes, the one action per record. No engine change. The spec is committed here. |
| Layout | `c52a13a` | `screens/graphLayout.ts`: five columns of 200 px cards (1,164 px wide); right-angle lines through the gutters and the gaps between rows. Tested so that no line crosses a card. |
| Connections | `93cb336` | Focused impact explorer. It opens on the record that drives the station's state (L2-C104 after the slip), or on Fuel while the station is GREEN. `?focus=` carries the focus. Includes Find a record, Show all records, "+ n more" per column (expandable), and a Selected record panel below the graph (on the right from 1,680 px). The help panel and the Try buttons are gone. |
| Station link | `fa267c9` | The Station page's Analysis link opens Connections on the driving dimension (`?focus=MAITRI.FUEL`). |
| Dashed lines | `da1dd2d` | Dashed lines use `border-strong`, so they stay visible on a projector. |
| Check-in helpers | `bdf03ac` | `format/checkin.ts`: check-in state, schedule line, field link line, date ranges. `live/fieldIds.ts`: incident ids. `ui-config.ts`: the field device map, the demo position and the 30-minute due-soon window. |
| Field view | `ad3708c` | `components/field.tsx` is rebuilt as presentational parts:<br>• one header line and one link line<br>• the check-in card as the hero<br>• mission and position cards<br>• Raise incident as a red outline button with a confirm sheet<br>• a 390 px frame centred at 768 px and wider<br>The static `/field` gallery preview uses the same parts. |
| Live Field | `f004fac` | `screens/FieldLive.tsx` runs on a signed-in Field Lead device. Writes go through `useEventWriter`. Feedback comes from `useWriteStatus`. The waiting list comes from the outbox. `EVENT_RULES` decides what the role may do. The Demo dock is mounted (Shift+D). |

## Verified

- **Connections, at 1440×900:**
  - At season start it focuses on Fuel, and the chain is calm.
  - After the slip it focuses on L2-C104, with a red path to Maitri, amber to F-27, and Hold vessel dashed beside C-104.
  - Clicking Diesel refocuses the graph.
  - Find a record works by keyboard.
  - Show all records works.
  - Aurora builds the graph and chooses Fuel.
- **Field Lead, at 390×844 and centred at 1440×900:**
  - At season start the card reads "No check-in recorded yet", with no schedule lines, and the link is Online.
  - With the tablet offline, a check-in shows as waiting to send ("Offline via Maitri · 1 waiting to send").
  - At 25 Jan 16:00, after beat 7, the card is red: "Overdue", "Checked in 9 h ago".
  - The Raise incident sheet opens and cancels.
  - After sync the card reads "Check-in sent." and the waiting list is empty.
  - A field incident is accepted by the server: "INC-FT3-01 sent."
- Season 48 beats 1–11 and Aurora A0–A12 ran across four tabs (Director, HQ, Maitri, FT-3). All completed, with no page errors.
- Screenshots are in `docs/ui-redesign/after-phase5/` (ignored by git).
- The dev database was reset to Season 48 afterwards.

## Decisions and notes

- **Go/no-go: needs a new event type; roadmap.** It has been removed from the Field screen.
- **The check-in position is a constant** (`FIELD_DEMO_POSITION`, −70.62, 12.10; the demo has no GPS). The feedback and the position card both say "Position from device (demo constant)".
- **Team and mission** come from `FIELD_DEVICES` in `ui-config.ts` (FT3-TAB-01 → FT-3, F-27). The seed has no team roster. People and the vehicle come from F-27's needs.
- **Field incident ids are `INC-FT3-01`, `-02`, and so on.** The server keeps the first `INCIDENT_OPENED` per id (`INSERT OR IGNORE`), so the team in the id stops two offline devices from clashing.
  - The sheet offers SOS, Medical and Injury.
  - OVERDUE_CHECKIN is left out, because the station raises it about a team.
- **The FT-3 tablet's link is its own simulated link.** Beat 3 takes only the Maitri tablet offline. To show the offline field view, set the FT-3 tab offline in its Demo dock (Shift+D).
- **Type size:** the type scale has no 16 px size, so the field's primary text uses 20 px (state, coordinates, buttons) and supporting lines use 15 px.
- **Check-in states.** Between the due time and the end of the grace period, the amber state reads "Due now" instead of "Due soon". Once overdue, the schedule line reads "Due 11:00 · overdue since 14:00".
- **Field feedback wording.** The field screen uses its own wording on the same write status as `WriteFeedback`: saved on this device, waiting to send, sent, or refused with the server's reason. The line describes the device's last check-in until the next one.
- **Card counts.** After the slip, Connections shows about 15 cards, and focusing on F-27 does too. This was left as is on purpose: capping the remedies could hide the one that matters, such as Hold vessel.
- **Remedy placement.** A remedy card sits in the column of the first path record it acts on, not in the legs column.
- **Place names** come from the season data ("L2-C104 Mumbai port → Cape Town").
- **Station picker.** The spec's in-page station select is not added. The HQ top-bar select already sets `?station=`, so there is one place for it.
- **One flaky test run.** During step 7, one run of `offlineRoundTrip.test.ts` (server) failed while every package ran in parallel. Four reruns passed, and that commit touched only web files.
