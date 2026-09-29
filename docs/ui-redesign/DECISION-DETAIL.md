# Decision detail redesign

Branch `ui/decision-detail`. Web-only: no changes to `packages/*` or `apps/server`. No new
events, endpoints or dependencies. Golden tests unchanged.

## What changed

The screen is now built around the decision, and its layout depends on the decision's state.

### Awaiting a decision

1. **Header.** The decision id and "Awaiting decision", a plain title ("Maitri fuel below
   requirement"), and the deadline as the most prominent element:
   - with a point of no return: "Decide by 3 Feb · 10 days", from the engine's PNR for the
     decision's station;
   - with no PNR (aurora2016): "No option restores GREEN on its own", then "Act by 2 Mar
     (option (a)) · 4 days", using the top-ranked option's deadline.
2. **What happened.** A one-line consequence chain built from the trigger event and the engine's
   fuel trace: "L2-C104 delayed to 7 Feb › Misses vessel cutoff 4 Feb › Cargo excluded by vessel
   cutoff › Fuel 92.0 of 132.0 kL = 0.697, RED › Maitri RED › F-27 at risk". "Show the math" opens
   the existing trace drawer on Fuel.
3. **Options.** One comparison table with the options as columns and the same rows for each:
   Restores GREEN? · Fuel after (margin, ratio, state) · Last date to act · Slack · Cost
   (synthetic) · Data confidence · What it does.
   - Rows where the options differ are emphasised.
   - Rows that are identical across all options are merged into one cell marked "All options".
   - The top option shows "Engine ranking 1" with the ranking rule's reason.
   - Choosing an option is a native radio group.
   - Lever codes are plain names ("Hold vessel", "Partial airlift").
4. **Deadlines.** A per-lever timeline on an ISO-date axis. It runs from today (or the earliest
   date) to the latest cutoff, with padding. Today and the PNR run through every row. All text
   sits beside the bars, never on them.
5. **Decision bar** (sticky):
   - the selected option;
   - a verify checkbox, shown only when the option needs it, naming the input ("I have verified
     the fuel count (36 h old) and the L2-C104 ETA report (aging, 0 d slack) with the station");
   - "Reject" (inline required reason, then "Reject decision");
   - "Approve option (a): Hold vessel".
   Controls a role can't use are disabled with the reason printed.
6. **Approval confirmation** (Approve only). It lists:
   - what will be recorded, taken from the same `LEVER_ACTIONS` table the server uses ("MV Ice
     Star departure moves to 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)");
   - the expected result ("Maitri fuel 0.697 → 1.061, GREEN");
   - who it is recorded as ("HQ Ops on HQ-WEB-01").
7. **Why the engine says this.** Collapsed by default. It shows the trace as grouped readable
   steps (Inputs, Calculation, Result), and each step expands to the engine's verbatim line.

### Decided (approved, rejected, expired)

1. **Outcome first.** "Approved option (a): Hold vessel", by whom, at what sim time, and whether
   inputs were verified. A rejection shows its reason. Expired reads "Expired: no option was
   approved before the point of no return, 3 Feb." An approval still in this device's outbox says
   "Approved on this device · waiting to send."
2. **What it did.** The follow-up events the approval produced. For levers that only act inside
   the engine it says what was applied ("Partial airlift (+12.0 kL) and conserve diesel (saves
   8.0 kL) applied to the fuel calculation."). Below that, "Station at approval (recomputed from
   the log)" sits beside "now".
3. **Options at the time of proposal (24 Jan).** The same table, collapsed and labelled as
   history. The approved option is marked and there is no countdown.

### States handled explicitly

- Awaiting.
- Approved or rejected, and waiting to send.
- Refused by HQ: "Refused by HQ: <reason>. Still awaiting a decision." The decision bar is
  available again.
- Expired.
- Approved and rejected.
- Read-only role, disabled with the reason.
- Offline: the approval is written as an event and the link note says so.

## Rules applied

- **One value rule.**
  - While a decision is awaited, every option value (ratio, margin, state, straddle, verify,
    slack, deadlines, ranking) comes from the live engine for `decision.node_id`. Option identity
    is matched by levers, and the table is labelled "Values as of now · proposed 24 Jan 08:11".
  - Once decided, values come only from the `DECISION_PROPOSED` payload.
  - This replaces the old mix, where band and verify were live while ratio and state were recorded.
- **`decision.node_id` everywhere,** instead of the viewer's focus station.
- **Actor labels.** The role alone when no real device is recorded; "HQ Ops on HQ-WEB-01" when
  one is. `DIRECTOR` and `SERVER` are never shown. This applies to approvals, rejections and the
  trigger line.
- **Station at approval.** The engine on events observed before the approval, with the approval
  and its follow-ups excluded, evaluated at `decided_at`. When that isn't possible (for example
  an approval still waiting to send), the page falls back to the chosen option's recorded ratio,
  labelled "Expected at proposal".
- **Formatting.** Every number goes through `format/`. New helpers are in `format/decision.ts`
  (tests in `decision.test.ts`): lever names, lifecycle phase, verify-input parser, comparison
  rows, ranking reason, actor label, consequence chain, follow-up sentences, deadline headline and
  lever axis. The screen's data comes from `live/decisionView.ts`, with tests covering season48
  and aurora2016.
- **`mergeVerify`** now deduplicates by input. Aurora showed "Fuel count 0h old" and "Fuel count
  112h old" together before.

## Removed

- "AI explain" and "Print brief" (neither had a handler; "AI explain" broke the copy rules).
- The raw monospace inline trace, the old option cards, the greyed "Expired" cards and "No point
  of no return in the proposal".
- The hatched lead-time bars (the hatch is reserved for CRITICAL).
- The unused `TraceList`, `TraceStep`, `CascadeAnimation`, `TraceFormula`, `PrintBriefButton`,
  `DecisionCard`, `DecisionQueue`, `OptionCard`, `VerifyGate` and `LeverWindow`.

The signed-out `/screens` reference (`/decisions/DEC-01?moment=…`) now renders the same screen
from the season48 Director script replayed locally through the engine (`live/beatReplay.ts`),
instead of the old hand-written fixtures.

## Deviations and notes

- **The table replaces option cards.** CLAUDE.md 9.3 describes option cards with a 28 px ratio.
  This task asked for a comparison table with options as columns, so the ratio sits under the
  margin in body size. The 28 px mono size is used for the deadline date in the header.
- **Expired follows the agreed definition:** past the PNR, or past every option deadline when
  there is no PNR. If a partial option's deadline fell after the PNR, the server would still
  accept it after the page calls the decision expired. That doesn't happen in the current
  scenarios.
- **An option the live engine no longer offers** (while still awaiting) shows unknown values and
  cannot be approved, with the reason printed. This is the conservative reading.
- **Online rejections are stored by the server as device `SERVER`,** so they show the role only.
- **The top-bar PNR pill stays up after a rejection.** It comes from the engine's station PNR
  (chrome), not from the decision. Out of scope here.
- **The signed-out reference renders the decision bar,** but its buttons do nothing there.

## Verification

- `pnpm typecheck && pnpm test` pass after every commit: web 149, server 127, engine 97, store
  38, map 19. The golden tests are unchanged.
- Season48 beats 1–11 ran twice (1440×900 and 1280×720) and aurora2016 A0–A12 ran twice, all
  beats done, with 0 page errors. The signed-out reference moments also had 0 page errors.

Screenshots are in `docs/ui-redesign/after-decision/` (git-ignored), each at 1440×900 and
1280×720 unless noted:

| State | File |
|---|---|
| season48 after beat 2 (awaiting, fresh data) | `season48-after-2-*.png` |
| HQ at 25 Jan 16:00 before sync (verify checkbox) | `season48-after-8-*.png` |
| Approval confirmation | `season48-approval-modal-*.png` |
| After approval (decided layout) | `season48-end-*.png` |
| HQ approval made offline, waiting to send | `season48-waiting-to-send-*.png` |
| Reject with reason (form, then result) | `season48-reject-reason-*.png`, `season48-rejected-*.png` |
| aurora2016 awaiting, no PNR (A7) | `aurora2016-after-A7-*.png` |
| aurora2016 end (DEC-AGROUND approved, options collapsed) | `aurora2016-end-*.png` |
| aurora2016 end, history opened (1440 only) | `aurora2016-end-history-open-1440x900.png` |
| Signed-out reference moments (1440 only) | `screens-reference-*-1440x900.png` |
