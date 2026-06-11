# RCA: First non-EHG venture orchestrator failing LEAD-TO-PLAN

- **Date**: 2026-05-26
- **Trigger SD**: `SD-CRONGENIUS-LEO-ORCH-SPRINT-SPRINT-2026-001` (id `2df45976-6864-4eaf-b0d4-b04ec50ccc5b`)
- **Repo HEAD**: `e366894280`
- **Session mode**: campaign (harness-hardening) — meta-asymmetry investigation
- **Pattern witnesses**: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (6th–9th witnesses, see Findings F1–F4 below)

---

## Evidence (verified, not inferred)

1. **Target SD (DB query, not user report)**
   - description = **60 words** (not 40 as briefed)
   - success_metrics = 1 entry (`Child SD completion`)
   - success_criteria = 5 entries (mirror of child titles)
   - risks=[], smoke_test_steps=[], scope_reduction_percentage=0
   - metadata.vision_key='VISION-CRONGENIUS-API-L2-001', metadata.created_via='lifecycle-sd-bridge', metadata.generation_source='auto-pipeline-stage-17-doc-gen', metadata.is_parent=true
   - sd_type='orchestrator', target_application='CronGenius', status='draft', current_phase='LEAD'

2. **Cross-repo orchestrator baseline**
   - `metadata->>'created_via' = 'lifecycle-sd-bridge'` → 111 SDs total
   - All accepted LEAD→PLAN orchestrator handoffs (last 10) have target_application in (EHG, EHG_Engineer) — **zero accepted handoffs for a venture-targeted orchestrator**. The user's framing is correct: CronGenius is the first.
   - The 5 PrivacyPatrol AI sibling orchestrators were `target_application='EHG'` (post-split); the parent was cancelled. The two pre-2026-05-26 venture-targeted orchestrators (`SD-CRONREAD-..-001`, `SD-COMMITCRAFT-AI-..-001`) were **CANCELLED before LEAD-TO-PLAN** — confirming zero venture-orchestrator LEAD→PLAN exercise.

3. **Quality rubric (`scripts/modules/sd-quality-scoring.js`)**
   - `SD_TYPE_THRESHOLDS` has **no entry for `orchestrator`** → falls to `DEFAULT_THRESHOLD { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 }`
   - Fleet baseline: completed orchestrator SDs average **69 words / 6 metrics** (highest avg-metrics of any sd_type). The 50-word floor and 3-metric floor are NOT unreasonable bars; the generator output is the outlier.

4. **Metrics-sufficiency check (`scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js` lines 70–115, `SD_REQUIREMENTS.minimumMetrics=3`)**
   - Validator picks `success_metrics` FIRST (`hasSuccessMetrics` short-circuits); success_criteria fallback is only used when success_metrics is absent.
   - Generator emits success_metrics=1 → blocks even though success_criteria=5 would have passed alone.

5. **Vision document state (DB query)**
   - `VISION-CRONGENIUS-API-L2-001`: content=53 chars, `extracted_dimensions=NULL`, `chairman_approved=false`, `quality_checked=false` with explicit complaints `content_length` + `sections_missing`.
   - Duplicate doc exists: `VISION-CRONGENIUS-L2-001` (49 chars, status='draft', venture_id=NULL) — orphan from an earlier Stage-1 seed.
   - vision-scorer.js line 70 will throw `"Vision VISION-CRONGENIUS-API-L2-001 has no extracted_dimensions"` if the user follows the gate's remediation tip.
   - Fleet health: 56/272 docs (**20.6%**) are NULL or STUB (<1000 chars). Every venture seeded post-pipeline shares this fate.

6. **vision-scorer integration** — lifecycle-sd-bridge.js does NOT invoke vision-scorer. Vision-scoring is on-demand (at handoff). When the vision doc is degenerate (above), there is no remediation surface for the operator other than enrich-vision-doc upstream.

7. **Vision-score gate (`scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js`)**
   - Orchestrator threshold is 70 (Tier 3).
   - Lines 377–390: explicit exemption — `if (sd.metadata?.parent_orchestrator || sd.metadata?.auto_generated || sd.parent_sd_id)` skips vision scoring entirely for orchestrator CHILDREN. Parent orchestrators (this SD) are NOT exempt.
   - The check `metadata.auto_generated` does NOT match `metadata.created_via='lifecycle-sd-bridge'`. The bridge sets `is_parent=true` and `created_via='lifecycle-sd-bridge'`; neither key satisfies the exemption clause. Even children created by the bridge would not be exempt unless `parent_sd_id` is set — which the bridge DOES set on children (line 343 `parent_sd_id: orchestratorId`) — so child exemption works, but the parent has nothing to exempt against.

8. **Sub-agent cross-repo audit (10 agents inspected)**
   - **Correct** (target_application aware): `design/` (fixed by SD-LEO-INFRA-CROSS-REPO-AWARE-001), `github.js` (resolves via `applications.target_application`).
   - **Hard-codes `resolveRepoPath('ehg')`**: `security.js:93`, `performance.js:76`, `dependency.js:278`, `api.js:303`, `regression.js:34`, `quickfix.js:37`. Six sub-agents will scan `~/Projects/_EHG/ehg`, NOT `~/Projects/_EHG/crongenius`.
   - **Partially aware but wrong fallback**: `modules/stories/codebase-analysis.js:35` — binary `targetApp === 'EHG' ? resolveRepoPath('ehg') : path.resolve('../../../../..')` — the non-EHG branch resolves to **EHG_Engineer root**, not the venture repo. Stories sub-agent will mine EHG_Engineer for "existing components" when target is CronGenius. (This is the same kind of "zero violations ≠ compliance" trap that bit DESIGN per the cross-repo-aware retro.)
   - **`process.cwd()` callers**: `database/schema-validator.js:31`, `database/migration-handler.js:148`. DATABASE sub-agent migrations would be written to EHG_Engineer's `.temp/` not CronGenius. Schema validator scopes by cwd.
   - **`validation.js`** reads `target_application` (line 155, 328) — appears aware; worth a deeper read at fix time.

9. **CronGenius infrastructure exists** — `applications/registry.json` has `crongenius` row with correct `github_repo: rickfelix/crongenius` and `local_path: C:/Users/rickf/Projects/_EHG/crongenius`; venture row has `build_model: leo_bridge` and `repo_url` set; local clone is on disk. Registry-driven resolvers (DESIGN, GITHUB, resolveGitHubRepo) will work. The cwd-defaulting sub-agents will NOT.
   - **DB/JSON asymmetry**: `applications.github_repo` is NULL for crongenius in DB; only the JSON registry has it. Any consumer reading the DB column directly will get null. (Lower severity — the JSON is the canonical SSOT used by `loadValidatedRegistry()`.)

---

## Expert lenses applied (inline — sub-agent spawning unavailable in this nested context)

Per protocol, expert consultation is mandatory. `Task`/`TeamCreate` are unavailable in this nested sub-agent runtime, so analysis is performed INLINE adopting each expert's lens. Each lens challenged my initial framing and surfaced an option I would have missed.

### Lens 1 — DATABASE expert
- **Initial framing I challenged**: "the vision-scorer remediation tip is fine, the operator just needs to run it." **Reality**: `eva_vision_documents.extracted_dimensions IS NULL` is upstream of the scorer — the scorer THROWS, the remediation is invalid. Real fix: enrich the vision doc, then score. CronGenius has TWO vision docs (`-CRONGENIUS-API-L2-001` and `-CRONGENIUS-L2-001`) — orphan dup. Need vision-doc dedup + freshness check (writer/consumer asymmetry: Stage-1 venture seed writes a stub, vision-scorer expects full extracted dims).
- **Options for the vision-doc problem**:
  - A. Run an enrichment pipeline to populate `extracted_dimensions` for all 56 stub/NULL docs (heavy; needs LLM/manual chairman input).
  - B. Make vision-scorer **fail with a structured remediation** when `extracted_dimensions IS NULL`, pointing at the enrichment command (currently raw throw).
  - C. Add an orchestrator-parent exemption from GATE_VISION_SCORE when `metadata.created_via='lifecycle-sd-bridge'` AND the vision doc is upstream-degenerate (provisional pass with warning) — analogous to the existing corrective-SD exemption (lines 392–410).
  - D. Make the lifecycle-sd-bridge generator **assert** vision-doc readiness before creating the parent orchestrator (fail fast, don't ship a doomed SD).
- **Recommendation**: B + D as the durable fix. Option C is a band-aid that buries the vision data hygiene problem. The bridge should be `--check-vision-ready` by default in production (D), and the scorer should give the operator a clean error path when the upstream doc is unfit (B).

### Lens 2 — SECURITY expert
- **Cross-repo risk**: 6 sub-agents will scan `~/Projects/_EHG/ehg` regardless of target_application. For a venture orchestrator's children, this means:
  - SECURITY sub-agent's `checkAuthentication/Authorization/InputValidation/DataProtection` results are about EHG, not CronGenius. CronGenius API endpoints (CronGenius's MVP per `sprint_goal`) get **zero security review**.
  - Worse — green security results from the EHG scan get attached to a CronGenius child SD's handoff evidence. **False-positive evidence** is more dangerous than no evidence (gate appears satisfied; operators trust the green tick).
- **Same class as PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001**: writer (sub-agent runner) ignores the target_application that the SD consumer (gate) keys off.
- **Recommendation**: P0 fleet-wide `resolveSubAgentRepo(sd)` enforcement (this was CAPA-1 of CROSS-REPO-AWARE-001 and was DEFERRED). Adding `metadata.repo_resolved` + `metadata.target_application_verified` to every sub-agent result row + a gate that fails when `repo_resolved !== target_application` blocks the false-positive class systemically.

### Lens 3 — PROTOCOL/GOVERNANCE expert
- **The generator/gate asymmetry is the protocol-process category**: a writer (auto-generator) consistently produces an artifact that consistently fails the consumer (gate). 100% recurrence is the definition of a writer-consumer asymmetry.
- **Special twist for orchestrator parents**: the SD-quality rubric has NO sd_type='orchestrator' bucket. Orchestrators have inherited the `DEFAULT_THRESHOLD` (5 fields, 50 words, score 65) by accident. This is consistent with completed orchestrators (avg 69 words) but the **bar wasn't intentional** — it's a code-path that nobody designed for. The DEFAULT being accidentally-right for human-authored orchestrators (which average 69 words) is what masked the gap until an auto-generator started authoring them at 40–60 words.
- **The two paths diverge**:
  - Fix the generator → produces higher-quality SDs forever, no rubric change.
  - Add an orchestrator bucket → admits that orchestrators are a real first-class type, makes the bar explicit (consider 50 words + 3 metrics + a `goal-driven` rationale paragraph).
- **Recommendation**: BOTH. Generator fix is the immediate unblock; explicit `orchestrator` rubric entry codifies the contract (so a future generator regression is caught at the rubric level too — defense in depth, per the multi-layer CAPA requirement).

### Lens 4 — TESTING expert (cross-repo testing impact)
- **Test scope-bleed**: testing/regression sub-agent (regression.js:34) hard-defaults to ehg. For CronGenius children, regression baselines/comparisons run against EHG's test suite. CronGenius uses `bun` (per `bun.lock`, `bunfig.toml` in its repo) — a completely different test runner. EHG uses vitest+playwright. The test invocation will either error or run against the wrong codebase.
- Worse: a green `regression` sub-agent result counts as TESTING evidence for the handoff gate. So when CronGenius child SDs reach EXEC handoffs, they'll get "TESTING evidence: 0 regressions" — measured against the wrong codebase.
- **Recommendation**: Per-target-application test runner registry. `applications.test_runner` column (bun/vitest/jest/pytest) + a runner-selector in regression.js/quickfix.js/testing.js based on the resolved repo's actual lockfile + manifest.

---

## 5-Whys — primary chain

**ISSUE**: Bridge-generated venture orchestrator SDs fail LEAD-TO-PLAN with GATE_SD_QUALITY + GATE_SD_METRICS_SUFFICIENCY + GATE_VISION_SCORE 100% of the time.

- **WHY 1**: The generator produces a 1-metric, ~40–60-word description, no risks, no scope reduction, and never enriches the upstream vision doc.
  - Evidence: lifecycle-sd-bridge.js:260–273 (hard-coded template); eva_vision_documents row for VISION-CRONGENIUS-API-L2-001 (content=53 chars, ext_dims=NULL).
- **WHY 2**: The generator was authored for **EHG-targeted** sprint orchestrators created from existing Stage-18 sprint payloads where the vision doc was assumed pre-enriched (the rich EHG vision docs all have content >7k chars and chairman_approved=true). The default template was sized to clear the rubric's DEFAULT_THRESHOLD by accident, not by design.
  - Evidence: completed bridge-generated EHG-target orchestrators range 70–180 words. The author tested against the EHG vision docs and EHG-scoped child generation, never against a fresh venture seed.
- **WHY 3**: The first **venture-targeted** orchestrator path never executed before because the prior venture-orchestrator SDs (CronRead, CommitCraft AI parents, PrivacyPatrol AI parent) were CANCELLED before LEAD-TO-PLAN — they were rebuilt as EHG-targeted sibling SDs. Zero LEAD-TO-PLAN runs for venture-orchestrators means zero gate exercise for the venture path. The bridge silently shipped two regressions: (a) the generator template degenerated to the minimum-viable EHG-shape, (b) the rubric and metric gates never had a venture-orchestrator stress test added.
  - Evidence: zero accepted LEAD→PLAN handoffs in `sd_phase_handoffs` for orchestrator SDs with target_application NOT IN ('EHG', 'EHG_Engineer').
- **WHY 4**: The build-out program over the past month (VENTURE-BUILD-EXEC-001, STAGE-BUILD-MODEL-001, RECONCILE-VENTURE-BUILD-001, CROSS-REPO-AWARE-001) was scoped to the **EXEC loop** (build_model arbiter, worktree at venture repo, DESIGN sub-agent cross-repo aware). LEAD-stage venture-aware enrichment was never on those SDs' scope-locked surfaces.
  - Evidence: CROSS-REPO-AWARE-001 retro: "CAPA-1 fleet-wide resolveSubAgentRepo: DEFERRED" + the SD scope was DESIGN-only.
- **WHY 5 (ROOT CAUSE)**: The system has a **two-axis blind spot for "first-of-its-kind" SD flows**: (a) generators are tested only against the bucket they were built for, (b) gates are tuned only against the SDs that historically reach them. Whenever a new combination is exercised (venture × orchestrator × LEAD-TO-PLAN here), the generator output and the gate expectations are out of sync. There is no continuous "synthesize-and-validate" loop that exercises new SD-type × target_application combinations against the gate suite.
  - Evidence: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has 5 prior witnesses; this RCA brings the count to 9 across the three blocked gates plus the cross-repo sub-agent class.

**ACTIONABLE root cause**: Generator output shape and gate expectations were independently maintained, with no synthetic-SD smoke-test exercising new generator output through the gate suite per `(sd_type × target_application)` combination. The cure is to (1) fix the generator (give it explicit awareness of target_application + an enrichment hook for vision docs + metric/risk seeding from upstream artifacts), (2) make the gate bar explicit for `orchestrator`, (3) add a synthetic smoke test, and (4) close the cross-repo sub-agent gap that the same class will manifest in at PLAN-TO-EXEC.

---

## Fishbone summary

| Category | Contributor |
|---|---|
| **Code** | lifecycle-sd-bridge.js:260–273 hard-coded template; sub-agents hard-code `'ehg'` cwd; SD_TYPE_THRESHOLDS missing `orchestrator` entry |
| **Data** | 56/272 (20.6%) eva_vision_documents have NULL/STUB content; duplicate vision docs per venture; venture pipeline produces seed-stub instead of enriched dims |
| **Process** | No synthetic SD smoke test per (sd_type × target_application); no "first-of-its-kind" exercise gate; generator authored against a single bucket only |
| **Dependencies** | vision-scorer depends on extracted_dimensions; bridge depends on chairman-approved vision; no readiness gate between them |
| **Configuration** | applications.github_repo NULL in DB (JSON is SSOT — minor); per-venture test runner not registered |
| **Environment** | EHG-centric assumptions throughout: 6 sub-agents default to ehg cwd; stories falls to EHG_Engineer fallback |

---

## CAPA list

### CAPA-1 (P0): Lifecycle-bridge orchestrator template enrichment
- **Corrective (this SD)**: Manually backfill SD-CRONGENIUS-LEO-ORCH-SPRINT-SPRINT-2026-001 with: description ≥ 50 words (pull from sprint_goal + per-item rationale), success_metrics ≥ 3 distinct entries (e.g., Child SD completion, sprint duration adherence, build_mvp_build artifact present), risks ≥ 2 (cross-repo orchestration risk; vision-doc upstream-staleness risk). DO NOT touch the generator code under this SD's scope — scope is the orchestrator's own LEAD work.
- **Preventive (separate SD, P0)**: Update `lib/eva/lifecycle-sd-bridge.js:255–292`:
  - Description template: concatenate sprint_goal + per-item descriptions to a >=80-word block; aggregate per-item rationale into a paragraph.
  - success_metrics: emit 4 distinct metrics — (1) child SD completion ratio, (2) sprint duration adherence (days vs target), (3) cross-repo artifact presence (build_mvp_build for `leo_bridge` ventures), (4) downstream PR merge count.
  - risks: seed 2–3 baseline orchestrator risks (cross-repo blast radius, vision-doc freshness, child SD interdependency).
  - Add `pre_generation_vision_check(visionKey)`: refuse to generate the orchestrator if the linked vision doc has `extracted_dimensions IS NULL`. Error message includes the enrichment command.
- **Target SD**: New `SD-LEO-INFRA-BRIDGE-ORCHESTRATOR-TEMPLATE-001` (Tier 3, full SD)
- **Scope**: ~120 LOC (one file), no DB migration; needs sub-agent invocation + new test asserting the template produces a SD that passes computeQualityScore + validateMetricsSufficiency.

### CAPA-2 (P0): Vision-doc readiness contract + scorer error-path
- **Corrective (one-off)**: Enrich `VISION-CRONGENIUS-API-L2-001` manually OR mark it `chairman_approved=false, status='draft'` AND mark the SD vision-exempt via a per-SD metadata flag (see CAPA-3) for this one orchestrator's progression.
- **Preventive**: 
  - (a) `scripts/eva/vision-scorer.js loadVisionDimensions()`: replace the raw throw with a structured `VisionDocNotReadyError` that carries `{ visionKey, missing: ['extracted_dimensions' | 'sections' | ...], suggestedCommand }`. Gate then surfaces this to the operator as actionable remediation (current behaviour: opaque thrown error in remediation output).
  - (b) Dedup eva_vision_documents on `(venture_id, level)` — CronGenius has two L2 docs. Add a unique partial index.
- **Target SD**: New `SD-LEO-INFRA-VISION-DOC-READINESS-CONTRACT-001` (Tier 3, full SD); needs DB migration (unique index).
- **Scope**: ~150 LOC across vision-scorer.js + vision-score.js gate + migration.

### CAPA-3 (P1): Orchestrator-parent vision exemption + explicit rubric
- **Preventive**:
  - (a) Extend `vision-score.js` orchestrator-child exemption (lines 377–390) to optionally exempt **orchestrator parents** when `metadata.created_via='lifecycle-sd-bridge'` AND the linked vision doc is upstream-degenerate (NULL dims). Score the parent at 75 with a warning, NOT block. Rationale: the bridge generator's vision-doc dependency is unavoidably upstream of LEAD; blocking the parent traps the venture pipeline indefinitely.
  - (b) Add `orchestrator: { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 }` to `SD_TYPE_THRESHOLDS` in `scripts/modules/sd-quality-scoring.js` — codifies the bar that was accidentally inherited from DEFAULT. No behaviour change today; defends against future DEFAULT drift.
- **Target SD**: `SD-LEO-INFRA-ORCH-RUBRIC-EXPLICIT-001` (Tier 2, ~50 LOC).

### CAPA-4 (P0, **largest blast-radius**): Cross-repo sub-agent enforcement (fleet-wide)
- **Preventive**: Implement the deferred CAPA-1 from `SD-LEO-INFRA-CROSS-REPO-AWARE-001`:
  - Create `lib/sub-agents/resolve-sub-agent-repo.js` SSOT (factory pulling sd.target_application + applications.local_path).
  - Replace `resolveRepoPath('ehg')` hard-codes in: `security.js:93`, `performance.js:76`, `dependency.js:278`, `api.js:303`, `regression.js:34, 74`, `quickfix.js:37`.
  - Fix `modules/stories/codebase-analysis.js:35` binary fallback (currently EHG_Engineer root for non-EHG; must resolve to target_application's repo).
  - Audit `database/schema-validator.js`, `database/migration-handler.js` for cwd-defaulting (currently they assume EHG_Engineer cwd; fine for migration FILES but the SCANS need target_application).
  - Add `results.metadata.repo_resolved` to every sub-agent result row (top-level, per the CROSS-REPO-AWARE-001 R3 lesson: results-storage strips findings/sub_agent_results but persists top-level).
  - Add a fail-closed gate: `EVIDENCE_REPO_MATCH_TARGET_APPLICATION` at PLAN-TO-EXEC that rejects sub_agent_execution_results rows where `metadata.repo_resolved` is missing or doesn't match `sd.target_application`.
  - Defense-in-depth at TWO layers (per multi-layer CAPA requirement for cross_cutting): (1) sub-agent runner emits repo_resolved, (2) gate validates it. Either layer alone is insufficient — a future sub-agent author could omit the metadata, and the gate must catch it.
- **Target SD**: `SD-LEO-INFRA-FLEET-RESOLVE-SUB-AGENT-REPO-001` (Tier 3, full SD; ~250 LOC across 8 files + 1 new gate + 1 new helper; ESLint rule to ban cwd defaults in `lib/sub-agents/**`).

### CAPA-5 (P1): Per-target-application test runner registry
- **Preventive**: Add `applications.test_runner` column (enum: vitest/playwright/bun/jest/pytest/none) + selector in `regression.js`, `quickfix.js`, `testing.js`. CronGenius needs `bun` not `vitest`. When children of venture orchestrators run TESTING/REGRESSION sub-agents, the runner is selected from the resolved repo's manifest/lockfile, with the registry as authoritative override.
- **Target SD**: `SD-LEO-INFRA-VENTURE-TEST-RUNNER-001` (Tier 3); needs DB migration + sub-agent updates + tests.

### CAPA-6 (P2): Synthetic SD smoke test per (sd_type × target_application)
- **Preventive**: New CI job `synthetic-sd-gate-matrix`: for every (sd_type × target_application) combination present in current generators, synthesize a representative SD via the generator, run it through the full LEAD-TO-PLAN gate suite, fail CI on any new combination that produces a fail-loop. Catches generator regressions AND gate-rubric drift the moment a new combination is exercised. **This is the closure for the root cause**: prevents future "first-of-its-kind" surprises.
- **Target SD**: `SD-LEO-INFRA-SD-GATE-MATRIX-SMOKE-001` (Tier 3); ~200 LOC + GH Actions workflow.

### CAPA-7 (P2): Bridge–DB github_repo writer-consumer parity
- **Preventive**: When `lifecycle-sd-bridge` (or any venture-create flow) populates `ventures.repo_url`, mirror to `applications.github_repo`. Currently CronGenius has `applications.github_repo=NULL` even though the JSON registry has it set; consumers reading the DB column directly fall back to null. Lower severity (JSON is SSOT for active resolvers) but it's the same asymmetry class. Eliminate the divergence.
- **Target SD**: `SD-LEO-INFRA-APPLICATIONS-GITHUB-REPO-SYNC-001` (Tier 2, ~50 LOC + backfill script).

---

## Severity / scope / Tier matrix

| CAPA | Severity | Scope | Tier | DB migration |
|---|---|---|---|---|
| CAPA-1 corrective | P0 | 1 SD (data fix) | Tier 1 (≤30 LOC equivalent — just enrichment) | No |
| CAPA-1 preventive (bridge template) | P0 | 1 file, ~120 LOC | Tier 3 | No |
| CAPA-2 (vision readiness) | P0 | 3 files | Tier 3 | Yes (unique index) |
| CAPA-3 (orchestrator rubric + exemption) | P1 | 2 files, ~50 LOC | Tier 2 | No |
| CAPA-4 (fleet resolve sub-agent repo) | **P0 — fleet** | 8+ files, new gate, new helper | Tier 3 (force per risk keyword: cross-cutting) | No |
| CAPA-5 (test runner registry) | P1 | 4 files + migration | Tier 3 | Yes (column add) |
| CAPA-6 (synthetic SD smoke) | P2 | New CI workflow + test harness | Tier 3 | No |
| CAPA-7 (applications.github_repo sync) | P2 | bridge + backfill | Tier 2 | No |

---

## Recommended sequencing (operator decision)

1. **Now (this session)**: CAPA-1 corrective only (data-fix this SD's description/metrics/risks so it can progress). DO NOT inline-fix the generator under this SD's LEAD scope-lock — that's a separate SD.
2. **Immediately next**: file CAPA-4 (P0 fleet cross-repo). The cross-repo sub-agent gap will bite CronGenius's 3 feature + 2 infra children at PLAN-TO-EXEC; fixing it now prevents a fan-out of false-positive evidence.
3. **Before next venture orchestrator (CronLinter, Canvas AI queued)**: CAPA-1 preventive + CAPA-2 + CAPA-3. These three together unblock the bridge for future ventures and remove the manual data-fix from the loop.
4. **Defense in depth**: CAPA-5, CAPA-6, CAPA-7 — file as P1/P2 follow-ups.

## What NOT to do

- Do NOT add an SD-level vision_addressable_dimensions override on CronGenius — that would mask the empty vision doc, not address it (and the orchestrator's `null`-patterns path would auto-detect dims at the 50-floor anyway).
- Do NOT lower SD_REQUIREMENTS.minimumMetrics. The 3-minimum is grounded in completed-orchestrator avg of 6 metrics; the generator is the outlier.
- Do NOT exempt the CronGenius orchestrator individually via OPTIONAL_OVERRIDE in validation_gate_registry — that's per-sd_type, not per-SD; would weaken every orchestrator.

---

## Witness tally

- PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001: prior count 5 → +4 here = 9
  - W6: generator success_metrics=1 vs gate minimumMetrics=3
  - W7: generator description ~40–60w vs gate DEFAULT minDescriptionWords=50
  - W8: bridge writes metadata.vision_key without enriching upstream vision doc (writer assumes pre-enriched, consumer requires extracted_dimensions)
  - W9: 6 sub-agents write `resolveRepoPath('ehg')` results, gate consumes target_application
- PAT-CROSS-REPO-BLIND-SPOT-001: prior count 0 → +1 (W1 = the cross-repo sub-agent class on venture children)
