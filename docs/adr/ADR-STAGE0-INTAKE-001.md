# ADR-STAGE0-INTAKE-001: Canonical Stage 0 Opportunity-Intake Spine

**Status:** Accepted (ratified 2026-05-24)
**Date:** 2026-05-24
**Scope:** Architecture canonicalization only — no code changes authorized by this ADR.
**Repos:** `ehg` (runtime UI + intake producer), `EHG_Engineer` (Stage 0 backend + queue consumer).

> Naming note: repo ADR convention is `NNNN-slug.md` (e.g. `0012-...`). This file uses the explicitly requested name `ADR-STAGE0-INTAKE-001.md`. Rename to `0013-canonical-stage0-intake-spine.md` if convention alignment is preferred.

---

## Context

Multiple opportunity-intake paths exist across two repositories. Prior analysis over-indexed on the Opportunity Blueprint Engine and on downstream S14–16 "Blueprint Factory" scoring (`scoreAndPersist`). Code evidence shows those are **downstream** of a single intake spine that already produced one real venture (`Canvas AI`), alongside several legacy/stubbed/bypass paths and a database-level enforcement trigger. Before adding any new intelligence, scoring, or frame-analysis capability, the canonical path from opportunity source → Stage 0 → venture lifecycle must be ratified.

## Current Architecture (code-grounded)

```
source → stage_zero_requests (QUEUE)
       → scripts/stage-zero-queue-processor.js (poll / claim)
       → executeStageZero()  [path-router → synthesis(10) → modeling → chairman-review]
       → venture_briefs (CANONICAL pre-lifecycle artifact)
       → decision = 'ready' → persistVentureBrief()
       → ventures @ current_lifecycle_stage = 1
       → 25-stage lifecycle
```

Database enforcement: `trg_enforce_stage0_origin` (migration `20260330_stage_zero_enforcement.sql`, SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-A) **raises an exception on any direct `ventures` INSERT** except `service_role` JWT or `leo.stage0_bypass` / `leo.bypass_working_on_check` session flags. Sanctioned creation API: `POST /api/ventures`. Blocked attempts are logged to `operations_audit_log`.

Key backend files: `lib/eva/stage-zero/{stage-zero-orchestrator,path-router,chairman-review,profile-service,gate-signal-service,venture-nursery,modeling}.js`, `lib/eva/stage-zero/{paths,synthesis}/*`, `scripts/stage-zero-queue-processor.js`, `lib/discovery/{opportunity-discovery-service,blueprint-generator}.js`, `pages/api/ventures.ts`.
Key frontend files (`ehg/src`): `pages/VenturesPage.tsx`, `components/chairman-v3/opportunities/{PathSelector,DiscoveryModeDialog,CompetitorTeardownDialog,BlueprintSection}.tsx`, `services/blueprintSelection.ts`, `routes/chairmanRoutesV3.tsx`.

## Decision (ratified)

1. **`stage_zero_requests` is the canonical intake queue.** Enforced at the DB level — all venture creation routes through it (or the sanctioned service-role API).
2. **`venture_briefs` is the canonical pre-lifecycle / Inception artifact.**
3. **Opportunity Blueprints are ONE upstream source** (the `blueprint_browse` path / AI scan output), **not** the central intake object.
4. **All new venture intake routes through the Stage 0 spine** unless explicitly sanctioned (provisioner / master-reset / service-role).
5. **Strategic Frame Intelligence (SFI), if pursued, belongs in Stage 0 *synthesis*** — not as a new subsystem and not as a Blueprint Factory feature. Future investigation only.
6. **Scoring is layered, not unified** (see §5) — six distinct layers that must not be collapsed.
7. **S14–16 Blueprint Factory wiring stays deferred** until intake is canonical.

## Alternatives Considered

- *Blueprints as the central intake object* — rejected; they feed only one of three canonical paths, and 6/8 rows are E2E test fixtures.
- *SFI as a Blueprint-Factory enhancement* (a prior conclusion) — rejected; Stage 0 synthesis already runs multi-lens analysis (`problem-reframing`, `moat-architecture`, `archetype-mapping`, `portfolio-evaluation`, `chairman-constraints`).
- *Wire S14–16 scoring next* — rejected as premature (downstream of an unratified intake layer; `scoreAndPersist` and the blueprint coordinator currently have no production callers).

## Consequences

- A single documented spine governs all future intake work; the cross-repo `stage_zero_requests` contract becomes explicit.
- Legacy `selectBlueprint()` (confirmed blocked by the enforcement trigger) and the `/chairman/explore` route bug are formally deprecated/scheduled.
- SFI is conceptually unblocked but gated behind intake ratification + a verification checklist (§6).

---

## §2. Canonical Flow

**Universal route for all new venture ideas:**
`opportunity source → stage_zero_requests → stage-zero-queue-processor.js → Stage 0 synthesis → venture_briefs → chairman-review → ventures @ stage 1 → lifecycle`

> The `stage_zero_requests` producer→consumer contract — columns, status lifecycle, and the four canonical `metadata.path` values (`discovery_mode`, `competitor_teardown`, `blueprint_browse`, `own_idea`) — is documented in [stage-zero-requests-contract.md](../architecture/stage-zero-requests-contract.md) (FR-005 / closes gap G5).

**Only sanctioned exceptions:**

| Exception | Mechanism | Authorizer | Audit |
|---|---|---|---|
| Provisioner | `leo.stage0_bypass=true` | provisioner script | `operations_audit_log` |
| Master reset | `leo.bypass_working_on_check=true` | master_reset | `operations_audit_log` |
| Service-role ops (queue processor, `POST /api/ventures`) | JWT role=`service_role` | backend | trigger allows |

Non-sanctioned direct inserts raise an exception and log `venture_creation_blocked`. Manual "New Venture" is sanctioned only via `POST /api/ventures`, but **skips synthesis** (produces a venture without a `venture_brief` — gap G6).

---

## §3. Entry Path Disposition

| Path | Current State | Class | Decision | Follow-up |
|---|---|---|---|---|
| Discovery Mode (×5 strategies) | `stage_zero_requests`(discovery_mode) → brief → venture | **Canonical** | Keep | — |
| Competitor Teardown | `stage_zero_requests`(competitor_teardown) | **Canonical** | Keep | — |
| Blueprint Browse | consumes `opportunity_blueprint` → `stage_zero_requests`(blueprint_browse) | **Canonical** | Keep | — |
| AI Opportunity Scan | `runScan()` → `opportunity_scans` + `opportunity_blueprints` | **Canonical source** (pre-S0) | Keep | — |
| "I Have an Idea" (own_idea) | dialog renders; `onSubmitIdea` not wired | **Stubbed** | Implement as `own_idea` S0 path | F3 |
| Manual "New Venture" | `/ventures/new` → venture @ stage 1, **no brief** | **Bypass (synthesis)** | SD-tier decision: route via S0 / minimal brief | F5 |
| Legacy `selectBlueprint()` | direct frontend insert @ stage 2 — **blocked by trigger (CONFIRMED)** | **Dead** | Retire or redirect to blueprint_browse | F2 |
| Nursery Reactivate | `venture_nursery` → venture | **Canonical** (re-entry) | Keep | — |
| Chairman NL intent | `venture_briefs.raw_chairman_intent`; overlaps stubbed own_idea | **Partial** | Fold into own_idea wiring | F3 |

Object creation: only AI Scan creates blueprints; the 3 canonical UI paths + own_idea create `stage_zero_requests`; the queue processor creates `venture_briefs`; `persistVentureBrief` creates the venture. `selectBlueprint`/manual bypass the brief.

---

## §4. Stage 0 Object Model (terminology — drift resolved)

| Concept | Table / Object | Role | Canonical? | Notes |
|---|---|---|---|---|
| idea | (own_idea input) | raw NL chairman input | — | **stubbed**; lands in `venture_briefs.raw_chairman_intent` |
| opportunity | `opportunity_scans` | AI market/competitor scan | source | feeds blueprints |
| blueprint | `opportunity_blueprints` | scored seed for blueprint_browse | **one source, not spine** | 2 real + 6 test rows |
| intake request | `stage_zero_requests` | the queue / cross-repo handshake | **✔ canonical queue** | status enum; `claimed_by_session` |
| inception / venture brief | `venture_briefs` | synthesis output, pre-lifecycle | **✔ canonical artifact** | `origin_type`, `maturity`, 10 synthesis fields |
| venture | `ventures` | promoted, `current_lifecycle_stage ≥ 1` | downstream | trigger-guarded |
| nursery item | `venture_nursery` | parked (seed/sprout) | re-entry | re-eval loop |

**Rule for future agents/devs:** a *blueprint* is a pre-Stage-0 **seed**; a *brief* is the post-synthesis **canonical artifact**. They are not interchangeable.

---

## §5. Scoring Layer Placement (six distinct layers — do not collapse)

| Scoring Layer | Lifecycle Point | Current Code | Status | Decision |
|---|---|---|---|---|
| Basic opportunity scoring | Pre-S0 | `opportunity-discovery-service.js` (confidence_score, green/yellow/red box) | ✅ live | Keep |
| Blueprint confidence scoring | Pre-S0 / blueprint gen | `blueprint-generator.js` (`confidence_score` 0–100) | ✅ live | Keep |
| **Stage 0 synthesis scoring** | **During S0** | `profile-service.js` `calculateWeightedScore` (10 components) | ✅ live (produced Canvas AI brief) | **Keep — home of frame analysis** |
| Strategic frame / coverage scoring | **Future S0 enhancement** | `synthesis/problem-reframing.js` (+9 components) | ❌ not built | Investigate only (§6) |
| Blueprint quality scoring | S14–16 / S16 promotion gate | `lib/eva/blueprint-scoring/scoreAndPersist` | ⚠️ unwired (no production caller) | **Defer** |
| Experiment / outcome calibration | lifecycle kill gates (3/5/13) | `gate-signal-service.js`, `gate-outcome-bridge.js`, `evaluation_profile_outcomes` | ✅ wired, 0 outcomes | Keep (exercise post-launch) |

---

## §6. Future Investigation: Strategic Frame Intelligence at Stage 0

**Explicitly non-implementing.** This section records a hypothesis and an investigation track — it authorizes no code.

**Current hypothesis.** SFI belongs inside **Stage 0 synthesis**, which already runs ten lenses — most relevantly `problem-reframing.js`, `moat-architecture.js`, `archetype-mapping.js`, `portfolio-evaluation.js`, `chairman-constraints.js`.

**What it may eventually add.** Generate multiple strategic interpretations of one opportunity; compare frames pre-commitment; detect frame collapse / over-convergence; retain rejected frames and dissent; surface coverage warnings to `chairman-review`; calibrate which frames later produce stronger ventures (via existing `evaluation_profile_outcomes`).

**What must be verified first.** Whether `problem-reframing.js` already emits sufficient multi-framing; whether `sensemaking_analyses` (8 live rows, multi-persona) should feed synthesis; whether coverage/collapse is computable from existing synthesis outputs; whether SFI should be advisory-only; whether it lives in `venture_briefs` (a JSONB field), `stage_zero_requests`, or a derived artifact.

**Explicit non-decisions (do NOT implement):**
- No new SFI subsystem.
- No new SFI tables.
- No frame coverage / collapse scoring yet.
- No new scoring gates.
- No autonomous stage advancement.

Treat SFI as a deferred investigation track, opened only after the intake spine is stable.

---

## §7. Fragmentation / Gap Analysis

| Gap | Evidence | Impact | Recommended Fix | Priority |
|---|---|---|---|---|
| G1 Route bug | `VenturesPage.tsx:352` → `/chairman/explore`; route is `/chairman/opportunities` (`chairmanRoutesV3.tsx:101`) — CONFIRMED | Primary UI entry dead | Fix navigate target | **High** (trivial) |
| G2 `own_idea` stubbed | `onSubmitIdea` not passed in `ExploreOpportunities.tsx` | NL idea intake non-functional | Wire to `stage_zero_requests` | Med |
| G3 Legacy `selectBlueprint()` dead | `trg_enforce_stage0_origin` blocks authenticated insert — CONFIRMED | Dead UI action / silent block | Retire or redirect | Med |
| G4 Status desync | request `eb698149`=`failed` yet brief+venture created ~2 min later | Untrustworthy queue telemetry | RCA processor status writes | Med |
| G5 Cross-repo seam undocumented | queue producer (`ehg`) vs consumer (`EHG_Engineer`) | Each half invisible to the other | Document `stage_zero_requests` contract | Med |
| G6 Manual New Venture skips synthesis | creates venture, no `venture_brief` | Ventures without canonical artifact | SD-tier decision (route via S0 / minimal brief) | Med |
| G7 `sensemaking_analyses` disconnected | 8 rows, not referenced by S0 paths | Orphaned analysis surface | Decide integrate / deprecate | Low |
| G8 Blueprint Factory unwired | `scoreAndPersist` / coordinator no callers | S14–16 dormant | Defer | Low |

---

## §8. Follow-up Tasks (dependency-ordered, ratified sequence)

| # | Task | Type | Depends on |
|---|---|---|---|
| F1 | Fix `/chairman/explore` → `/chairman/opportunities` | bugfix / QF (Tier 1) | this ADR |
| F2 | Retire or redirect legacy `selectBlueprint()` | QF | this ADR |
| F3 | Wire `own_idea` Stage 0 path (+ fold chairman NL intent) | QF (Tier 2) | F1 |
| F4 | RCA the Stage 0 request status desync | RCA → bugfix | — |
| F5 | SD-tier decision: Manual New Venture / minimal-brief behavior | SD | this ADR |
| F6 | Investigate Stage 0 frame coverage / SFI (synthesis enhancement) | deferred investigation | intake stable |
| F7 | Reconcile/Defer Blueprint Factory S14–16 wiring | deferred (SD) | intake canonical |

---

## §9. Explicit Non-Goals (this ADR / canonicalization task)

No Blueprint Factory scoring wire-up · no SFI subsystem · no SFI tables · no S14–16 changes · no venture-lifecycle changes · no autonomous stage advancement · no frame coverage/collapse scoring · no new scoring gates. **Architecture canonicalization only.**

---

## Recommended First Implementation Task (post-ratification)

**F1 — Fix the `/chairman/explore` → `/chairman/opportunities` route mismatch** (`ehg/src/pages/VenturesPage.tsx:352`). Bugfix / QF Tier 1 (≤30 LOC). It is confirmed, trivial, and unblocks the primary UI intake entry. Sequence thereafter: F2 → F3 → F4 → F5, then F6 (SFI investigation), with F7 (Blueprint Factory) deferred furthest.

> Lifecycle-proof note: an end-to-end traversal is already demonstrated (`Canvas AI`: request → brief → venture @ stage 1, now stage 19). The residual reliability question is the F4 status desync, not a fresh proof.
