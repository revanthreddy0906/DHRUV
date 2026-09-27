# Run-through: a real incident, *Aurora Australis* aground at Mawson (2016)

This answers the evaluator's fourth point: a complete run-through of a real-life situation. We replay a documented Antarctic logistics incident on DHRUV, beat by beat, and show what every screen says at each step.

## What really happened

In February 2016 the Australian icebreaker *Aurora Australis* was resupplying Mawson station.

| Date (2016) | Event | Source |
|---|---|---|
| 20 Feb | Arrives at Mawson for the station's annual resupply; cargo and fuel go ashore over several days | [AAD](https://www.antarctica.gov.au/news/2016/aurora-australis-aground-at-mawson/) |
| 24 Feb, 09:15 | In a blizzard with winds over 130 km/h the ship breaks its mooring lines and runs aground in Horseshoe Harbour. 67 people on board; the hull is breached; fuel is monitored | [AAD](https://www.antarctica.gov.au/news/2016/aurora-australis-aground-at-mawson/), [ABC](https://www.abc.net.au/news/2016-02-25/aurora-australis-salvage-plans-revealed-by-aad/7198392) |
| 26 Feb | When the weather clears, 37 expeditioners are taken ashore to Mawson by barge | [ABC](https://www.abc.net.au/news/2016-02-27/stranded-passengers-to-be-taken-off-icebreaker/7203004) |
| late Feb | Davis station's returning crew are flown out instead of waiting for the ship | [ABC](https://www.abc.net.au/news/2016-03-04/aurora-australis-japanese-iceabreaker-to-pick-up-expeditioners/7222008) |
| 2 Mar | The ship is refloated, inspected and cleared to sail to Fremantle for repairs, without expeditioners | [ABC](https://www.abc.net.au/news/2016-03-02/damaged-antarctic-ship-cleared-for-sailing/7213370) |
| Mar | Japan's icebreaker *Shirase* collects the stranded expeditioners; France's *L'Astrolabe* is chartered for the next resupply | [ABC](https://www.abc.net.au/news/2016-03-04/aurora-australis-japanese-iceabreaker-to-pick-up-expeditioners/7222008) |
| 12 Mar | The stranded group reaches Casey aboard *Shirase* and flies home | [AAD](https://www.antarctica.gov.au/news/2016/mawson-expeditioners-on-board-shirase/) |

The sources were researched in September 2026. Some were read through search summaries because the sites could not be opened from the research environment.

## How it is adapted

- **Mawson becomes Maitri**, *Aurora Australis* becomes **MV Ice Star**, and *Shirase* becomes the **Partner icebreaker**.
- **Real calendar days, moved to 2027**, the demo year.
- **Illustrative, not documented:**
  - the cargo quantities (48 kL diesel on C-104, of which 20 kL is offloaded before the grounding, and 28 kL replacement diesel);
  - the lever figures (air diesel +12 kL, conserving −8 kL);
  - the 37 expeditioners' names;
  - Maitri's link degrading during the blizzard.

The scenario is `aurora2016` (`packages/seed/src/aurora2016.ts`). It starts from the season48 data, adjusted for arrival day:
- the feeders have reached Cape Town;
- MV Ice Star is due on 20 Feb;
- the station stays open for ships until 15 Mar;
- 37 voyage members are aboard;
- a second vessel, the Partner icebreaker, exists;
- the only levers still open are the air option and conserving.

The season48 scenario and its golden numbers are untouched.

## Setting up

1. `pnpm seed aurora2016`, or choose **Real incident: Aurora Australis…** in the Director and press **Reset to Start**.
2. Open three tabs, all signed in:

   | Tab | Role | Device | PIN |
   |---|---|---|---|
   | Director | HQ Ops | `HQ-WEB-02` | `HQ-2027` |
   | HQ | HQ Ops | `HQ-WEB-01` | `HQ-2027` |
   | Maitri | Station Leader | `MAITRI-TAB-01` | `MAITRI-2027` |

3. In the Director, run the beats in order. **By hand** steps are done in the named tab with the app's own forms, and the Director ticks them off when it sees the event. Pressing the beat instead does it for you.

## Beats and what to check

Numbers are Maitri's, from `apps/server/src/golden/aurora2016.test.ts`, which replays every beat on the server.

| Beat | What happens (DHRUV events) | Maitri after the beat |
|---|---|---|
| A0 | Every tab's clock goes to 20 Feb 2027 | GREEN · fuel 1.0606 · food 1.0749 |
| A1 | HQ: the vessel legs of C-104, C-107 and C-112 are marked arrived (`LEG_UPDATED` DONE) | Unchanged. Cargo on board is still inbound |
| A2 **by hand** | Maitri → Inventory → **Receive** 20 kL diesel against C-104 (`STOCK_RECEIVED` with `shipment_id`) | Fuel still 1.0606. The 20 kL moved from inbound to stock; it is not counted twice |
| A3 | HQ: `INCIDENT_OPENED` VESSEL_AGROUND at 24 Feb 09:15; `VESSEL_UPDATED` puts the ship's arrival after the station closes, so the remaining 28 kL cannot land (R02) | **RED** · fuel **0.8485** (112 / 132). The incident gates the station. Exceptions: Fuel RED, incident open, C-104 on-station milestone missed |
| A4 | Maitri's link goes DEGRADED (blizzard) | Maitri keeps working locally; its writes queue by priority |
| A5 | The engine proposes DEC-AGROUND with options: air diesel + conserve, air diesel, conserve | The decision queue shows its point of no return. Γ panel on Inventory: worst case with Γ = 1 |
| A6 | Maitri: 37 × `PERSON_MOVED` from the ship to Maitri | Food **RED 0.4229**: 61 people on station (R19). Connections shows the role groups feeding Food |
| A7 **by hand** | Maitri → Inventory → **Count** diesel 111.5 (fuel watch) | Fuel 0.8447, on a fresh count |
| A8 **by hand** | HQ → Decisions → DEC-AGROUND → approve the top option (check Γ first) | Fuel **AMBER 1.0024** with the air diesel and conserving applied |
| A9 | HQ: `INCIDENT_UPDATED` RESOLVED (refloated, sailing without passengers) | The incident gate lifts; food still RED |
| A10 **by hand** | HQ → Cargo → **New shipment**: "Diesel 28 kL (replacement)" to Maitri, feeder ETA 3 Mar, loads on the Partner icebreaker, cargo diesel 28 | Fuel **GREEN 1.2297**. The new shipment appears in Cargo with its milestones and in Connections |
| A11 | Maitri: the 37 move to the Partner icebreaker | **GREEN** station · food 1.0749 |
| A12 | Maitri's link back ONLINE | The outbox drains in priority order; HQ sees everything. **Where data lives** shows each event from local write to the server log |

## Five-minute presenter script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Director | "This is a real incident: *Aurora Australis* aground at Mawson in 2016. We replay it on Maitri, with the real dates moved to 2027." |
| 0:20 | Maitri Inventory, A2 | "Offload starts. The station leader receives 20 kL against C-104. The fuel ratio doesn't jump, because that diesel was already counted as inbound." |
| 0:50 | HQ Command, A3 | "09:15, blizzard, the ship is aground. The rest of the diesel can't land before the station closes, so Maitri turns RED. The exception queue says who owns what, and what to do." |
| 1:30 | Connections | "Why RED? Click the vessel: its delay reaches C-104, diesel, Fuel and Maitri." |
| 2:00 | Maitri, A6 | "37 people come ashore. Food turns RED, because the engine counts everyone on station against the winter requirement." |
| 2:30 | Inventory Γ panel, then Decisions, A8 | "Before approving, the worst case: if burn rises or the count is off, how bad does it get? Then approve: air diesel plus conserving, and Maitri is AMBER." |
| 3:30 | Cargo, A10 | "HQ ships the remaining diesel on the partner icebreaker. The milestones show it makes the cut-off, and Fuel is GREEN." |
| 4:10 | A11, A12 | "The 37 leave, food recovers, and the link comes back. Maitri's queue drains, incident first." |
| 4:40 | Where data lives | "Every step was an event: written on the tablet first, synced later, and never overwritten." |
