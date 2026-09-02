# Tier-floor enforcement census

**Category**: Reference
**Status**: Approved
**Version**: 1.1.0
**Author**: SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001; posture/line-pins corrected by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001
**Last Updated**: 2026-09-02
**Tags**: tiering, fleet, dispatch, claim, provenance

## Purpose

Enumerates every code surface that reads or should read `min_tier_rank` / `tier_rank`, recording
enforcing, non-enforcing, deferred, and writer surfaces so the fleet's tier-floor policy has a
single, verified representation instead of drifting silently. Generated and re-verifiable via
`node scripts/tier-floor-census.mjs`.

## Sweep command

```bash
node scripts/tier-floor-census.mjs
```

Runs `git grep -n -E 'min_tier_rank|tier_rank|tierRank' -- '*.js' '*.cjs' '*.mjs'` and diffs the
hit set against the known-surfaces table below. The census is closed only when the sweep finds no
production file outside this table (test files are expected and excluded from "unrecognized").

## Enforcement surfaces

**CORRECTED 2026-09-02 (SD-FDBK-INFRA-RETIRE-SEAT-TIER-001)**: every row below marked "enforcing" as
of 2026-08-29 was retired to advisory-only by QF-20260831-419 (landed 2026-08-31, one day after this
doc). Postures and line pins below reflect current main. Two rows (`claim-eligibility.cjs` `tierAxes`
and `merged-pool-self-claim.cjs`) are only *partially* advisory — each also holds still-genuinely-
enforcing branches for OTHER, differently-named rulings (fenced, not part of this retirement). See
`chairman_ratifications` row `20dc072b` for the full retirement order.

| File | Line | Symbol | Posture | Note |
|---|---|---|---|---|
| `lib/coordinator/dispatch.cjs` | 868 | `assertWorkerTierAllowed` | **advisory** | RETIRED by QF-20260831-419: both throw branches now `log.info` and fall through, no throw remains. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001. |
| `lib/fleet/claim-eligibility.cjs` | 366 | `tierAxes` | **advisory (partially)** | The `above_worker_tier`/`tier_stamp_missing`/`reserved_no_lower_backlog` branches are advisory-only. The SAME function also holds `fable_window_downward_claim_blocked` (:394-404, ruling QF-20260709-881) and `unverified_seat_capability` (:390-392, ruling FLEET-MODEL-REGISTRY-001 FR-6), which are **still enforcing** and fenced from this retirement. |
| `lib/fleet/tier-claimable.cjs` | 108 | `claimableForTier` | **advisory (dead by construction)** | Filters via `tierBlocks()`, which now compares against verdict strings `tierAxes` no longer emits — always returns `false`. Slated for deletion. |
| `scripts/sd-start.js` | 274 | `enforceTierGate` | **advisory (dead by construction)** | Sole gating call is to the now-inert `tierBlocks()`. Slated for deletion. |
| `scripts/lib/claimable-leaves.mjs` | 57 | `claimableDbFreeReason` | **deferred** | Calls `classifyDispatchIneligibility(d)` with NO ctx — tier axis provably inert. In-code comment cites `SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001` FR-5 as a deliberate LEAD-approved deferral, **re-confirmed by this SD as still correctly categorized** (belt gauge is tier-DISPLAYED, not tier-FILTERED, by design) — not a gap. |
| `lib/checkin/steps/merged-pool-self-claim.cjs` | 100 | (merged-pool self-claim lane) | **advisory (tier-rank axis dead; still feeds live fenced axes)** | Reads `ctx.tierCtx.worker_tier_rank`/`.tiering_active` into the now-inert `tierBlocks`. Lines :118 (`reservations`) and :140-144 (`fable_window_active`) still produce ctx consumed by the live fenced mechanisms above — fenced from deletion. |
| `scripts/worker-checkin.cjs` | 1116 | `recoverStrandedFinal` | **advisory (dead by construction)** | `tierBlocks(sd, tierCtx.worker_tier_rank, tierCtx.tiering_active)` call is inert. A second call site exists in `adoptOrphanInProgress` at :1444. Slated for deletion. |

## Non-enforcing / writer surfaces (recorded so they are not mistaken for gaps)

| File | Line | Symbol | Posture | Note |
|---|---|---|---|---|
| `lib/fleet/dispatch-suggestions.cjs` | 46 | `candidateFitScore` | **non-enforcing (advisory-by-design)** | Header comment states ADVISORY ONLY, never assigns. Reads `min_tier_rank` purely to rank suggestion fit. |
| `scripts/assign-fleet-identities.cjs` | 545 | (cron writer) | **writer** | The authoritative cron writer of `claude_sessions.metadata.tier_rank` — the write-path FR-4's stamp re-baseline targets. |
| `lib/sd-creation/pipeline.js` | 1096 | (mint-time stamp call site) | **writer** | Calls `stampPayloadForCreation()` (`lib/fleet/sd-tier-rank.mjs`) at SD creation time. The write-path FR-5's mint-time advisory-by-default policy targets. |

## Shared predicate today (partial)

`tierRankVerdict(workerTierRank, minTierRank, opts)` (`lib/fleet/tier-ladder.cjs`) is the one shared
low-level comparison — now provenance-aware (FR-3, ruling 1B) — consumed today by `dispatch.cjs`
and `claim-eligibility.cjs` directly, and transitively by `tier-claimable.cjs` and (as of FR-2)
`sd-start.js` via `tierBlocks()`/`classifyDispatchIneligibility()`. `claimable-leaves.mjs` remains a
deliberate, re-confirmed deferral (belt gauge is tier-displayed, not tier-filtered) — the only real
gap FR-2 closed was `sd-start.js`.

## Sweep result

Repo-wide sweep (excluding test files, which reference these fields extensively and are expected)
found no additional production surface beyond the rows above. Investigation-scratch scripts under
`.artifacts/` (Adam/Solomon's own sourcing work for this exact SD) were excluded as non-production.

## Retirement status (2026-09-02)

Per chairman ratification `20dc072b`, SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 deletes the dead
enforcement code paths marked "advisory (dead by construction)" above. `tier_rank`/`min_tier_rank`
data stamps and their writer surfaces are NOT removed — the fenced still-enforcing mechanisms above
continue to read them for unrelated rulings.
