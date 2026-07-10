# Stage-0 Flaw Ledger — Charlie (Leg B, full R1-R10 coverage audit)

**Auditor:** Charlie (Fable seat, session 2d178139) — 2026-07-10, chairman-ratified re-weight directive (14:24Z).
**Territory:** full R1-R10 spec-vs-implementation COVERAGE of `lib/eva/stage-zero/*` against `docs/design/stage-zero-greenfield-spec.md` — the systematic R-by-R matrix, complementing Bravo (six delta-predictions, deep) and Delta (anti-stub classes, 24 findings). Findings here are NET-NEW or state-changes; Bravo/Delta receipts are cross-referenced, never re-argued.
**Anchor:** all citations read from `main` @ `d8dea16ff2f` (merge #5809). This audit ran AFTER four Stage-0 SDs merged same-day — `STAGE0-ENGINE-FAIL-CLOSED-001` (c814ebd1), `STAGE0-GOVERNED-POSTURE-001` (fc0ea536, #5806), `STAGE0-TRAVERSABILITY-GATE-001` (fc77f229, #5810), `STAGE0-THESIS-CONTRACT-001` (e4456fac+cb16a9dbd, #5809) — so several Bravo/Delta CONFIRMEDs have moved. The delta cuts both ways per the spec's own rule; the RESOLVED-TODAY section credits what landed.
**Method:** three cited evidence sweeps (R1/R7/R9; R2/R3/R5/R6; R4/R8/R10 current-state re-verification), gathered by sub-agents with verbatim file:line receipts and explicit NOT-FOUNDs; adjudicated cold by Charlie. Live-DB verifications via service-role reads (selection_postures rows, venture_briefs/stage_zero_requests recency, v_unified_capabilities shape).

---

## R-by-R coverage matrix (current main, 2026-07-10 ~15:30Z)

| R | Status | One-line verdict |
|---|--------|------------------|
| R1 WIP discipline | **RED** | No WIP limit exists anywhere (extends Delta H8, unchanged today); kill-cheap pre-persistence mechanics genuinely hold, but "before chairman PICK" collapses because the PICK gate doesn't pause (R7). |
| R2 Governed posture | **AMBER** | Posture machinery is REAL and fail-closed as of today (#5806) — but transitions are raw-SQL-only, anti-goals/hard-criteria are inert text, and it reaches 1 of 4 entry paths while a second ungoverned score still computes for every brief. |
| R3 Falsifiable thesis | **AMBER** | Generation is universal and validated as of today (#5809): who-pays/what/how/price + demand-test plan + 3 machine-consumable kills on every brief. Consumption is dormant scaffolding — `evaluateKillCriterion` has zero production callers. |
| R4 Evidence grading | **RED** | No grading mechanism exists; "E0 ungraded" appears only as a hand-written string label in thesis price_point; the VALUE-AUTHENTICITY-SPEC-002 L3/L4 machinery has zero importers outside its own tests. (An unmerged branch `feat/SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001` targets this — not on main.) |
| R5 Explicit decisions | **AMBER→GREEN** | form_factor is a CLOSED LOOP (produced → persisted → consumed by `venture-build-consumer.js` stack gate). Pricing-model decision absent (registry pinned to exactly one key); hosting is a ratified standard, not a per-venture decision artifact (spec itself calls it the template). |
| R6 Capability envelope | **AMBER** | `traversability-gate.js` is real, fail-closed, honest-pass — but armed on 1 of 5 discovery strategies (only trend_scanner prompts `required_capabilities`) and 1 of 4 entry paths; everything else auto-passes via `no_requirements_declared`. |
| R7 Chairman authority | **RED** | Delta C1 (auto-commit + forged approval record) CONFIRMED UNCHANGED on current HEAD — none of today's four SDs touched the decision logic. Worse: the ordinary non-'ready' park path is now a LIVE hard-failure (CH-1). No app-layer posture ratification surface exists. |
| R8 Own authenticity gate | **AMBER** | Big fix landed today (ENGINE-FAIL-CLOSED-001): components_run computed, maturity blocks on component failure, canary test real — Delta C4/Bravo-1's cited receipts RESOLVED. Residual: C5 substring-pass and C6 score-inflation quirks unchanged; the keyless-stub default-substitution path (non-throwing) survives ungated and untested. |
| R9 Run shape/provenance | **AMBER** | On-demand-not-continuous REFUTED-prediction stands (good). posture_version now stamps the run request — but is DROPPED at venture creation (CH-7); the full candidate set is still discarded at synthesis (Delta H9 unchanged); origin_type satisfies provenance in substance, not the spec's four-way letter. |
| R10 Acceptance | **RED** | 10.1: hard negative — zero Phase-1 posture-run artifacts exist (venture_briefs newest 07-01, predates and cannot carry thesis fields; stage_zero_requests newest 05-31). 10.2: only the explicit-throw stub class fails mechanically; the real `_inline_required` keyless stub is untested end-to-end. |

**Bottom line:** today's four SDs moved R2/R3/R5/R6/R8 from "does not exist" to "real primitive, narrow coverage." The recurring structural gap is COVERAGE (new governance wired into one path/strategy while three paths + the shared fail-open profile scorer run ungoverned), and the single deepest unmoved flaw remains R7's auto-commit (Delta C1). R4 and R10 are the untouched reds.

---

## NEW FINDINGS (net-new vs Bravo/Delta, severity-ordered)

### CH-1 — R7 CRITICAL: the ordinary park path is a LIVE hard-failure — `parkVenture()` writes columns that do not exist
- `lib/eva/stage-zero/venture-nursery.js:41-63` — `parkVenture()` INSERTs `problem_statement, solution, target_market, origin_type, raw_chairman_intent, maturity, parked_reason, status, metadata` into `venture_nursery`.
- Live schema (`database/migrations/20260209_stage0_venture_entry_schema.sql:70-105`, confirmed vs `database/schema-reference-snapshot.json`): **none of those nine columns exist** (real shape: `name, description, maturity_level, trigger_conditions, current_score, score_history, source_type, source_ref, ...`).
- `chairman-review.js:253` calls `parkVenture()` on **every non-'ready' maturity** (`seed`/`sprout`/`blocked`/`nursery`); the PostgREST column error throws (`venture-nursery.js:65`), propagates uncaught through `persistVentureBrief` → `executeStageZero`, and `scripts/stage-zero-queue-processor.js:407-436` marks the **whole request failed**.
- Self-acknowledged, worked-around, not fixed: `traversability-gate.js:16-21` says *"venture-nursery.js parkVenture()/runNurseryReeval() are drifted against the live table (flagged separately, feedback ecab6c51)"* and writes the correct live columns itself (`:167-194`) instead of calling `parkVenture()`. Sibling dead READ path (`paths/discovery-mode.js:553-557` nursery_reeval SELECT) carries the same drift with an in-code KNOWN-BROKEN note.
- **Delta vs prior ledgers:** Delta C8 covered the *dead resurfacing read path*; this is the *live write path* on the routine chairman-review branch — a functional regression class, not dead code. Every non-'ready' Stage-0 run today ends `status:'failed'`.

### CH-2 — R2/R8 CRITICAL: dual scoring survives the posture merge — a second, fail-OPEN, ungoverned score still computes for EVERY brief
- Governed posture reaches exactly one site: `paths/discovery-mode.js:117-119` (`resolveActivePosture` → `rankCandidates`). `grep -l "rankCandidates\|resolveActivePosture\|checkTraversability" lib/eva/stage-zero/paths/*.js` → **only discovery-mode.js**; `blueprint-browse.js`, `competitor-teardown.js`, `venture-reseeding.js` never resolve a posture.
- Meanwhile ALL FOUR paths funnel through `synthesis/index.js` (`:63,84-90,186-190,321`), which computes `weighted_score` via the OLD `resolveProfile`/`calculateWeightedScore` over `evaluation_profiles` — a **fail-open** system (`profile-service.js:53-109`: four paths fall back silently to `LEGACY_WEIGHTS`). Extends Delta H2 into the post-posture world: the R2 "gauge-vs-action divergence" class the posture was built to eliminate is still live one layer down, on every brief.

### CH-3 — R2 HIGH: anti-goals and hard criteria are inert display text
- `selection_postures.criteria.anti_goals` (long sales cycles / content moats / app-store / regulatory) and `criteria.hard_criteria` verified present in the live active row — but `grep -rn "anti_goals" lib scripts --include=*.js` → **zero hits**. Nothing filters, disqualifies, or gates on them. The spec's "auto-disqualify" is unimplemented; the posture carries the policy but only the weights leg is mechanical.

### CH-4 — R2/R7 HIGH: no application-layer posture ratification/transition surface; expiry condition never evaluated
- Only READ-side code exists (`profile-service.js:394-443`). No `activatePosture()`/write path anywhere in `lib/`; the only writes are the migration's own seed INSERTs. `transition_condition`/`expiry_condition` columns are populated (`expiry_condition: 'one venture completes all 26 stages...'`) but `grep -rn "expiry_condition" lib scripts` → pass-through select only, never evaluated.
- The DB CHECK (`status <> 'active' OR ratified_at IS NOT NULL`) is satisfiable by any service-role writer with arbitrary `ratified_by` text — chairman ratification is a naming convention, not an enforced identity. Phase-1→Phase-2 is a raw-SQL manual flip.

### CH-5 — R3 HIGH: kill-criteria consumption is dormant scaffolding
- `thesis-contract.js:82-107` `evaluateKillCriterion` — the module's own "O2-gate consumption seam" — has **zero callers** outside its definition and unit test. `grep -rln "kill_criteria" lib | grep -v stage-zero` → empty; checked `exit-gate-verifiers.js`, `exit-gate-enforcer.js`, venture-state-machine, golden-nugget validators. The `chairman-review.js:141` comment ("S20-26 O2 launch gate arms them as live gauges") is aspirational. Spec R3's load-bearing clause — *gates evaluate the thesis's own falsifiers* — remains unmet even though the falsifiers now exist on every brief.

### CH-6 — R6 HIGH: the traversability gate is armed on 1 of 5 strategies and 1 of 4 paths
- `required_capabilities` is prompted only in `runTrendScanner` (`paths/discovery-mode.js:309-312`); `runDemocratizationFinder` (:340), `runCapabilityOverhang` (:398), `runSimpleVentureFinder` (:472), `runNurseryReeval` (:536) never populate it — their candidates always take the honest-but-inert `no_requirements_declared` auto-pass (`traversability-gate.js:114-118`). The other three entry paths never call `checkTraversability` at all. The gate itself is well-built (fail-closed `EnvelopeUnavailableError`, live `v_unified_capabilities` view over 4 real tables, machine-readable park conditions) — the flaw is reach, not mechanism.

### CH-7 — R9 HIGH: the posture-version stamp dies at venture creation
- `posture_version`/`posture_criteria` ride `raw_material` + `metadata` through synthesis into `stage_zero_requests.result` (queue-processor `:397-403`) — the run log is reproducible. But `chairman-review.js` `persistVentureBrief` (:138-169) and `persistBriefRecord` (:271-304) build their metadata field-by-field and include **no posture fields** (`grep posture chairman-review.js` → 0). The durable venture record carries no trace of which posture ranked it — the R9 reproducibility chain breaks exactly at the record that matters longest.

### CH-8 — R8/R10 HIGH: the non-throwing keyless-stub path survives today's fail-closed fix, untested
- ENGINE-FAIL-CLOSED-001 gates components whose promise **rejects**. The real stub scenario (Delta C4): `lib/llm/client-factory.js` keyless `_inline_required` JSON parses fine; modules like `archetypes.js:88-105` default-substitute silently (`primary_archetype` undefined → `'automator'`, confidence 50) and **return normally, no `_failed` flag**. `grep _inline_required tests/` → 5 hits, none under `eva/stage-zero`. R10.2's "stub must fail mechanically" is proven only for the explicit-throw class; the original C4 scenario has no regression test and no gate.

### CH-9 — R1 MEDIUM: WIP limit still absent end-to-end (state-change check on Delta H8: unchanged)
- Repo-wide greps (`wip|WIP_LIMIT|max_live|active.venture.count`) → zero. `queue-processor.js:443-461` claims the next pending request with no active-venture-count gate; nothing in orchestrator/chairman-review counts live ventures before creating another. The spec's "first-class chairman-adjustable setting, default 1" has no representation in code or config. (Exonerating note, R1's other half: no entry path persists candidates before review — `grep .insert( paths/` → zero — kill-cheap pre-persistence genuinely holds, `dryRun` seam included, `stage-zero-orchestrator.js:150-161`.)

### CH-10 — R5 MEDIUM: the explicit-decision registry has exactly one key
- `thesis-contract.js:236-244` `EXPLICIT_DECISIONS` = `{ form_factor }` only, and the unit test pins it (`thesis-contract.test.js:188`). Pricing model — named by the spec as governed by the same pattern — is absent. Hosting exists as the ratified stack standard (`venture-stack-policy.js:13-22`, CD30) but not as a selection-time decision artifact; the spec's own text treats that as acceptable ("hosting already ratified = the template"), so this is a gap only for pricing.

### CH-11 — R4 MEDIUM: "E0" exists as prose, not mechanism — and the shipped L3/L4 authenticity machinery reaches nothing
- The only E0 references on main are hand-written labels inside thesis strings (`thesis-contract.js:159,163` — honest, but not a computed grade and invisible to ranking). `lib/value-authenticity/weakest-link.js` / `panel-assembly.js` / `divergence-router.js` (SPEC-002, merged 5299ac7a) are imported **only by their own tests** — zero production consumers; `synthesis/index.js`'s two "weakest-link" mentions are comments about the unrelated maturity gate. Ranking still ingests `parseRevenuePotential`/LLM TAM-SAM-SOM (`modeling.js:115-141`) ungraded. NOTE: unmerged branch `feat/SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001` (a7d52cfb3fe, based pre-#5809/#5810) targets exactly this — adjudicator should sequence it against this ledger rather than mint a duplicate.

### CH-12 — R10.1 MEDIUM (hard negative, with receipts): no Phase-1 posture run has ever produced an artifact
- `venture_briefs` newest row 2026-07-01 (schema predates thesis fields and cannot carry them); `stage_zero_requests` newest 2026-05-31 (`dismissed`); today's only new `ventures` rows are e2e fixtures (`origin_type:'manual'`, empty metadata). The spec's live acceptance fixture — a Phase-1 pick with full-traversal plan + pre-registered kills over the current pool — does not exist. Blocked in practice by CH-1 (any non-'ready' run hard-fails) and R7-C1 (a 'ready' run would auto-commit, which nobody should trigger deliberately).

---

## RESOLVED TODAY (the delta cutting the other way — credit where landed)

| Prior finding | Status on d8dea16ff2f | Receipt |
|---|---|---|
| Delta C3 / Bravo-3 (no posture concept) | **PARTIALLY RESOLVED** by #5806 | `resolveActivePosture` fail-closed (`profile-service.js:394-443`); live `selection_postures` rows chairman-ratified 12:57Z; `DEFAULT_RANK_WEIGHTS` deleted; run stamps posture_version. Residuals → CH-2/CH-3/CH-4/CH-7. |
| Delta C4 / Bravo-1 (gauge 15/15 on dead engine; total-failure run emits 'ready') | **RESOLVED (cited receipts)** by ENGINE-FAIL-CLOSED-001 | `synthesis/index.js` computes `components_run` from actual results; maturity blocks 'ready' on any gating-component failure (14/15 gating, documented exclusion); canary test `synthesis-fail-closed.test.js`. Residual → CH-8 (non-throwing stub class). |
| Delta C7 (scores, not theses) | **PARTIALLY RESOLVED** by #5809 | `buildThesisFromSynthesis` + `deriveDefaultKillCriteria` + `buildExplicitDecisions` run unconditionally on every brief (`synthesis/index.js:254-278`), validated in `interfaces.js:124-147`, persisted in `chairman-review.js:139-145`. Residual → CH-5 (consumption dormant). |
| Spec delta-prediction R5 (silent web assumption) | **RESOLVED (core loop)** by #5809 | form_factor decision registry + `venture-stack-policy.js:52-64` appliesWhen + consumed by `venture-build-consumer.js:166-192,411-414` (real production gate). Residual → CH-10 (pricing). |
| Spec delta-prediction R6 (no capability envelope) | **PARTIALLY RESOLVED** by #5810 | `traversability-gate.js` real + fail-closed over `v_unified_capabilities`. Residual → CH-6 (reach), and the ledger→`sd_capabilities` feed is unverified (PARTIAL). |
| Delta prediction #4 (continuous background generation) | **REFUTED stands** | Queue poller processes only chairman/UI-submitted `stage_zero_requests`; cadence is infrastructure, not autonomous generation. |

## UNCHANGED (cross-refs, re-verified current — no re-argument)
- **Delta C1 (R7 auto-commit + forged approval): CONFIRMED UNCHANGED** — `chairman-review.js:54-56` maturity→decision mechanical; `:98-198` 'ready'→INSERT ventures active; `:200-222` synthetic `chairman_decisions` 'proceed' row; `:14` real gate import still underscore-parked; queue-processor still forces `nonInteractive:true` (:215/:224/:237); `chairman-decision-watcher.js:72-82` fallback stage-set excludes stage 0. The deepest R7 flaw is untouched by today's work.
- Delta C5 (chairman-constraints substring passes), C6 (fail→max score quirks in `profile-service.js:236-241`, archetype-confidence ×100 clamp), H1 (strategic-fit constant 50 — caller still passes no strategicContext), H9 (candidate set dropped at synthesis — `synthesis/index.js` return literal never references `raw_material`), Delta H5 (persistence writes swallow errors on the 'ready' path).

## NOT-FOUND appendix (greps run, zero hits, current main)
`wip|WIP_LIMIT|max_live|maxConcurrentVentures` (R1) · `anti_goals` consumers (R2) · `activatePosture|expiry_condition` evaluators (R2) · `evidence_grade|source_grade|weakest.link|E[0-3]\b` structural fields in stage-zero (R4) · `triangulat` in stage-zero (R4) · chairman `waiver` near stage-zero (R4) · `kill_criteria` consumers outside stage-zero (R3) · `canary|seeded_defect|mock.distinguish` in stage-zero lib (R8) · Stage-0 kill-authority surface distinct from maturity mapping (R7) · pricing_model in EXPLICIT_DECISIONS (R5).

---

*Complete. Adjudication input per the 14:24Z directive: findings fold into the EXISTING SD set at adjudication (no new mints). Highest-leverage folds by blast radius: CH-1 (live park-path break — fold into the nursery-drift fix feedback ecab6c51 already routed), CH-2+CH-3+CH-4 (posture reach/consumption — fold into the posture SD's successor scope), CH-5 (kill-criteria O2 seam — fold into the S20-26 harness build this seat reserves for next), CH-8 (stub-path canary — fold into the authenticity calibration set), R7-C1 (unchanged deepest flaw — already Delta's headline).*
