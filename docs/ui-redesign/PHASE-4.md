# Phase 4 — Cargo, Map, Login, polish (stretch)

Branch `ui/polar-light`. Items were done in order, one commit each. Every commit passed
`pnpm typecheck && pnpm test`: 331 tests (engine 97, server 122, store 38, map 19, web 55). No item
had to be reverted.

## What changed

| Item | Commit | Summary |
|---|---|---|
| 4.1 Cargo (section 9.5) | `6d4458d` | Shipments with an at-risk or missed milestone, or uncertain or excluded inbound, come first and open. The rest collapse to one row (id, name, priority, slack, state) under "n of m shipments on track". The cutoff is one plain `text-primary` line, "Vessel cutoff 4 Feb". Slack is text ("2 d slack", amber at 0–2 d, red below 0). Priority is plain text, and feasibility is a word. R17 uncertain inbound reads "ETA report 48 h old · verify". New shipment opens in a drawer. The Edit ETA preview uses `formatRatio`, and its button reads "Record delay". |
| 4.2 Map (section 9.7) | `8adca31` | The main map opens on Maitri, Bharati and the Cape Town leg. This is a new `antarctic` view on the same Blue Marble tiles; there is no polar schematic in `@dhruv/map`, and no projection or tile source was added. A horizontal route diagram (Goa HQ → Mumbai → Cape Town → Maitri) shows leg ETAs, a delayed leg in red with its original ETA, and the vessel cutoff at Cape Town. Assets are listed by exception, then "15 of 16 assets OK" (expandable). The incident map appears only while an incident is open. |
| 4.3 Login (section 9.9) | `e06d211` | Light single-column form. Role is a segmented radio group, and the arrow keys move between roles. Station and PIN are visible; Device ID is under Advanced, prefilled. The button reads "Sign in". Checked by signing in through the form (HQ Ops, device id changed under Advanced) and by a wrong-PIN attempt. |
| 4.4 Polish (section 9.8) | `2b85fcb` | Audit: sentence-case headers instead of field names, 40 px rows, and a "Clear filters" text button in the filter row. Connections: only AMBER and RED records are outlined, and the coloured left bars are removed (section 11). Director: interface text in Inter. Where data lives needed no change beyond Phase 1's tokens and type. |

## Verified

- Season 48 beats 1–11 and Aurora A0–A12, scripted across four tabs: all complete, with no page
  errors. At the end of Season 48, Map shows the incident area (FT-3, uncertainty circle), SK-2 as
  the one asset exception, and the route with the held cutoff of 7 Feb.
- Signed-out design previews still render: `/cargo?moment=slip`, `/map?moment=maitri-2501600`,
  `/login?error=1`, `/screens`.
- Screenshots are in `docs/ui-redesign/after-phase4/` (ignored by git).

## Notes

- The route diagram follows the shipment that carries the station's diesel (C-104 in Season 48).
  Stops are evenly spaced; it is a route, not a time axis.
- The Cargo Edit ETA preview still calls the engine from the screen, as it did before Phase 4. Only
  its wording and number format changed.
- Stretch items not started: the section 9.4 inventory table, labels and correction link; Personnel
  (section 9.6); Decision detail (section 9.3).
