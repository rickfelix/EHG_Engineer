---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, audit, inventory, gap-analysis, recommendation]
---

# Flywheel Documentation Inventory, Gap List & Canonical-Home Recommendation

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)
>
> Deliverables A (inventory), B (gap list), and D (recommendation) of the documentation audit.
> All ratings reflect a read of code + DB + `docs/` on 2026-06-20.

## A. Doc inventory (per link)

Coverage legend: **good** = the component is well-documented somewhere; **partial** = touched but
not complete / not in flywheel context; **none** = no dedicated doc existed before this set.

| # | Link | Existing doc / code (exact paths) | Coverage (before this set) |
|---|------|-----------------------------------|----------------------------|
| 1 | North Star | `docs/reference/schema/engineer/tables/north_star.md`; `docs/04_features/ehg-northstar-contract-phase0.md`; `docs/vision/ehg-mission-vision-canonical.md`; `north_star` table; `lib/vision/north-star.js` | **good** (schema + prose); flywheel context **none** |
| 2 | Vision Ladder | `docs/vision/ehg-mission-vision-canonical.md`; `docs/vision/ladder-roadmap-coherence.md`; schema `vision_ladder_rungs.md`/`vision_ladder_criteria.md`; `lib/vision/vdr-registry.js`; `lib/vision/placement-rules.js` | **good** |
| 3 | OKRs / Key Results | schema `key_results.md`/`sd_key_result_alignment.md`/`okr_vision_alignment_records.md`; `database/migrations/20260104_okr_strategic_hierarchy.sql`; `lib/vision/rung-progress-rollup.mjs` | **partial** (schema + formula; not the "OKRs measure outcome rungs" framing) |
| 4 | Roadmap → Waves | schema `strategic_roadmaps.md`/`roadmap_waves.md`/`roadmap_wave_items.md`; `docs/vision/ladder-roadmap-coherence.md`; `lib/vision/rung-progress-rollup.mjs` | **partial** (schema; wave→rung mechanics + promotion **none**) |
| 5 | Backlog Intake | schema `conversion_ledger.md`; `docs/reference/brainstorm-metadata-convention.md`; `docs/reference/audit-to-sd-pipeline.md`; `lib/sourcing-engine/proactive-populator.js` | **partial** (no single "funnel" doc) |
| 6 | How Adam Sources | `CLAUDE_ADAM.md`; `leo_protocol_sections` id=601/604/606/607; `.claude/commands/adam.md`; `docs/protocol/coordinator-adam-comms.md`; `scripts/adam-startup-check.mjs` | **good** (role); flywheel context **partial** |
| 7 | Sourcing Engine | `docs/sourcing-engine-activation-runbook.md`; `docs/vision/ladder-roadmap-coherence.md`; `lib/sourcing-engine/*` (router/lane/proactive-populator/dedup-autostamp/register-first/...) | **partial** (runbook + forward-complement; no component/lane/flag map) |
| 8 | Belt → Coordinator → Fleet | `docs/protocol/README.md`; `docs/protocol/fleet-coordinator-and-worker-behavior.md`; `docs/protocol/fleet-worker-loop-directive.md`; `docs/reference/fleet-coordination.md`; `lib/coordinator/*`; `scripts/fleet-dashboard.cjs` | **good**; flywheel context **partial** |
| 9 | LEO Execution | `CLAUDE.md`; `CLAUDE_CORE/LEAD/PLAN/EXEC.md`; `leo_protocol_sections`; `docs/leo/*`; `docs/reference/validation-gate-registry.md` | **good** |
| 10 | VDR Build Gauge | schema `vision_build_gauge.md`; `docs/vision/ladder-roadmap-coherence.md`; `lib/vision/vdr-registry.js`; `lib/vision/vdr-probes.js` | **partial** (no calculation trace) |
| 11 | Prioritization | `docs/reference/central-planner.md`; `docs/reference/severity-weighted-pattern-prioritization.md`; `lib/vision/needle-priority.mjs` | **partial** (no rung-first needle-rank doc) |
| 12 | Forecasting | `lib/vision/build-completion-forecast.mjs` only | **none** (code only) |
| 13 | Feedback / Learning | `docs/reference/auto-learning-capture-hooks.md`; `progressive-learning-format.md`; `retrospective-patterns-skill-content.md`; `docs/04_features/23a_feedback_loops.md`; schema `adam_adherence_ledger.md` | **good** (mechanics); loop-closure framing **partial** |
| 14 | Governance / Chairman | `docs/governance/chairman-decision-surfaces.md`; `docs/reference/activation-invariant-rule.md`; `leo_protocol_sections` id=606 | **good** (surfaces); rung-activation-as-gate framing **partial** |
| 15 | Executive Summary Email | `scripts/adam-exec-summary.mjs`; mentioned in `docs/governance/chairman-decision-surfaces.md` | **none** (calc/cadence/contents undocumented) |

## B. Gap list + the master-doc confirmation

### Does a single end-to-end master doc exist today? — **NO (confirmed).**

Verified two ways:

1. **Database-first:** queried `leo_protocol_sections` for any
   flywheel/end-to-end/north-star/master/coherence/self-improvement/overview section. The **only**
   match was `id=217 "Database Schema Overview"` (a schema doc, not a flywheel map). No end-to-end
   master section exists in the DB.
2. **Filesystem:** the closest existing overview is `docs/protocol/README.md` ("The LEO Harness") —
   an excellent canonical overview, but it covers **only links 8–9** (the fleet/coordinator/worker
   harness + the protocol-vs-harness boundary). It does **not** climb up to the North Star, the
   vision ladder, OKRs, the roadmap, intake, sourcing, the gauge, prioritization, forecasting, or the
   chairman email. `docs/index.md` is a navigation index, not a narrative end-to-end map.

**Conclusion:** component docs exist (most links rated good/partial), but **no single doc tied the
full North-Star → worker-claim → feedback-loop chain together.** That is precisely the gap this
`docs/flywheel/` set fills.

### Thin / undocumented links (priority order for chairman attention)

| Link | Gap severity | What was missing |
|------|:---:|------------------|
| 12 Forecasting | **highest** | No doc at all; the calculation (two-phase ETA, EWMA self-correction + clamp, horizon-capped confidence, plateau honesty) lived only in code. |
| 15 Exec Email | **highest** | No doc; the cadence, contents, and especially *how it reuses computeBuildGauge + the forecast* were undocumented — yet it is the chairman's primary surface. |
| 10 Build Gauge | high | Calculation (denominator/numerator/scoring/buildable-vs-operational split/coherence-gating) untraced. |
| 11 Prioritization | high | The active-rung-first needle score was code-only. |
| 4 Roadmap→Waves | medium | wave→rung mapping + promotion mechanics undocumented; **two coexisting wave structures** (legacy Wave 1-6 null-horizon vs rung-aligned now/next/later) never flagged. |
| 5 Intake | medium | No single funnel doc enumerating all sources → conversion_ledger → wave-items. |
| 7 Sourcing Engine | medium | No component/lane/flag/safeguard map; dormant-by-default state not surfaced in one place. |
| 1,3,6,8,9,13,14 | low | Well-covered individually; needed flywheel-context bridges + cross-links. |

### Honesty flags raised during the audit (for chairman review)

1. **Two roadmap structures coexist** in `roadmap_waves` (legacy Wave 1-6 with `time_horizon=null`
   and `progress_pct=0`, vs the rung-aligned now/next/later set). Recommend deciding whether to
   retire/re-horizon the legacy set ([04-roadmap-waves.md]).
2. **The sourcing engine is built and its 2 behavioral crons are ACTIVE** — the deferred-watcher
   + gauge-gap-miner staging crons run with flags ON in GitHub Actions (commit 4ba41115 / PR #4933),
   armed as of 2026-06-20 (not yet observed firing; `workflow_dispatch` confirms). A **local**
   `process.env` flag probe reports a **false "dormant"** because it cannot read the workflow env
   (a known false-negative gap; the probe should read the deployed workflow env / a DB engine_state
   row). The 4 umbrella `SOURCING_*` flags are display/registry only. ([07-sourcing-engine.md]).
3. **`build_completion_forecast_log` is APPLIED (2026-06-20)** — chairman-authorized, additive-only;
   the first row is persisted, so the exec-email ETA line now renders. The forecast computes
   regardless; the line omits only if the table ever has no rows ([12-forecasting.md]).
4. **The exec email does not print the north-star income number** (removed in v3); it leads with
   build %. Income is a V2/operational concern, correctly 0 until a venture earns ([01-north-star.md],
   [15-executive-summary-email.md]).
5. **V2/V3 rungs have no shipped capabilities yet** — by design (V1 precedes V2). The needle-rank is
   LATENT-live until more rung-mapped SDs reach the belt ([11-prioritization.md]).

## D. Recommendation — where these docs should live to be canonical

Given **"database is the source of truth,"** here is the recommended canonical home and sync model.

### The split (what goes where, and why)

| Content type | Canonical home | Rationale |
|--------------|----------------|-----------|
| **Live values** (gauge %, rung active flag, north-star target, wave progress, flags) | **The DB tables** (`north_star`, `vision_ladder_rungs`, `vision_build_gauge`, `roadmap_waves`, …) — already true | Markdown drifts; the DB is queryable and validated. These docs must **never restate** a live value as authoritative — they describe *how to read it* and link to the table. |
| **Calculation logic** (the formulas) | **The code** (`lib/vision/*`) — already true | The code is the executable source of truth; the docs trace it for humans and point to the file+function. |
| **The flywheel narrative / map** (this set) | **`docs/flywheel/` markdown** (recommended) | It is connective architecture documentation, not protocol rules a gate enforces. It fits the existing `docs/vision/`, `docs/governance/`, `docs/protocol/` convention (top-level topic folders). It is read by humans + AI crawlers, not consumed by the gate pipeline. |
| **Protocol *rules* an agent must obey** (e.g. the Adam SSOT order) | **`leo_protocol_sections`** (already true — id=607) → generated into `CLAUDE_ADAM.md` | These ARE enforced/loaded by agents at runtime; they belong in the DB, regenerated into the .md artifacts. The flywheel doc **references** them, does not duplicate them. |

### The concrete recommendation

1. **Keep this flywheel set as `docs/flywheel/` markdown** (do **not** move the narrative into
   `leo_protocol_sections`). The narrative is architecture documentation; `leo_protocol_sections` is
   for *runtime-loaded protocol rules*. Putting a 15-link map into the protocol-section table would
   bloat the generated CLAUDE*.md files that every session loads, for content no agent needs at
   runtime.

2. **Add ONE pointer row to the DB so it is discoverable database-first.** Create a single
   `leo_protocol_sections` row (e.g. section_type `documentation`, title *"EHG Flywheel — End-to-End
   Map (pointer)"*) whose content is 3–4 lines saying *"the canonical end-to-end system map lives at
   `docs/flywheel/README.md`; this set is narrative architecture docs, kept in markdown; live values
   are in the DB tables it links to."* This satisfies "database-first" discoverability (a session can
   find it by querying the DB) **without** putting the whole narrative in the DB. *(Not created by
   this audit — it would modify a DB row, which was out of scope. Recommended as a follow-up.)*

3. **Link it from the existing indexes** (a one-line addition each, recommended as follow-up edits):
   - `docs/index.md` → add a "The EHG Flywheel (End-to-End Map)" row under a new top section.
   - `docs/protocol/README.md` → add "for the full strategy→fleet→feedback map, see
     `docs/flywheel/`" (it currently stops at the harness boundary).
   - `docs/vision/README` (if/when one exists) and `docs/governance/` → cross-link.

4. **Sync model (how markdown + DB stay honest):**
   - **No duplicated live values.** These docs state *where* a value lives and *how it's computed*,
     never hard-code the current number as authoritative (the few numbers shown are timestamped
     "verified 2026-06-20" snapshots, explicitly labeled).
   - **Code/DB are the source of truth; docs are descriptive.** When code/schema changes, the
     corresponding flywheel detail doc is updated in the same SD that changes the behavior (treat it
     like the `docs/vision/ladder-roadmap-coherence.md` precedent — a doc shipped alongside its SD).
   - **A lightweight drift check (optional follow-up):** a CI lint that asserts the file paths /
     function names cited in `docs/flywheel/*` still exist (similar to `WIRE_CHECK_GATE`), so a
     rename surfaces a stale citation. This keeps the *references* honest even as values move.

### Why not "both, fully mirrored"?

Full mirroring (the same narrative in markdown AND `leo_protocol_sections`) was considered and
**rejected**: it doubles the maintenance surface and reintroduces exactly the drift the database-first
rule exists to prevent. The chosen model — **narrative in markdown, a single discoverability pointer +
live values in the DB, code as the calc source of truth** — is database-first where it matters (values
+ runtime rules) and markdown where it's appropriate (human-facing architecture narrative).
