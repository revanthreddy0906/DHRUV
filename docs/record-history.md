# Record history: where data is stored and how it is managed

Branch `feature/record-history`, from `develop` at `df9d3ba`.

The goal: a judge can see, inside the product, how DHRUV stores and manages data. Every record
shows its own history, and for each entry, where that entry is now. Everything is built from
existing events and existing rules. There is one approved contract change, and nothing else under
`packages/` or `apps/server` changed.

## Commits

| Commit | What |
|---|---|
| `191660a` | **Contract (approved exception).** `STOCK_COUNTED` gains an optional `reason`: a string of at most 200 characters after trimming. It is documented in `openapi.yaml` and `docs/spec.md`, and `describeEvent` shows it. Server tests cover a count with a reason, without one, and over 200 characters. Existing counts validate unchanged. The Season 48 and Aurora golden tests pass. |
| `2c3cdb5` | **`format/ledger.ts`.** It builds:<br>• the stock ledger, with a running balance per row (`stockBalance()` over each prefix; there is no second stock rule)<br>• the one-line balance derivation<br>• the count variance<br>• asset and person histories<br>• "Maintained by", from `EVENT_RULES`<br>• where each entry is |
| `0a68850` | `shipmentsOf` moved to `live/shipments.ts`. The function body is byte-identical. |
| `7845668` | **Stock card** at `/inventory/:itemId`, opened from each Inventory row. It has:<br>• the balance and its derivation<br>• the requirement, availability and margin<br>• inbound shipments, with Cargo's feasibility<br>• "Maintained by"<br>• the ledger<br>• the reused stock form, locked to the item<br>• "Record correction" |
| `a3b9ab8` | **Asset record** (`/assets/:assetId`) and **person record** (`/personnel/:personId`). They are linked from:<br>• Map (asset ids)<br>• Incident (people and responders)<br>• Personnel (names)<br>• Connections (the members of an asset or role group) |
| `bfdfd11` | **Stocktake** on Inventory, and HQ's **Variance review**. |
| `57e90f0` | "Where data lives" is removed from the nav. The `/data` route still works. The Command item for refused entries now opens the sync drawer (`/command?sync=1`). |
| `1e339da` | Polish from the screenshot review. |

Each commit passed `pnpm typecheck && pnpm test`: 369 tests (engine 97, server 125, store 38, map 19, web 93).

## What a record shows

**Where this entry is**
- "Waiting to send · on MAITRI-TAB-01": the entry is still in that device's outbox.
- "At HQ": HQ accepted it. The server's receipt time is on the server's real clock, so it appears only in a tooltip, e.g. "Received by HQ 28 Sep 22:05 (real time)". Entry dates stay in sim time.
- "Refused: {the server's reason}": the entry is listed but not counted.
- Entries from other devices always reached this device through HQ, so they read "At HQ".

**Recorded by:** the role, with the device id under it.

**Maintained by:** comes from `EVENT_RULES` and the station that owns the record. For example:
- "Counts: Maitri Station Leader or HQ Ops"
- "Issues and receipts: Maitri Station Leader"

**Current status**
- **Stock:** the stock rule (`stockBalance`).
- **Assets:** the map's derivation, which keeps the conservative value while a disagreement is open.
- **People:** the engine's `reduce()`.

No storage location is shown or invented: the season data has none. The only "where" a record has
is its owning station and, for assets, the last known position.

## Screenshots

All at 1440×900, in `docs/ui-redesign/after-record-history/` (ignored by git).

- `stock-card-diesel-offline.png`
  - The Maitri tablet is offline and has issued 2.5 kL.
  - The balance is 89.5 kL: "Last count 92.0 kL on 24 Jan 04:00, minus 2.5 kL issued since."
  - The issue row reads "Waiting to send · on MAITRI-TAB-01".
- `stock-card-diesel-synced.png`
  - The same card back online. The row reads "At HQ".
  - Its tooltip reads "Received by HQ 28 Sep 22:05 (real time)".
- `stocktake-large-variance-reason-needed.png`
  - A count sheet, oldest count first.
  - Food counted at 6,000 against a book balance of 8,900 (−32.6 %) is tinted, and "Record 3 counts" is blocked until the line has a reason.
- `stocktake-recorded.png`
  - After recording, each line shows where its count is.
  - The variances stay as counted.
- `hq-variance-review.png`
  - HQ's Inventory shows the food count, its reason ("Freezer failure, spoiled stock written off"), who recorded it and "At HQ".
  - Food is now RED: the engine is responding to the count.
- `asset-sk2-after-conflict.png`
  - Taken after beat 10.
  - Status DOWN, with "Disagreement open: DOWN from MAITRI-TAB-01, OK from DIRECTOR. DOWN is kept until someone decides in the Review queue."
  - The history holds the season status, Maitri's DOWN ("track fault"), HQ's OK ("stale maintenance plan") and the server's flag, each with who recorded it and where it is.

Season 48 beats 1–11 completed during the screenshot run with no page errors. The dev database was reset to Season 48 afterwards.

## Notes

- **Unknown keys in a payload.** The server validates a payload against its zod schema, but stores the raw payload. So before the contract change, an unknown key such as `reason` would have been kept but not validated or documented. It is now part of the contract and validated.
- **Button labels.** The stock and personnel forms now name their action ("Record issue", "Record count", "Set status", "Record move") instead of "Submit" (CLAUDE.md section 10).
- **A count can carry a reason from the ordinary stock form too.** It is optional there. At a stocktake it is required when the variance is over 10 %.
- **The asset record has no form.** There was no asset status form in the web app before. Asset status is still changed as before.
