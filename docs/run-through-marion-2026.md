# Run-through: a real incident, the Marion Island polar-diesel crisis (2026)

This is the second real-incident replay, next to [Aurora Australis 2016](run-through-aurora-2016.md). It shows the question DHRUV is built to answer.

In May 2026 the public statement said "fuel lasts to about 20 May". DHRUV turns that into "the evacuation must start by 13 May, or by 18 May if the station conserves". It gets there from the station's own daily counts and the relief vessel's schedule, and it shows the arithmetic.

## What really happened

South Africa's Marion Island base is resupplied once a year by SA Agulhas II from Cape Town.

| Date (2026) | Event | Source |
|---|---|---|
| Apr 2025 – Apr 2026 | The overwintering team has been on the island since the previous relief voyage | [Mouse-Free Marion](https://mousefreemarion.org/were-going-back-to-marion-island-the-team-embarks-on-another-relief-voyage-to-the-island/) |
| early Apr | The specialised polar diesel is unavailable: the Middle East war has disrupted fuel-product supply | [Daily Maverick](https://www.dailymaverick.co.za/article/2026-05-09-iran-war-fuel-chaos-hits-sub-antarctic-as-remote-marion-relief-voyage-severely-delayed/) |
| 9 Apr, 14:00 | The ship was due to sail. It stays in port | [Daily Maverick](https://www.dailymaverick.co.za/article/2026-05-09-iran-war-fuel-chaos-hits-sub-antarctic-as-remote-marion-relief-voyage-severely-delayed/) |
| Apr | The refineries in East London, **Port Elizabeth (Gqeberha)** and Durban are checked; none has the product | [DFFE](https://www.dffe.gov.za/mediarelease/sa.agulhasII%20eparture_marionislanddelayed) |
| 1 May | Diesel reaches the Cape Town refinery. It must be blended and lab-tested before it can load | [DFFE](https://www.dffe.gov.za/mediarelease/sa.agulhasII%20eparture_marionislanddelayed) |
| 9 May | Public statement: diesel lasts to about 20 May without saving measures, food about two more months. Contingencies: backup petrol generators and 9 stocked huts. The VSAT link is at low bandwidth while it is reconfigured | [DFFE](https://www.dffe.gov.za/mediarelease/sa.agulhasII%20eparture_marionislanddelayed) |
| May | A team member's relative reports that the station is load-shedding. **Reported, not confirmed** by the department | [Daily Maverick](https://www.dailymaverick.co.za/article/2026-05-09-iran-war-fuel-chaos-hits-sub-antarctic-as-remote-marion-relief-voyage-severely-delayed/) |
| by 15 May | The refinery cannot make polar diesel because of a national kerosene shortage. Aviation fuel for the helicopters has to come from Durban | [Mail & Guardian](https://mg.co.za/the-green-guardian/2026-05-15-marion-island-team-to-be-evacuated-after-polar-diesel-shortage-delays-sa-agulhas-ii-voyage/) |
| 14 May | Minister Willie Aucamp orders the urgent evacuation. The ship sails the same day | [SAnews](https://www.sanews.gov.za/south-africa/government-orders-urgent-evacuation-overwintering-team-marion-island) |
| 16 May | The ship is making about 16 kn, due at 06:00 on 18 May. This comes from **Antarctic Legacy of South Africa on X, citing DFFE**. A normal transit takes about 5 days; this one took about 4 | [Antarctic Legacy (X)](https://x.com/Antarcticlegacy/status/2055574320026456347) |
| 18–21 May | The ship spends a few days at the base and leaves with the whole team; the base is shut down | [SABC](https://www.sabcnews.com/sabcnews/marion-island-base-to-be-shut-down-over-fuel-shortage/) |
| 27 May | The ship and the 20 team members reach Cape Town. The plan had said about 28 May, so "a day early" is our inference. An 18-month supply of polar diesel has been secured | [DFFE](https://www.dffe.gov.za/mediarelease/aucamp_ensuressafereturn_voyagedelays) |
| 3–25 Aug | Reactivation, in four steps. **3 Aug:** send-off (Minister David Maynier). **5 Aug:** the ship sails with 32 people (20 of them public-works staff). **9 Aug:** it arrives. **10 Aug:** public works goes ashore. 494 t of cargo and 300 t (350 m³) of polar diesel are flown ashore. **25 Aug:** the base is handed over | [SAnews](https://www.sanews.gov.za/south-africa/sa-agulhas-ii-arrives-safely-marion-island) |

These sources were researched in September 2026. Some were read only through search summaries, because the sites could not be opened from the research environment.

## How it is adapted

- **Marion becomes Maitri**, SA Agulhas II becomes **MV Ice Star**, and the dates move to **2027**, the demo year.
- **Illustrative, not documented:**
  - Maitri's diesel: 32.4 kL on 1 Apr, 0.60 kL/day in winter, 20 % reserve;
  - the 60 kL relief cargo (P-200);
  - the conserve saving (−25 % burn);
  - the evacuation lead time (4 days);
  - the roster of 20.
- **An adaptation, not what happened:** Maitri's link goes Degraded on 9 May and then **offline from 10 to 18 May**. The real VSAT only ran at low bandwidth. The outage makes HQ's newest diesel count more than 72 h old when it decides on 14 May, so the approval needs "Verify before acting".
- **What the Director shows:** every beat carries its real date, what really happened, and a source.
- **The claim is the timing arithmetic, not a prediction.** The synthetic numbers are tuned so that the deadlines bracket the real 14 May order. The B0 "count against the next resupply" baseline would also flag Maitri RED here. What DHRUV adds is the date by which each option must start, and how that date moves when the station conserves.

The scenario is `marion2026` (`packages/seed/src/marion2026.ts`), built from the season48 data. Bharati is unchanged, as the contrast.

### The one engine change

A scenario can now carry its own season (`Seed.season`). For marion2026:
- the requirement runs from *now* to the relief vessel's **current ETA**, so every delay to the ship lengthens the requirement;
- the reserve-breach walk starts at *now*.

Two lever effects were added for it:
- `burn_rate_uplift` now applies to an approved lever and to each option's requirement (Conserve is −25 %; Evacuate is −70 %, what is left after the station is shut down);
- `cutoff_before_breach_days` sets a lever's cutoff to "reserve breach minus N days" (Evacuate uses 3). The Evacuate deadline is that cutoff minus its 4-day lead time, so it moves with the breach date when Maitri conserves.

season48 and aurora2016 don't set a season, and their golden numbers are unchanged.

## Setting up

1. Run `pnpm seed marion2026`, or choose **Real incident: Marion Island polar diesel…** in the Director and press **Reset to Start**.
2. Open three tabs and sign in:

   | Tab | Role | Device | PIN |
   |---|---|---|---|
   | Director | HQ Ops | `HQ-WEB-02` | `HQ-2027` |
   | HQ | HQ Ops | `HQ-WEB-01` | `HQ-2027` |
   | Maitri | Station Leader | `MAITRI-TAB-01` | `MAITRI-2027` |

3. In the Director, run the beats in order. A **by hand** step is done in the named tab with the app's own form, and the Director ticks it off when it sees the event. Pressing the beat instead does it for you.

## Beats and what to check

The numbers are Maitri's fuel line as the server sees it. They come from `apps/server/src/golden/marion2026.test.ts`, which replays every beat. "Breach" is the reserve-breach date; "Evacuate by" is the Evacuate option's deadline, which is also the Point of no return.

| Beat | What happens (DHRUV events) | Maitri after the beat |
|---|---|---|
| M0 | Every tab's clock goes to 1 Apr 2027; the diesel count is 32.4 kL | GREEN · 60 kL relief diesel inbound on P-200 |
| M1 | The polar blend is unavailable: P-200's feeder leg slips past the load cut-off | Fuel still GREEN; P-200 is excluded (R02), and its on-station milestone is missed |
| M2 | 9 Apr, 14:00: MV Ice Star stays in port and is re-planned to sail 28 Apr (ETA 3 May) | GREEN. The requirement now runs to the new ETA |
| M3 | No other refinery has the product; the relief moves to 7 May (ETA 12 May) | GREEN |
| M4 | 1 May: the diesel reaches the refinery for blending and a lab test | GREEN |
| M5 | Maitri's daily counts for 5–7 May: 12.0, 11.4, 10.8 kL | GREEN, stock 10.8 |
| M5b **by hand** | Maitri → Inventory → **Count** diesel 10.2 kL (8 May) | GREEN, stock 10.2 |
| M6 | 9 May: count 9.6 kL; Maitri's link goes DEGRADED | GREEN while the ship is still due on 12 May |
| M6b | The departure is postponed until the fuel passes its test (re-planned to sail 30 May, ETA 3 Jun, as a placeholder) | **RED** · fuel **0.5333** · breach **20 May** · Evacuate by **13 May** · Point of no return 13 May |
| M6c | The engine proposes **DEC-MARION**: Evacuate (GREEN), Conserve + Evacuate (GREEN), Conserve alone (RED) | The decision queue shows the Point of no return |
| M7 **by hand** | Maitri Station Leader → Decisions → DEC-MARION → approve **Conserve** (a station-level option; the Station Leader cannot approve the options that include Evacuate) | Fuel **0.7111** · breach **25 May** · Evacuate by **18 May** |
| M8 | Maitri's link goes OFFLINE (adaptation) | Maitri keeps working; its writes queue |
| M9 | The refinery cannot make polar diesel: P-200's feeder slips to the end of the year, so the relief fuel is gone | RED |
| M9b | The engine proposes **DEC-MARION-EVAC**: Evacuate, marked **Verify before acting** | HQ's newest count is 9 May's 9.6 kL. The breach date HQ sees drifts later (28 May) because that count is getting old, which is exactly why verify is required |
| M10 | Maitri counts 9.15, 8.70, 8.25 and 7.80 kL (10–13 May), queued offline | HQ does not see them yet |
| M11 **by hand** | HQ → Demo controls → **14 May**, then Decisions → DEC-MARION-EVAC → tick the verification → **Approve** (14 May, 09:00) | Fuel **GREEN**: the evacuation removes the rest of the season's burn. No breach, no Point of no return |
| M11b | The ship sails for Maitri without fuel; ETA 18 May, 06:00 | GREEN |
| M12 | 16 May: about 16 kn, on time | GREEN |
| M13 | 18 May: the ship arrives | GREEN |
| M13b | Maitri's link comes back ONLINE; the outbox drains in priority order | HQ and Maitri agree: stock **7.8 kL** |
| M14 | The 20 people board the ship (20 × `PERSON_MOVED` to the voyage) | No one on station: food requirement 0 |
| M15 | 27 May: the team is back in Cape Town (moved by the HQ tab) | GREEN |
| M15b | The next relief voyage is scheduled: arrival 9 Aug | GREEN |
| M16 **by hand** | HQ → Cargo → **New shipment**: "Polar diesel, 18-month supply", feeder ETA 1 Aug, vessel MV Ice Star (relief voyage), cargo diesel 60 kL. The form assigns its own id (C-101 in a fresh run); pressing the beat records it as P-210 | 60 kL inbound again |

Bharati is not part of the incident. The server beats also carry its routine counts, and Maitri's food, medical and spares are counted with the diesel on 5, 9 and 13 May. That keeps HQ's attention list on the diesel story.

The server-side log records the two approvals: OPT-3 (Conserve) by `MAITRI-TAB-01`, and OPT-1 (Evacuate) with `verify_ack: true`. It also holds 40 `PERSON_MOVED` events.

### Reading the result against the real dates

- **Without conserving:** Evacuate by **13 May**, breach 20 May. That matches the public "fuel lasts to about 20 May".
- **With conserving from 9 May:** Evacuate by **18 May**, breach 25 May.
- **The real order came on 14 May,** between the two deadlines. That is where the synthetic numbers were tuned to put it. The point is the gap: "fuel lasts to 20 May" is not the date anyone needs. The date that matters is the last day a ship can leave, and it depends on whether the station saves fuel. DHRUV shows both on the Decision screen, with the trace.

## Five-minute presenter script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Director | "This is a real incident from this year: Marion Island's relief ship couldn't sail because polar diesel wasn't available. We replay it on Maitri, with the dates moved to 2027." |
| 0:30 | HQ Cargo, M1–M3 | "The fuel misses its load cut-off, and the ship stays in port. The requirement follows the ship: every day it slips, Maitri needs more diesel." |
| 1:10 | Maitri Inventory, M5b | "The station counts its diesel every day. Here's the 8 May count." |
| 1:40 | HQ Station / Decision, M6b–M6c | "On 9 May the departure is postponed indefinitely. The public line was 'fuel lasts to about 20 May'. DHRUV says the evacuation must start by 13 May, the Point of no return, because the ship needs 4 days and a margin." |
| 2:30 | Maitri Decision, M7 | "The station leader can approve load-shedding on their own. They can't order an evacuation; that's HQ's. The deadline moves to 18 May." |
| 3:10 | M8–M9b | "The link drops. HQ's newest count ages past 72 hours, so the evacuation option says 'Verify before acting'." |
| 3:40 | HQ Decision, M11 | "14 May: HQ ticks the verification and approves. That's the day the real order came." |
| 4:10 | M13b | "The ship arrives, and the link comes back. Maitri's queued counts reach HQ, and both agree: 7.8 kL left." |
| 4:40 | M14–M16 | "The team is home, and HQ books the secured diesel for August. Every step is an event in the log." |
