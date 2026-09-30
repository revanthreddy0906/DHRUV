# How other logistics platforms work, and where DHRUV stands

This answers the evaluator's third point: explore how other logistics platforms work. It compares DHRUV with the polar programmes' own systems, with offline-first humanitarian and military logistics tools, and with enterprise supply-chain software. It then lists what we adopted from them and what we would add next.

**About the sources.** Research was done in September 2026. Several official sites (usap.gov, antarctica.gov.au, anao.gov.au, docs.dhis2.org, msupply.foundation, army.mil, logcluster.org) could only be read through search-engine summaries, not opened directly. Claims that rest only on such a summary are marked *(summary)*. Anything we inferred ourselves is marked *(our reading)*.

## What the polar programmes publish

| Programme | What is public | Relevance to DHRUV |
|---|---|---|
| **US Antarctic Program** (NSF, Leidos support contract) | The contractor must "track movement of cargo to, from, and within the program area" ([TL-MAN-0002](https://www.usap.gov/logistics/documents/tl-man-0002.pdf)) *(summary)*. Procurement is scheduled back from a **Required On Site** date, with a "Maximo Purchase Request Submitted By" date 87 days before it ([TL-FRM-0049](https://usap.gov/logistics/documents/TL-FRM-0049.pdf)) *(summary)*. That suggests IBM Maximo for procurement and maintenance *(our reading)* | Dates worked back from the date cargo must be on site. **Adopted:** the milestone strip on Cargo |
| **Australian Antarctic Division** | The national audit found the Division "has not established an effective inventory management system". It could not track stock location and quantity, so it bought and shipped items already over-stocked on station, and deliberately over-supplies as a buffer ([ANAO Report 22, 2015–16](https://www.anao.gov.au/work/performance-audit/supporting-australian-antarctic-program)) *(summary)*. Each resupply must cover 12 months ([AAD resupply](https://www.antarctica.gov.au/nuyina/about/resupply/)) *(summary)* | **The problem DHRUV addresses directly.** An exact per-station ledger, updated offline and merged safely, is what the audit found missing |
| **British Antarctic Survey** | A cargo packing note is filled in for every box, bag or crate; shipping is handled from Cambridge ([BAS cargo](https://www.bas.ac.uk/for-staff/polar-predeployment-prep/intro-guidelines-and-forms/cargo/)). Station inventory software is not documented publicly | Line-level cargo records, as in DHRUV's cargo lines per shipment |
| **Alfred Wegener Institute** | Neumayer III is resupplied once a year by Polarstern, with containers offloaded at the ice-shelf edge ([JLSRF](https://jlsrf.org/index.php/lsf/article/view/152)) | The same single-vessel, single-window model as Maitri |
| **COMNAP** | A voluntary Ship Position Reporting System, since 2001, succeeded by the Asset Tracking System (ships and aircraft). It is explicitly not an emergency alerting system ([COMNAP report to IHO](https://legacy.iho.int/mtg_docs/rhc/HCA/HCA10/HCA10-06.2A_COMNAP_Report.pdf)) | A future vessel-position feed on the cargo legs |
| **NCPOR (India)** | Route Cape Town → Bharati → Maitri → Cape Town, with ship operations December to April; Jet A1 bought in Cape Town ([NCPOR tender AL-04](https://ncpor.res.in/files/AL-04_23-08-18.pdf)). Nothing public on its IT systems | DHRUV's season model (Cape Town feeder, vessel cut-off, station closing) |

## Other systems

| Platform | Domain | What it does | Offline | DHRUV has / lacks |
|---|---|---|---|---|
| [Open mSupply](https://github.com/msupply-foundation/open-msupply) | Medical supply | Remote sites work offline and sync to a central server. Records are owned centrally, by a remote site, or routed to a store | Yes | **Has** local-first writes and sync. **Lacks** explicit per-record ownership for sync (DHRUV checks ownership, but on the server only) |
| [DHIS2 Android](https://docs.dhis2.org/en/full/implement/dhis2-android-implementation-guide.html) | Health data | Offline capture, scheduled sync, and an [SMS fallback](https://github.com/dhis2/dhis2-android-docs/blob/main/content/tech-guides/SMS-compression.md) in a compressed binary format with acknowledgement codes | Yes | **Has** sync status per record and a conflict policy per field (merge classes A/B/C/CS). **Lacks** an ultra-low-bandwidth fallback |
| [OpenBoxes](https://github.com/openboxes/openboxes) | Health and relief warehousing | Lots and expiry dates, stock cards, requisitions, shipments, [cycle counts](https://help.openboxes.com/article/485-perform-cycle-count) | Local server | **Lacks** lots/expiry and scheduled cycle counts |
| [Sahana Eden](https://sahana-eden.readthedocs.io/en/latest/intro/index.html) | Disaster response | Send and receive shipments, substitute items; sync between instances, including by USB | Yes | **Lacks** sync by carrying a file |
| [GCSS-Army DISCOPS](https://www.army.mil/article/280462/coming_soon_gcss_army_discops) | Military | Up to 7 days disconnected: goods movements, work orders, dashboards; syncs on reconnect *(summary)* | Yes | **Same design.** A local log, synced when the link returns |
| [NATO LOGFAS](https://en.wikipedia.org/wiki/Logistics_Functional_Area_Services) | Military | Separate tools to plan movements (ADAMS) and to run and show them (EVE) | *(unclear)* | Plan versus actual. **Adopted** in part: plan, latest and now on each milestone |
| SAP MM/EWM ([movement types](https://www.voisap.com/sap-movement-types)) | Enterprise warehousing | Every stock change has a typed movement; mistakes are reversed by a counter-movement, never edited | No | **Has** append-only events. **Lacks** typed reversals (a correcting count is used instead) |
| [SAP TM](https://learning.sap.com/courses/exploring-sap-s-4hana-transportation-management-for-logistics-service-providers/creating-ocean-freight-bookings) | Transport | Separate cargo and document cut-offs taken from the sailing schedule | No | **Has** the load cut-off. **Lacks** a document cut-off |
| [IBM Maximo](https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=module-meters) | Asset maintenance | Meter readings (running hours) trigger work orders and spares demand | No | **Lacks** meters: generator hours could drive genset-kit demand |
| [Odoo inventory](https://odoo-users.readthedocs.io/en/latest/inventory/overview/concepts/double-entry.html) | ERP | Double-entry stock: every move goes between two locations, including virtual ones (supplier, loss, adjustment) | No | **Lacks** explicit from/to locations (a receipt is +qty at a station) |
| [project44](https://www.project44.com/blog/eta-reimagined-transforming-project-44s-prediction-engine/), [FourKites](https://www.fourkites.com/blogs/how-to-effectively-managing-exceptions-with-ocean-visibility/) | Shipment visibility | Milestones, predicted ETAs, rule-based exception routing | No | **Adopted:** milestones and exceptions. **Lacks** predicted ETAs |
| Control towers ([Gartner via Supply Chain Dive](https://www.supplychaindive.com/news/gartner-what-supply-chain-managers-should-know-about-control-towers/574098/)) | Pattern | People, process and near-real-time data around an exception queue with response playbooks | n/a | **Adopted:** the exception queue on Command |
| [Neo4j supply chain](https://neo4j.com/use-cases/supply-chain-management/) | Graph | Multi-tier dependencies and "what is affected if this fails" | n/a | **Adopted:** the Connections graph, derived from the log with no graph database |

## Where DHRUV already matches or goes further

- **Offline by design.** Every write is local first, like Open mSupply, DHIS2 and DISCOPS. Writes are idempotent on `(device_id, seq)`, and an outbox drains by priority tier (incident first) and respects a byte budget on a degraded link.
- **A stated merge policy per kind of data.**
  - A: immutable.
  - B: stock is last count plus deltas.
  - C: last write wins.
  - CS: safety-critical, where the conservative value wins and a conflict goes to review.

  DHIS2 is the only other system with a documented policy of this kind, and that comes from a secondary summary.
- **Exact stock per station, computed rather than typed in.** This is the gap the Australian audit found.
- **Deterministic decisions with a trace.** The rule, the inputs and the arithmetic are shown, plus a Γ worst-case analysis. None of the systems above publishes its decision logic this way.

## What we adopted in this round

1. **Exception queue** (control towers, FourKites). On the Command Center, every rule breach becomes one line with:
   - a severity and an owner role;
   - what happened;
   - numbered playbook steps and a link to the screen where they are done.

   It covers:
   - dimensions that are RED or AMBER, and counts that are STALE or CRITICAL;
   - missed or at-risk cargo milestones, pending decisions with their point of no return;
   - open incidents and conflicts, and events the server refused.

   It is derived each time, so it clears itself when the cause is fixed. Code: `apps/web/src/live/exceptions.ts`.
2. **Back-scheduled milestones** (USAP required-on-site dates, SAP TM cut-offs, planned vs actual in visibility platforms). Each Cargo shipment shows four steps, each with its latest date, plan, current value and state (done, on track, at risk, missed):
   - leave origin,
   - reach the vessel by load cut-off,
   - vessel departs,
   - on station.

   Code: `packages/engine/src/milestones.ts`.
3. **A dependency graph** (the supply-chain graph use case). See **Connections** (`/graph`) and `packages/engine/src/graph.ts`.

## What we would add next

| Pattern | From | Why for DHRUV |
|---|---|---|
| Typed stock moves with from/to locations, and reversals | Odoo, SAP | Receipts could be traced to a shipment and issues to a mission; corrections become explicit |
| Lot and expiry tracking, and scheduled cycle counts | OpenBoxes | Medical kits and food expire; counts could be suggested by the age of the last count |
| Iridium short-burst fallback for P0/P1 events | DHIS2 SMS compression | Incidents could still get through when the main satellite link is down |
| Sync by carrying a file (signed outbox bundle) | Sahana Eden | For stations with no link for weeks, via ship or aircraft crew |
| Meter readings driving maintenance and spares | Maximo | Generator hours could feed genset-kit demand |
| Hybrid logical clocks alongside `(device_id, seq)` | [Kulkarni et al. 2014](https://link.springer.com/chapter/10.1007/978-3-319-14472-6_2) | Causal ordering across stations whose clocks drift |
| Predicted ETAs from past legs | project44 | ETAs could be forecast instead of waiting for a report |
