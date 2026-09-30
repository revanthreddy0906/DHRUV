# Phase 3 — Inventory preview and plausibility guard (plus spec changes)

Branch `ui/polar-light`. `pnpm typecheck && pnpm test` passes after every commit: 321 tests
(engine 97, server 122, store 38, map 19, web 53). Per the 28 Sep priorities, only 3.1's preview and
guard were in scope. The rest of 3.1 (table, labels, correction link), 3.2 and 3.3 are stretch and
not started.

## Spec changes applied first

| Change | Commit | Summary |
|---|---|---|
| Ratio display (section 6) | `193c565` | Values are rounded half up to 3 decimals. When the rounded value would land in a different band than the engine value (bands from the engine's config thresholds), they are truncated instead. Maitri fuel after the slip now reads 0.697 in the Station table and in the what-if drawer. All six requested cases are tested. |
| Needs attention order (section 8) | `745c1d5` | Pending decisions; incidents and safety conflicts; RED states; CRITICAL data; AMBER states; milestones; refused events; STALE data. Ties go by earliest deadline, undated last. Every unresolved conflict flag counts as a safety conflict, because the engine gates on each one (R15). |

Both CLAUDE.md files (root and `docs/ui-redesign/`) are identical and carry these changes. Two
stale lines were also corrected:
- the section 9.4 preview example (its `1.041 · stays GREEN` was AMBER by the engine's thresholds);
- the "Decisions recorded" note on screenshots, which are now gitignored.

## What changed

| Item | Commit | Summary |
|---|---|---|
| Consequence preview | `92b1dc5` | Once item, action and quantity are valid, the stock form shows "If recorded: Diesel 92.0 → 89.5 kL · fuel ratio 1.061 → 1.042 · turns AMBER". It is amber or red when the state gets worse. `previewConsequence` runs the what-if path, `evaluate({ seed, events: [...events, overlay] }, now)`, with the draft `STOCK_*` event as the overlay. It is debounced 200 ms and nothing is written. It is tested against the engine: 1 kL stays GREEN, 2.5 kL and 10 kL turn AMBER, a food count of 3 turns RED. |
| Plausibility guard | `62a18e8` | A Count that is more than 50 % off the engine's derived stock (`COUNT_PLAUSIBILITY_MAX_CHANGE` in `ui-config.ts`), or 0 for an item with a requirement, replaces Submit with "This count is 99.97 % lower than the recorded 8,900 person-days. Record 3 person-days anyway?" and Confirm / Edit. Editing any field clears it. The confirmed event is the same `STOCK_COUNTED` through `useEventWriter`. |

## Verified

- Season 48 beats 1–11 and Aurora A0–A12 both complete, scripted across four tabs.
- The food-count flow now passes through the guard. After Confirm, Command shows "Maitri is RED: food
  short 8,277 person-days." with no all-clear text.
- Screenshots are in `docs/ui-redesign/after-phase3/`, ignored by git.

## Notes

- The preview line keeps the spec's two `·` separators, which go past section 6's one-per-line
  guideline because the spec gives this exact format.
- The Submit label is still "Submit". Action-named buttons ("Record count") are part of the
  stretch labels item.
- The inventory table still shows 4-decimal ratios; the section 9.4 table is stretch.

## Open

- Section 2 item 9: the rule text was not in the request again. It read "[the rule block from my
  message]", so the item has not been added.
