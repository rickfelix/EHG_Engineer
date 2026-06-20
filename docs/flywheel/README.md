---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, vision, roadmap, sourcing, fleet, governance, end-to-end]
---

# The EHG Flywheel — End-to-End System Map

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** This is the first attempt at a single, canonical,
> end-to-end map of the EHG self-improving system, from the North Star down to a worker
> claiming an SD off the belt, and the feedback loops back up. Component docs already
> existed (see the cross-links per link); this set is the *connective tissue* that ties
> them together. Every claim here is grounded in code / DB read on 2026-06-20; items that
> are aspirational or not-yet-built are flagged inline as **[NOT-YET]** or **[DORMANT]**.

## What this is

EHG runs as a **flywheel**: the Chairman's intent flows *down* through a vision ladder,
a roadmap, a backlog, a sourcing engine, a coordinator, and a fleet of workers that build
and ship; the work and lessons flow *back up* to advance the rungs and sharpen the system —
so the next turn starts from a higher baseline. This document is the index/overview; each
**link** in the chain has a detail doc in this folder.

The system has **two layers**, and this map covers both and their seam:

- **The LEO Harness** (this repo, `EHG_Engineer`) — the multi-agent machine that decides
  *what to build next* and ships it (coordinator + Adam + workers + the DB-as-session-log).
- **The EHG Product** (`rickfelix/ehg`) — the actual venture/EVA/Chairman-UI/cockpit
  application the harness builds.

> **[Gap — promotion has no target-repo routing]** Promotion via `leo-create-sd --from-roadmap-item`
> provides no way to set the target repo (no `--target-repos` flag; `deriveSdFieldsFromRoadmapItem`
> sets no `target_application`), so EHG-product roadmap items (Waves 2/3/4) default to the harness
> repo and cannot be promoted to `rickfelix/ehg`. Nothing FORBIDS EHG (`ALLOWED_REPOS` includes it) —
> there is simply no ROUTING mechanism. Detail + the product-promotion-pipeline fix:
> [04-roadmap-waves.md](04-roadmap-waves.md) and [06-adam-sourcing.md](06-adam-sourcing.md).

> **Two concurrent build fronts today.** Both the LEO Harness and the EHG Product are
> actively being built right now. "Taper the harness" is a **future** condition (net-new
> harness work naturally thins as the harness matures, gated on rung-advancement) — **not**
> a directive to stop harness work and pivot to product today. See
> [progression-gate.md](progression-gate.md).

## The flywheel (ASCII map)

```
                          ┌────────────────────────────────────────────────┐
                          │            CHAIRMAN (human, solo)                │
                          │   intent · ideation · rung activation · the rare │
                          │   ❓decision · kill authority                     │
                          └───────────────┬──────────────────────▲──────────┘
                                          │ governs by exception  │ exec-summary email
                                  (DOWN: what to build)           │ (the recurring status surface)
                                          ▼                       │ (15) ← all gauges/forecasts
   ┌─────────────────────────────────── STRATEGY LAYER ──────────┴──────────────────────────┐
   │ (1) NORTH STAR ........... $18k/mo net, 6 mo · 10+ validated businesses (north_star)     │
   │        │                                                                                 │
   │        ▼                                                                                 │
   │ (2) VISION LADDER ........ V1 Foundation → V2 Earning → V3 Outcomes                       │
   │        │                   (vision_ladder_rungs.is_active · vision_ladder_criteria)       │
   │        │                   buildable vs operational nature (lib/vision/vdr-registry.js)   │
   │        ▼                                                                                 │
   │ (3) OKRs / KEY RESULTS ... measure outcome-rung (V2/V3) progress (key_results)           │
   │        │                                                                                 │
   │        ▼                                                                                 │
   │ (4) ROADMAP → WAVES ...... strategic_roadmaps + roadmap_waves (time_horizon now/next/    │
   │        │                   later → V1/V2/V3) + roadmap_wave_items                         │
   └────────┼─────────────────────────────────────────────────────────────────────────────┘
            ▼
   ┌─────────────────────────────────── SUPPLY LAYER ───────────────────────────────────────┐
   │ (5) BACKLOG INTAKE ....... conversion_ledger ← todoist/youtube/brainstorm/estate/        │
   │        │                   harness_backlog feedback/deferred SDs → roadmap_wave_items     │
   │        ▼                                                                                 │
   │ (6) HOW ADAM SOURCES ..... route the roadmap SSOT (not hand-mine); propose-only (CONST-   │
   │        │                   002); D1 proactive sourcing (CLAUDE_ADAM.md / section 607)     │
   │        ▼                                                                                 │
   │ (7) AUTOMATED BELT FEED .. sourcing engine [2 CRONS ACTIVE in CI] — proactive-populator +  │
   │        │                   dispositionGate + router/lane; deferred-watcher + gauge-gap-    │
   │        │                   miner crons; promotion via leo-create-sd --from-roadmap-item    │
   └────────┼─────────────────────────────────────────────────────────────────────────────┘
            ▼
   ┌────────────────────────────── EXECUTION LAYER ─────────────────────────────────────────┐
   │ (8) BELT → COORDINATOR → FLEET ..... claimable-SD queue ("belt") → coordinator dispatch   │
   │        │                            → worker claim; capacity forecaster / belt-low detect  │
   │        ▼                                                                                  │
   │ (9) LEO EXECUTION .................. LEAD → PLAN → EXEC · gates · handoffs · sub-agent      │
   │        │                            evidence (CLAUDE*.md / leo_protocol_sections)          │
   │        ▼                                                                                  │
   │     SHIPPED PR  ───────────────────────────────────────────────────────────────────────┐ │
   └────────┼────────────────────────────────────────────────────────────────────────────┘ │ │
            ▼                                                                                │ │
   ┌────────────────────── MEASUREMENT / STEERING LAYER ────────────────────────────────────┐ │
   │ (10) VDR BUILD GAUGE ..... active-rung completion, per-nature (computeBuildGauge)        │ │
   │ (11) PRIORITIZATION ...... needle-movement rank (active-rung-first) (needle-priority)    │ │
   │ (12) FORECASTING ......... build-completion ETA off the wave estate (build-completion-   │ │
   │        │                   forecast.mjs)                                                 │ │
   └────────┼────────────────────────────────────────────────────────────────────────────┘ │
            │  these three feed (8) prioritization AND (15) the chairman email ──────────────┘ │
            ▼                                                                                   │
   ┌────────────────────── FEEDBACK / LEARNING LOOP ────────────────────────────────────────┐ │
   │ (13) RETRO / LEARN / HEAL / SIGNAL → harness_backlog → (5) intake (closes the loop)       │ │
   │        adam_adherence convergence metric · shipped work + lessons advance the rungs ──────┘ │
   └─────────────────────────────────────────────────────────────────────────────────────────┘
   ┌────────────────────── GOVERNANCE / CHAIRMAN CONTROL (wraps everything) ─────────────────┐
   │ (14) rung activation (V1→V2 flip) · authorization gates (migrations, destructive ops,     │
   │      populator chairman-approval) · chairman decision surfaces                            │
   └───────────────────────────────────────────────────────────────────────────────────────┘
```

## The links (per-link summary + detail-doc cross-links)

Each row: the link, its one-line role, its **source of truth** (verified), a coverage note,
and the detail doc. Coverage ratings are in [doc-inventory.md](doc-inventory.md).

| # | Link | Role (one line) | Source of truth (verified 2026-06-20) | Detail doc |
|---|------|-----------------|----------------------------------------|------------|
| 1 | **North Star** | The terminal target everything points at | `north_star` table (1 row, `status=chairman_ratified`): **$18k/mo net, sustained 6 mo**; leading sub-target **10+ validated businesses** | [01-north-star.md](01-north-star.md) |
| 2 | **Vision Ladder** | Ordered rungs V1→V2→V3; the active rung is what we build now | `vision_ladder_rungs` (3 rows; **V1 active**, V2/V3 inactive) + `vision_ladder_criteria` (26 rows); `nature` (buildable/operational) in `lib/vision/vdr-registry.js` | [02-vision-ladder.md](02-vision-ladder.md) |
| 3 | **OKRs / Key Results** | Measure outcome-rung (V2/V3) progress | `key_results` (43 rows), `sd_key_result_alignment` (73 rows), `roadmap_waves.okr_objective_ids` | [03-okrs-key-results.md](03-okrs-key-results.md) |
| 4 | **Roadmap → Waves** | Sequence the rungs into executable waves; encode time_horizon→rung | `strategic_roadmaps` (2), `roadmap_waves` (12; `time_horizon` now/next/later → V1/V2/V3 via `RUNG_BY_HORIZON`), `roadmap_wave_items` (728) | [04-roadmap-waves.md](04-roadmap-waves.md) |
| 5 | **Backlog Intake** | Funnel raw ideas into the roadmap | `conversion_ledger` (624) ← todoist/youtube/brainstorm/estate/harness_backlog/deferred → `roadmap_wave_items` | [05-backlog-intake.md](05-backlog-intake.md) |
| 6 | **How Adam Sources** | Route the SSOT first; propose-only | `CLAUDE_ADAM.md`; `leo_protocol_sections` id=607 (`adam_role_contract`) "SOURCING SSOT — order of operations" | [06-adam-sourcing.md](06-adam-sourcing.md) |
| 7 | **Automated Belt Feed** | The engine that fills the belt without a human | `lib/sourcing-engine/*` (router, lane, proactive-populator, dedup-autostamp, register-first); deferred-watcher + gauge-gap-miner crons **ACTIVE in GitHub Actions** (local env-probe shows a false "dormant" — see 07) | [07-sourcing-engine.md](07-sourcing-engine.md) |
| 8 | **Belt → Coordinator → Fleet** | Dispatch claimable SDs to live workers | `lib/coordinator/*`, `scripts/fleet-dashboard.cjs`; `docs/protocol/*`; `claude_sessions`, `session_coordination` | [08-belt-coordinator-fleet.md](08-belt-coordinator-fleet.md) |
| 9 | **LEO Execution** | One worker builds one SD LEAD→PLAN→EXEC | `CLAUDE.md`, `CLAUDE_CORE/LEAD/PLAN/EXEC.md`, `leo_protocol_sections`; `sub_agent_execution_results` | [09-leo-execution.md](09-leo-execution.md) |
| 10 | **VDR Build Gauge** | "% built" of the active rung, per-nature | `computeBuildGauge` (`lib/vision/vdr-registry.js`), `vision_build_gauge` table (latest **55% overall, available**) | [10-vdr-build-gauge.md](10-vdr-build-gauge.md) |
| 11 | **Prioritization** | Order work active-rung-first, highest-impact-first | `lib/vision/needle-priority.mjs` + coordinator backlog rank + unlock score | [11-prioritization.md](11-prioritization.md) |
| 12 | **Forecasting** | ETA to 100% of the buildable scope | `lib/vision/build-completion-forecast.mjs` (+ `build_completion_forecast_log` — APPLIED 2026-06-20, ETA line live) | [12-forecasting.md](12-forecasting.md) |
| 13 | **Feedback / Learning** | Lessons + shipped work flow back up | retro/learn/heal/signal → `feedback` (`category=harness_backlog`); `adam_adherence_ledger` (72) | [13-feedback-learning.md](13-feedback-learning.md) |
| 14 | **Governance / Chairman Control** | Rung activation + authorization gates | `docs/governance/chairman-decision-surfaces.md`; `vision_ladder_rungs.is_active`; migration/destructive-op gates | [14-governance.md](14-governance.md) |
| 15 | **Executive Summary Email** | The Chairman's recurring status surface (reuses 10+12) | `scripts/adam-exec-summary.mjs` (cron `adam-exec-email-cron.yml`) | [15-executive-summary-email.md](15-executive-summary-email.md) |

## Cross-cutting docs

- **[progression-gate.md](progression-gate.md)** — *How we know what to build next.* The
  V1→V2→V3 progression is **already encoded** in the roadmap/vision ladder; the "milestone
  gate" for shifting the fleet's build front is the existing ladder position + chairman-
  controlled rung activation, **not** an invented metric. Two concurrent build fronts today.
  **Read this if you read nothing else.**
- **[doc-inventory.md](doc-inventory.md)** — per-link coverage audit (good/partial/none) +
  the confirmed gap list + canonical-home recommendation.

## How to read this set

1. New to EHG? Read this README top-to-bottom, then [progression-gate.md](progression-gate.md).
2. Want the down-flow (strategy → work)? Links 1 → 8 in order.
3. Want the up-flow (steering & learning)? Links 10 → 13, then back to 5.
4. Want a specific component? Jump to its detail doc via the table above.

## Honesty ledger (what is live vs aspirational, as of 2026-06-20)

| Claim | State |
|-------|-------|
| North Star is a queryable, chairman-ratified DB record | **LIVE** (`north_star`, 1 row) |
| V1 is the active rung; V2/V3 inactive | **LIVE** (`vision_ladder_rungs.is_active`) |
| Build gauge computes and is available | **LIVE** (latest 55% overall) |
| Sourcing engine is built (10/10 children) | **LIVE (built) + 2 CRONS ACTIVE** — the deferred-watcher + gauge-gap-miner staging crons are registered with flags ON in GitHub Actions (commit 4ba41115 / PR #4933), armed as of 2026-06-20 (not yet observed firing; `workflow_dispatch` confirms). A **local** `process.env` flag probe reports a **false "dormant"** because it cannot see the workflow env (a known gap). The 4 umbrella `SOURCING_*` flags are display/registry only. Activation runbook: `docs/sourcing-engine-activation-runbook.md`. |
| `build_completion_forecast_log` persistence | **APPLIED 2026-06-20** (chairman-authorized, `[MIGRATION_APPLY_PROD_PASS]`, additive-only); first row persisted → exec-email ETA line now renders (`2026-07-16, ~26d, sourcing-bound, low`). Forecast computes regardless; line omitted only if the table ever has no rows |
| Two roadmap structures coexist in `roadmap_waves` | **LIVE** — an older Wave 1-6 "Engineering" set (`time_horizon=null`) and a newer rung-aligned now/next/later set; see [04-roadmap-waves.md](04-roadmap-waves.md) |
| V2/V3 rungs have shipped capabilities | **[NOT-YET]** — by design; V1 precedes V2 |
