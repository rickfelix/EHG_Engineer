# Tier-floor enforcement census

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001
**Last Updated**: 2026-08-29
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

| File | Line | Symbol | Posture | Note |
|---|---|---|---|---|
| `lib/coordinator/dispatch.cjs` | 806 | `assertWorkerTierAllowed` | **enforcing** | Calls `tierRankVerdict(workerRank, minRank)` unconditionally in the WORK_ASSIGNMENT dispatch path; throws `DISPATCH_ABOVE_WORKER_TIER` on refusal. |
| `lib/fleet/claim-eligibility.cjs` | 351 | `tierAxes` | **enforcing** | Calls `tierRankVerdict` via `ctx.worker_tier_rank`/`ctx.tiering_active`; one of the `INELIGIBILITY_AXES` consumed by `classifyDispatchIneligibility`. ctx-gated: no-ops if `ctx.tiering_active !== true`. |
| `lib/fleet/tier-claimable.cjs` | 100 | `claimableForTier` | **enforcing** | Filters via `tierBlocks()`, which force-passes `tiering_active:true` so an explicit per-SD floor is honored even with tiering globally off. |
| `scripts/sd-start.js` | — | (claim primitive) | **non-enforcing** | Zero tier code as of SD authoring (`grep -c tier` = 0). The atomic claim primitive a worker calls by SD key — bypasses every other gate. **Wired to enforce by this SD (FR-2).** |
| `scripts/lib/claimable-leaves.mjs` | 57 | `claimableDbFreeReason` | **deferred** | Calls `classifyDispatchIneligibility(d)` with NO ctx — tier axis provably inert. In-code comment cites `SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001` FR-5 as a deliberate LEAD-approved deferral. **This SD is the deferred decision landing (FR-2).** |
| `lib/checkin/steps/merged-pool-self-claim.cjs` | 100 | (merged-pool self-claim lane) | **enforcing** | Reads `ctx.tierCtx.worker_tier_rank`/`.tiering_active`, passes into `classifyDispatchIneligibility`/`tierBlocks`. Already threaded via `SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001`. |
| `scripts/worker-checkin.cjs` | 1080 | `recoverStrandedFinal` | **enforcing** | Independent `tierBlocks(sd, tierCtx.worker_tier_rank, tierCtx.tiering_active)` call, distinct from the earlier `classifyDispatchIneligibility` call in the same function (which runs with NO tierCtx and is inert) and distinct from QF-20260829-186's phase-filter widening (same function, different defect class). |

## Non-enforcing / writer surfaces (recorded so they are not mistaken for gaps)

| File | Line | Symbol | Posture | Note |
|---|---|---|---|---|
| `lib/fleet/dispatch-suggestions.cjs` | 46 | `candidateFitScore` | **non-enforcing (advisory-by-design)** | Header comment states ADVISORY ONLY, never assigns. Reads `min_tier_rank` purely to rank suggestion fit. |
| `scripts/assign-fleet-identities.cjs` | 545 | (cron writer) | **writer** | The authoritative cron writer of `claude_sessions.metadata.tier_rank` — the write-path FR-4's stamp re-baseline targets. |
| `lib/sd-creation/pipeline.js` | 1096 | (mint-time stamp call site) | **writer** | Calls `stampPayloadForCreation()` (`lib/fleet/sd-tier-rank.mjs`) at SD creation time. The write-path FR-5's mint-time advisory-by-default policy targets. |

## Shared predicate today (partial)

`tierRankVerdict(workerTierRank, minTierRank)` (`lib/fleet/tier-ladder.cjs:381`) is the one shared
low-level comparison, consumed today by `dispatch.cjs` and `claim-eligibility.cjs` directly, and
transitively by `tier-claimable.cjs` via `classifyDispatchIneligibility`. `sd-start.js` and
`claimable-leaves.mjs` bypass the whole stack — the gap FR-2 of this SD closes.

## Sweep result

Repo-wide sweep (excluding test files, which reference these fields extensively and are expected)
found no additional production surface beyond the rows above. Investigation-scratch scripts under
`.artifacts/` (Adam/Solomon's own sourcing work for this exact SD) were excluded as non-production.
