# Portfolio Review Cadence (board-as-cadence)

**SD**: SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-C · **Status**: live cadence, deferred staffing

## What runs

A weekly `portfolio_review` round registered in `lib/eva/eva-master-scheduler.js`
(`_registerDefaultRounds()`), handled by `scripts/eva/portfolio-review-round.mjs`.
Liveness is supervised by the existing `eva-scheduler-watcher` GHA cron; cadence
state persists via `eva_scheduler_heartbeat` rehydration. No separate cron layer.

Each run:

1. Reads the chairman-governed portfolio-strategy artifact
   (`eva_vision_documents`, `vision_key='VISION-PORTFOLIO-STRATEGY-001'`, Child A)
   via `loadPortfolioStrategy()`. A missing/inactive artifact degrades to a packet
   that names the gap — it never blocks the loop.
2. Reads venture state (`ventures`, active only, synthetic/demo rows excluded by
   `isRealVenture()` until SYNTHETIC-DATA-HYGIENE-001 lands a trustworthy flag).
3. Produces **exactly ONE** pending chairman decision packet per cadence window
   (7 days, idempotent on re-run) via the canonical
   `lib/chairman/record-pending-decision.mjs` writer
   (`decision_type='portfolio_review'`).
4. Upserts a durable review record into `management_reviews` with
   `review_type='ad_hoc'` and `decisions.kind='portfolio_review'` as the row
   marker. (The `review_type` CHECK allows only `weekly|monthly|ad_hoc`; a
   dedicated `portfolio` value requires chairman-gated DDL and is deferred.
   `weekly` is not usable — `UNIQUE(review_date, review_type)` would collide
   with the weekly management review row on the same date.)

Manual trigger: `node scripts/eva/portfolio-review-round.mjs [--dry-run]`
(`--dry-run` composes and prints the packet with zero writes).

## Governing invariant

**Board proposes, chairman decides.** The round writes only a *pending* packet
with the board's proposal in the `recommendation` enum
(`proceed/pivot/fix/kill/pause`) and the review brief in `brief_data`.
Chairman-only columns (`decision`, disposition timestamps) are never written by
this cadence.

## Staffing: DEFERRED

Staffed board-agent roles are **not** created by this SD — the org-template audit
showed agent-rows-before-substance is decor (e.g. LEGAL_COMPLIANCE executing
nothing on a normal day).

- **Trigger to staff**: 2+ live-revenue ventures in the portfolio.
- **Requirement when built**: every staffed role ships with idle-handling
  (`duty_cycle` / `honest_idle`) so idle roles are cheap and honest, not decor.
- Until then, the packet's "Venture-CEO Org State" section states the deferral
  explicitly. (Chairman build-vs-instantiate correction, 2026-07-16: build + run
  the cadence now; park only the staffed roles.)
