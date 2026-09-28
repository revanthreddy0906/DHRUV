# Fix: stale data shown after a server reset (Decisions flip)

Branch `fix/stale-epoch-render`, from `develop`. The changes are web-only, plus one approved
test-only change. Nothing under `packages/` changed. Under `apps/server`, only the one test file changed.

## The bug

A tab whose local store came from an earlier server run did two things wrong:
- It rendered that run's records straight away. `/decisions` also redirected to an old decision.
- It then flipped to "Decision DEC-01 is not on this device" once the first sync found the new epoch and cleared the store.

A Reset to Start pressed while HQ was on a decision caused the same flip. That is the live-demo
case: the Director is in the same browser.

## Commits

| Commit | What |
|---|---|
| `71e3c6a` | **Epoch-confirmation gate.** `DeviceProvider` exposes `dataConfirmed`. It becomes true on the first of:<br>• the first sync cycle finishing other than with a reset<br>• a bootstrap finishing<br>• the link being Offline or Degraded<br>• `DATA_CONFIRM_TIMEOUT_MS` (1500 ms, next to the gate)<br>Until then `Frame` shows "Checking this device's data…" in place of the screen, the PNR pill and the sidebar counts. `/decisions` does not choose where to redirect. |
| `cf22136` | **Reset wording.** While a reset's reload is in flight, Decision detail, the `/decisions` index and the Incident panel show "Refreshing after a server reset…". After the reload, a missing id reads "Decision DEC-01 is not part of the current run", with a link to `/decisions`. It no longer promises that a sync will bring it in. |
| `a550378` | **Test only.** In `offlineRoundTrip.test.ts`, the Director `timeoutMs` goes from 150 to 1000, and the test gets `{ timeout: 20_000 }`. The test now takes about 7.4 s instead of 1.4 s, because every Director ping waits the full window. |
| `9c5e30c` | **Found in verification.** While a saved session restores (the device lock is still pending), `useDevice()` is null. So `/decisions` showed the signed-out design fixture (a decision with a PNR pill), and `/` redirected to `/login`. The app now shows "Checking this device's data…" while restoring. |
| `e384ba2` | **Found in verification.** The reset was detected in an effect, one render late, so "not on this device" flashed for about 10 ms. The live-query callback now records the reset in the same render as the empty store. |

Each commit passed `pnpm typecheck && pnpm test`: 357 tests (engine 97, server 122, store 38, map 19, web 81).

Screens covered by the "Refreshing after a server reset…" line:
- **Decision detail and the `/decisions` index.**
- **Incident panel.**
- **Not covered:**
  - This branch has no Station page.
  - Cargo has no record-level not-found state; its loading state is unchanged.

## Verification

The runs used the audit scripts (`playwright-core`, headless Chrome). A `MutationObserver` in each
page recorded every distinct rendered state, so "never shown" includes states between polls.
Times are measured from opening the page, or from the reset.

**Case B: a stale store (old epoch) and a server reset from a separate browser context.** No
stale record was shown.

```
0.11 s  /decisions  blank
0.58 s  /decisions  Checking this device's data…
0.95 s  /decisions  Refreshing after a server reset…
0.96 s  /decisions  No decisions on this device yet   (new run, nothing proposed)
```

After beats 1–2 of the new run, the index redirected to the new DEC-01 and showed its detail.
Before the fix, the old DEC-01 detail and PNR pill showed for about 0.5 s, then "not on this device".

**Case A2: Director in the same context, reset while HQ is on DEC-01.** "Not on this device"
never appeared.

```
 1.83 s  Refreshing after a server reset…
 3.00 s  Decision DEC-01 is not part of the current run
12.16 s  DEC-01 detail   (after beats 1–2 of the new run)
```

**Offline Maitri reload:** the tablet was set Offline in the Demo dock, then reloaded.
- Content showed after 596 ms, including page load and session restore.
- "Checking…" was on screen for 0.25–0.56 s: the session restore plus the first local read.
- It made no `/state` or `/sync` requests, so it didn't wait on the network.

**Demo paths:** Season 48 beats 1–11 and Aurora A0–A12 completed across four tabs (Director, HQ,
Maitri, FT-3), with no page errors.

**Flaky test**
- Before the change it failed once more, on the first full `pnpm test` of this branch.
- 11 further runs passed, including 5 run straight after `pnpm typecheck`.
- The failure message was not captured.
- Since the change, every full run has passed.

## Notes

- **Offline after a reset.** If a Reset to Start clears a device's store while its link is
  Offline, "Refreshing after a server reset…" stays until the link returns. There is nothing local
  to show, because the store is empty.
- **"Not part of the current run" is used for the rest of the tab session** after a reset is seen.
  It applies to any decision id this device lacks. In the demo that is always the right wording.
  After a reload the tab uses the normal "not on this device" wording again.
