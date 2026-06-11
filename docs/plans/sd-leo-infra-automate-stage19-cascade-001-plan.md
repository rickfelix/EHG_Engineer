<!-- SD Key: SD-LEO-INFRA-AUTOMATE-STAGE19-CASCADE-001 -->

# Plan: Automate Stage 19 → SD Cascade (vision-approval → archplan → orchestrator)

## Priority
high

## Goal

Eliminate the two manual CLI invocations (`archplan-command.mjs upsert` and `create-orchestrator-from-plan.js --auto-children`) that today sit between L2 vision approval and the parent orchestrator SD being claim-ready. Today's pipeline:

```
Stage 0-19 EVA artifacts → brainstorm (auto) → L2 vision via brainstorm-to-vision (auto)
  → archplan-command upsert        ← MANUAL TODAY (P-FAIL-3)
  → create-orchestrator --auto-children   ← MANUAL TODAY (P-FAIL-3)
  → Parent orchestrator SD ready for LEAD claim
```

The chairman should never touch these — Stage 19 / L2-vision approval should cascade transparently. Surfaced and analyzed in `project_crongenius_first_venture_pilot_2026_05_27.md` as **P-FAIL-3 ("Discoverability — entire canonical pipeline invisible")**. Every future venture orchestrator LEAD repeats the manual gap until automated.

**Chairman-approved approach (2026-05-27, this session): Option C — background watcher (cron).** Polls every 60s for `eva_vision_documents` rows that are `level='L2' AND status='active' AND chairman_approved=true AND venture_id IS NOT NULL` AND have no downstream archplan, runs `upsertArchPlan` (which auto-sets archplan `status='active' chairman_approved=true`); then polls for archplans without a downstream orchestrator and runs the orchestrator-creation library. Decoupled from approval channel (works for SQL UPDATE, future dashboard buttons, or scripts). Refusal-gate symmetry: if the L2 content lacks an extractable "Architectural Plan" section, the watcher writes a structured error pointing to the remediation (manual `archplan-command.mjs upsert` with explicit `--source`) — does not silently fall back. Idempotent at every stage (archplan upsert dedup on `plan_key`; orchestrator key-collision check; child `covered_by_sd_key` short-circuit).

**Three blocking bugs from the CronGenius pilot must be fixed in scope** — they directly determine whether the auto-cascade produces orchestrator SDs that pass `GATE_SD_QUALITY` at LEAD-TO-PLAN:

- **F3 — `target_application='EHG_Engineer'` hardcoded** at `scripts/create-orchestrator-from-plan.js:316,427`. Venture orchestrators must derive target_application from `vision.venture_id → ventures.name`.
- **F5 — quality-gate JSONB fields skeletal**. `dependencies`, `risks`, `stakeholders`, `implementation_guidelines` are left empty; `success_criteria` and `strategic_objectives` get 1-element placeholders. Pilot chairman had to manually expand to 5–8 items per field. Auto-population from `vision.extracted_dimensions` + `arch.implementation_phases` + `arch.extracted_dimensions` is required at create time.
- **F2 — `parsePhases` undercounts**. Pilot saw 3 phases extracted for content that required 7+ (reference: ARCH-ORCH-SCOPE-GOV-001 has 11 canonical sections). For venture archplans missing structured `sections.implementation_phases`, the watcher must extract via LLM and persist back, OR refuse loudly if extraction yields < 3 phases.

## Internal Phases (FRs)

Three distinct testable phases — decomposed internally per chairman approval (precedent: SD-LEO-INFRA-UNIFY-VENTURE-NON-001 used Children A/B/C/D as internal phases within a single infrastructure SD, one bundled PR):

- **FR-A: Library refactor + F3/F5 fixes (~110 LOC)** — Refactor `scripts/create-orchestrator-from-plan.js` to expose a pure `createOrchestratorFromPlan({ supabase, visionKey, archKey, title, autoChildren, targetApplication })` library function in `lib/eva/create-orchestrator-from-plan.js`. Fix F3 (accept `targetApplication` parameter; CLI derives from `vision.venture_id → ventures.name`). Fix F5 (populate orchestrator + child JSONB quality fields from vision/arch dimensions). Regression tests against existing `ARCH-CRONGENIUS-001 → SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001` path.

- **FR-B: Cascade-watcher + archplan extraction (~150 LOC)** — Build `scripts/eva/cascade-watcher.js` with `--once` and `--watch` modes. Build `lib/eva/extract-archplan-section.js` exporting `extractArchPlanSection(visionContent)` (parses `## Architectural Plan` heading; returns content or `null`). Watcher loop: detect ready visions → extract section → `upsertArchPlan` → detect ready archplans without orchestrator → `createOrchestratorFromPlan` → log success/refusal. Structured refusal errors written to a new `eva_cascade_errors` table.

- **FR-C: Cron wiring + observability + dashboard surface (~80 LOC)** — Register `cascade-watcher --watch` with existing cron infra (`leo-cron-monitor` or sibling). Schema migration for `eva_cascade_errors` (vision_id, archplan_key, stage, error_code, error_message, created_at, resolved_at). Expose unresolved errors in `fleet-dashboard` (or sibling). Add `npm run cascade:status` for terminal observability.

## Key Changes

1. **New library file** `lib/eva/create-orchestrator-from-plan.js` — pure `createOrchestratorFromPlan()` function, refactored from CLI `main()`.
2. **F3 fix** at `scripts/create-orchestrator-from-plan.js:316,427` — replace `target_application: 'EHG_Engineer'` hardcode with `targetApplication` parameter (CLI derives from `ventures.name` via `vision.venture_id` join).
3. **F5 fix** in same file — populate orchestrator + child SD JSONB fields (`dependencies`, `risks`, `stakeholders`, `implementation_guidelines`, `strategic_objectives`, `success_criteria`) from `vision.extracted_dimensions` + `arch.implementation_phases` + `arch.extracted_dimensions` at create time (instead of empty arrays / 1-element placeholders).
4. **New extractor** `lib/eva/extract-archplan-section.js` — parses `## Architectural Plan` section out of L2 vision content.
5. **New watcher** `scripts/eva/cascade-watcher.js` — polls for ready visions/archplans, runs cascade, writes refusal-gate errors.
6. **New schema migration** for `eva_cascade_errors` table.
7. **Cron registration entry** for cascade-watcher in DB-driven cron schedule.
8. **Dashboard surface** for unresolved cascade errors.

## Risks

- **Risk-1 (HIGH): Cron fires while chairman still iterating on vision** — premature archplan creation. Mitigation: gate watcher on `chairman_approved=true` (already authoritative) + optional `quality_checked=true OR quality_score>=85` belt-and-suspenders check.
- **Risk-2 (HIGH): F3/F5 regression breaks existing manual path** — SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 was created via current path; refactor must preserve identical output for the same inputs. Mitigation: snapshot regression test on existing CronGenius orchestrator + child SD structures BEFORE and AFTER refactor.
- **Risk-3 (HIGH): Silent cron failures** — vision approved but cascade never fires, chairman doesn't know. Mitigation: `eva_cascade_errors` table + dashboard surface + `npm run cascade:status` CLI; absence of expected archplan within 5 min of vision approval is itself a surfaced anomaly.
- **Risk-4 (MEDIUM): Concurrent cron instances race** — two watcher invocations see same ready row simultaneously. Mitigation: idempotency at `upsertArchPlan` (`onConflict: 'plan_key'`) and orchestrator key-collision check; both already exist. Add advisory PG lock as belt-and-suspenders.
- **Risk-5 (MEDIUM): L2 vision content lacks "Architectural Plan" section** — extractor returns null. Mitigation: refusal-gate symmetry — write `eva_cascade_errors` row pointing chairman to remediation (manual `archplan-command.mjs upsert --source <explicit file>`), do not silently fail.
- **Risk-6 (LOW): LLM extraction cost** — if cascading to LLM-extract dimensions during archplan upsert. Mitigation: dimensions extraction already happens in current archplan-command path; auto-cascade adds zero net LLM calls. Cron polling itself is pure DB queries (no LLM).

## Steps

- [x] LEAD: 8-question strategic validation gate (passed)
- [x] LEAD: pause-and-pick Option A/B/C → chairman picked C (this session)
- [ ] LEAD: invoke validation-agent (strategic gate evidence), risk-agent (cascade failure modes), design-agent (cron-vs-DB-trigger architecture rationale)
- [ ] LEAD-TO-PLAN: handoff via `node scripts/handoff.js execute LEAD-TO-PLAN SD-LEO-INFRA-AUTOMATE-STAGE19-CASCADE-001`
- [ ] LEAD: create 3 child SDs via `node scripts/leo-create-sd.js --child SD-LEO-INFRA-AUTOMATE-STAGE19-CASCADE-001 1|2|3`
- [ ] Children A, B, C: follow LEO workflow per child (LEAD-TO-PLAN, PLAN, PLAN-TO-EXEC, EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL) with dependency Child A → Child B → Child C
- [ ] Parent PLAN-TO-LEAD: blocks with WAIT verdict until all 3 children reach status='completed' (per SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001)
- [ ] Parent LEAD-FINAL: handoff once all children complete; retrospective generated
- [ ] Resume CronGenius pilot: verify cascade-watcher correctly handles VISION-CRONGENIUS-API-L2-001 → re-creation of ARCH-CRONGENIUS-001 + orchestrator decomposition is idempotent (no duplicates created)

## Target Application
EHG_Engineer

## Scope Notes

- **In scope:** F3 + F5 fixes (blocking quality-gate failures), cascade-watcher script, archplan section extractor, `eva_cascade_errors` table, cron registration, dashboard observability.
- **Out of scope (deferred to follow-up SDs):**
  - **F2** (`parsePhases` undercount via richer LLM extraction) — Child B will refuse loudly if phases < 3, but improving extraction quality is a separate SD.
  - **F9** (sd_type 'implementation' vs LEAD-TO-PLAN gate list inconsistency) — separate QF.
  - **O4** (vision pre-screen 15s timeout in create-orchestrator-from-plan) — separate P3 QF.
  - **Discoverability fix** (mention canonical pipeline in CLAUDE_LEAD.md + sd-start output) — separate doc QF.
- **Backward compatibility:** Manual invocation of `archplan-command.mjs upsert` and `create-orchestrator-from-plan.js --auto-children` must continue working unchanged. The watcher only fires when the pre-state matches AND no downstream artifact yet exists (idempotent fallback to no-op).
- **Worktree-awareness:** Watcher reads/writes DB only; no file paths involved. Naturally worktree-safe per /heal vision lesson (SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001).
- **Refusal-gate symmetry:** Mirrors `assertVentureVisionReady` pattern at `lib/eva/lifecycle-sd-bridge.js:181-235`. Refusal writes to `eva_cascade_errors` with remediation hint pointing chairman to manual CLI fallback.
- **Scope reduction (Q8):** ~25%. Original framing considered all 5 pilot bugs (F2/F3/F5/F9/O4) + discoverability docs. Reduced to F3+F5 + watcher + observability. Cascade itself is the load-bearing deliverable; the rest are quality follow-ups.

## Origin

- **Pilot journal:** `project_crongenius_first_venture_pilot_2026_05_27.md` — P-FAIL-3 (entire canonical pipeline invisible to LEAD) + P-FAIL-1/2 reframings. Auto-trigger listed as P2 follow-up at line 162.
- **Predecessor SDs (do not redo):**
  - `SD-LEO-INFRA-UNIFY-VENTURE-NON-001` (PR #3986 + #3993 + #4003) — venture vision-doc pipeline unified; refusal gate at `lib/eva/lifecycle-sd-bridge.js:317` is the pattern to mirror.
  - `SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001` (PR #4017) — /heal vision venture-aware (target-path lesson).
  - `SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001` (PR #4021) — parent orchestrator lifecycle (WAIT verdict) — parent SD will use this lifecycle.
- **Session:** Mode declared `[MODE: campaign]` by chairman in opening prompt.
- **Approval signal verified live:** `VISION-CRONGENIUS-API-L2-001` is currently `active+chairman_approved=true` with `venture_id=6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66` (created_by='brainstorm-to-vision-pipeline'); `ARCH-CRONGENIUS-001` linked + active + approved; `SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001` is the single existing artifact of the manual cascade.
