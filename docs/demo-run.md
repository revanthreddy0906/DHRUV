# DHRUV demo run (browser)

How to run the Build Bible section 17 runbook against the real server, and what each beat should show. Checked end to end on 24 Sep 2026 (branch `integration`).

All data is synthetic (section 13). Every number below is the engine's `evaluate()` on the events the viewing device holds, at its own clock.

## Start

```bash
corepack enable   # once per machine, puts pnpm 9.12 on PATH
pnpm install
pnpm seed
pnpm dev
```

`pnpm dev` starts the server on :4000 and the web app on :5173, or the next free port it prints (Vite proxies `/api` to the server; point it elsewhere with `DHRUV_API_URL`). Node 20 LTS.

## Tabs

One browser tab is one device. A device can be open in only one tab at a time; a second tab is refused at sign-in.

| Tab | Role | Station | Device id | PIN | Open at |
|---|---|---|---|---|---|
| Director | HQ Ops | Goa HQ | `HQ-WEB-02` | `HQ-2027` | `/director` |
| HQ screen | HQ Ops | Goa HQ | `HQ-WEB-01` | `HQ-2027` | `/command` |
| Maitri tablet | Station Leader | Maitri | `MAITRI-TAB-01` | `MAITRI-2027` | `/command` |
| Field Lead | Field Lead | Maitri · team FT-3 | `FT3-TAB-01` | `MAITRI-2027` | `/field` |

The Director lists the open device tabs and says which tab each beat needs. Press **Reset to Start** before a run.

## Beats and what to check

| Runbook | Director | Check |
|---|---|---|
| 0:00 | Reset to Start | HQ: 24 Jan 08:00, Maitri GREEN (fuel 1.0606), no decisions, no PNR |
| 0:20 | Beats 1, 2 | HQ: Maitri RED 0.697, F-27 at risk; DEC-01 proposed by the engine with (a) HOLD_VESSEL 1.0606, (b) + CONSERVE + DEFER_F27 1.1785, (c) 0.8754 RED; PNR 3 Feb (10 days) |
| 0:50 | Beats 3, 4 | Maitri: OFFLINE, local operations active, 4 events pending; DEC-01 shows "Only HQ Ops can approve decisions touching vessels" |
| 1:20 | Beat 5 | HQ: SK-2 OK (stale plan) in the timeline; none of Maitri's entries |
| 1:30 | Beat 6 | Every tab at 25 Jan 16:00. HQ: "GREEN, could be AMBER" on option (a), 9 days to PNR |
| 1:40 | Beats 7, 8 | Maitri (still offline): emergency mode, INC-01, FT-3 last confirmed 9 h ago at −70.62, 12.10, circle 27 km, 6 pending |
| 1:50 | – | Maitri Incident: HX-1 ≈ 21.5 km / ≈ 11 min, SK-2 excluded, 27 km circle on the map, comms offline |
| 2:05 | Beat 9 (open Maitri's SYNC drawer first) | Degraded, then Online. Queue leaves in priority order: INCIDENT_OPENED, ASSET_STATUS_SET, CHECKIN_RECORDED, STOCK_ISSUED, STOCK_COUNTED, MISSION_UPDATED |
| 2:15 | Beat 10 (happens on sync) | HQ: incident strip, Audit badge 1, SK-2 conflict DOWN vs OK with DOWN kept. Resolve it in the Review queue |
| 2:25 | HQ approves option (a) in Decision Detail (or beat 11) | Queue and PNR clear; after "Show station cards", Maitri GREEN 1.0606 with the incident gate |
| after | HQ: Open what-if | SIMULATION overlay, run locally: burn +15% after (a) → 0.9223 RED; the options that still work and the new PNR are listed |

Beat 7 also records FT-3's check-in on the Maitri tablet (radio relay), so the offline station has the position at 1:40–1:50.

## Operational transactions (after the beats, or on their own)

These are done by hand in the forms, not by the Director. Each one writes one event and syncs like any other.

| Tab | Screen | Do | Check |
|---|---|---|---|
| Maitri | Inventory | Issue 2.5 kL diesel, reason "generator refuel" | Diesel stock drops by 2.5; the form says "saved locally", then "accepted by the server" |
| Maitri | Inventory | Receive 1 kL, then Count 88 | Stock rises by 1, then reads 88.0 |
| Bharati | Inventory | Open the Item list | Only Bharati's five items |
| Field Lead | Inventory, then Personnel | Inventory is read only; set a person's status | The person's status changes in "People (live)" |
| HQ | Inventory | Actions list | Count only; the station switch shows Bharati's stock |
| HQ | Cargo | New shipment: 10 kL diesel to Maitri | C-113 appears; Maitri diesel inbound rises by 10 |
| HQ | Personnel | Move a person Maitri → Bharati | They appear under Bharati |
| any | Where data lives | Pick the event you just wrote | Local → outbox → server log, with the envelope and the server's row counts |

## If something is off

- **A beat says "no response from ..."**: that device's tab is not open or not signed in.
- **A tab shows "... IS OPEN IN ANOTHER TAB"**: close one of the two tabs for that device.
- **Map tiles do not load**: the map switches to the schematic by itself; the operational state is unaffected.
- **A tab looks stale after Reset**: it catches up on its next sync (3 s); reloading the tab is also safe.
