# Stage-0 Adversarial Audit — Flaw Ledger (Delta, Leg B)

**Commission:** chairman burn-now, Leg B (467cd050), Fable seat Delta — territory: anti-stub / value-authenticity failure classes.
**Spec:** `docs/design/stage-zero-greenfield-spec.md` (Solomon R1–R10; present on disk at audit time and preserved at commit `99f431b8a3b`).
**Method:** three evidence sweeps (synthesis zone; top-level/orchestrator zone; data-pollers/paths/R5 zone) with verbatim file:line receipts; findings adjudicated and deduped by Delta; refuted candidates and NOT-FOUNDs listed per adversarial-verify discipline. **COMPLETE (checkpoints 1+2).** Checkpoint-2 findings appended below; final roll-up at end.
**Consumer ground truth:** live entry chain is `scripts/stage-zero-queue-processor.js` → `stage-zero-orchestrator.js` → `synthesis/index.js runSynthesis` → `modeling.js` forecast → `chairman-review.js`; gates read `metadata.venture_score` via `lib/agents/modules/venture-state-machine/stage-gates.js:626-651`.

---

## CRITICAL

### C1 — R7 破: "Chairman review" contains no chairman; the machine manufactures the approval record and creates a live venture
- `lib/eva/stage-zero/chairman-review.js:54-56` — `decision` derived mechanically from machine-set `maturity` (`'ready'` default); no prompt, no pending decision, no wait.
- `chairman-review.js:115-136` — `decision==='ready'` → INSERT into `ventures` with `current_lifecycle_stage: 1, status: 'active'`.
- `chairman-review.js:195-212` — the pipeline writes a synthetic `chairman_decisions` row: `decision: 'proceed'`, `rationale: 'Venture meets readiness criteria'`.
- `chairman-review.js:14` — the REAL gate mechanism `createOrReusePendingDecision` is imported **underscore-parked and never called**.
- `server/routes/ventures.js:197` promises "queued for Stage 0 chairman review" while `scripts/stage-zero-queue-processor.js:215/224/237` forces `nonInteractive: true` on every request.
**Verdict:** end-to-end auto-commit from ranking to active venture with a forged approval artifact — the exact thing R7 forbids ("the machine RANKS; the chairman PICKS — no auto-commit, ever"). Architectural, not a call-site slip: the maturity→decision→insert chain has no seam for a human.

**RESOLVED 2026-07-10** by `SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001` (PR #5825, Solomon FIX-2 shape per advisory a8eafc72): 'ready' now inserts the venture `status='paused'` with `metadata.stage_zero.awaiting_chairman_decision`; the synthetic-approval insert is deleted (canned rationale grep-pinned absent); `createOrReusePendingDecision` un-parked and mints the stage-0 PENDING row fail-closed (scoped `forceDecisionCreation` — stage 0 stays out of `stage_config` so TS-7 parity and `can_auto_advance` are untouched; fixture guard still wins); a poll-side activation consumer (`lib/eva/stage-zero/decision-activation.js`, queue-processor tick) activates only on an authentic chairman approval and routes rejection to the nursery park path (sibling `STAGE0-NURSERY-PARK-PATH-001`). Machine approvers (engine `can_auto_advance` auto-approve, advisory writer) pinned unreachable by tests. Residual: the `server/routes/ventures.js` "queued for chairman review" promise is now TRUE (the pause is real); `nonInteractive: true` in the queue processor remains but no longer implies auto-approval.

### C2 — R4 破: the ranked number IS ungrounded LLM output (no source, no evidence grade, anywhere)
- `lib/eva/stage-zero/modeling.js:115-141` — LLM prompted to invent TAM/SAM/SOM dollars, 3-year revenue, CAC/LTV from concept text; `calculateVentureScore()` folds the same response into the 0–100 `metadata.venture_score` gates consume (`stage-zero-orchestrator.js:101-106`).
- `lib/eva/stage-zero/paths/discovery-mode.js:244` + `lib/eva/stage-zero/utils/parse-revenue.js:25-71` — `monthly_revenue_potential` is LLM freetext regex-parsed and weighted **0.25** in `rankCandidates`.
- Zone-wide grep: **zero** `evidence`/`E0`/`source_grade`/provenance-of-number fields exist. R4's weakest-link grading is wholly absent.

### C3 — R2 破: no posture concept exists at all (spec delta-prediction confirmed)
- `grep -ri "posture" lib/eva/stage-zero/` → 0 hits; `weight_config|posture_version` → 0 hits; "phase" hits are cosmetic labels only (`ranking-pipeline.js:29,42`, `stage-of-death-predictor.js:20-25`).
- Compounding: profile resolution **fails OPEN** to built-in weights (`profile-service.js:56-108`, four paths → `makeFallbackProfile`) where R2 demands fail-closed; the fallback is stamped (`synthesis/index.js:189-195`) but non-blocking — runs proceed on unratified weights.

### C4 — R8 破: a keyless/stub run produces a scored, `maturity:'ready'` brief — the stub does NOT fail mechanically
- `lib/llm/client-factory.js:364-372` keyless stub returns parseable JSON; every synthesis module extracts via `text.match(/\{[\s\S]*\}/)` and default-substitutes (`archetypes.js:98`, `time-horizon.js:73`, `build-cost-estimation.js:93-95`).
- Net: zero-LLM, zero-data run scores ~35-40 weighted, stamps `components_run: 15` (`synthesis/index.js:258`), derives `maturity: 'ready'` (`index.js:214-216`) → flows into C1's auto-venture. R10.2 says exactly this stub "must fail R4 and R8 mechanically."
- Exception (exonerating, recorded): `modeling.js:165-171` schema-validation DOES reject the `_inline_required` stub for the forecast leg (score→0) — the only mechanically mock-distinguishable seam found.

### C5 — R8 破: the heaviest-weighted component (`chairman_constraints`, 0.126) is substring matching a catalogue-slice passes
- `synthesis/chairman-constraints.js:125,129,137,141,162-163` — `allText.includes('ai')` (matches "m**ai**ntain", "em**ai**l"), three constraint types unconditional `'pass'`, `default: 'pass' — 'Default pass - heuristic check'`; verdict 'pass' → 100 via `profile-service.js:235`.
- **RESOLVED** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831, `chairman-constraints.js`): `AUTOMATION_SIGNAL_RE = /\b(automat\w*|ai|ai-powered|artificial intelligence|machine learning)\b/i` replaces the substring test — word-boundary matched, no longer false-positives on "maintain"/"email". The 3 previously-unconditional `'pass'` constraint types plus the generic `default:` case now emit `'warning'` with a `"Unscored - ..."` rationale instead of a free 100. Tested in `chairman-constraints.test.js` (bait words + positive whole-word control + all-evaluations invariant).

### C6 — Fail-soft polarity 破: components that FAIL score at or near their MAXIMUM
- `synthesis/index.js:107-110` failed time-horizon → `position:'build_now'` → `profile-service.js:237` → **100** (weight 0.09). (Bonus dead branch: `:238` scores `'build_soon'`, a value `VALID_POSITIONS` can never emit.)
- `profile-service.js:241` archetype confidence unit bug: 0-100-scale confidence × 100 → clamped **100 for every venture including the parse-garbage fallback (50)** — the component is a constant.
- `synthesis/index.js:214-216` — maturity blocks only on `verdict==='fail'`; a DEAD constraints or time-horizon subsystem defaults to `'ready'` → C1 auto-creation.
- `synthesis/index.js:258-259` — `components_run: 15` stamped unconditionally over 14 catch-defaults: the gauge always reads full (gauge-vs-action).
- **RESOLVED (score-number half)** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831, `profile-service.js`): the maturity-gating half was already fixed by SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 (stamps `_failed:true`, gates `baseMaturity`), but `extractComponentScore` never read `_failed` — this SD adds `if (result._failed === true) return 0;` as the first line of `extractComponentScore`, a single chokepoint closing the numeric-score half for all 11 `VALID_COMPONENTS` at once. Also fixed as a direct byproduct: the archetype confidence unit bug (`clamp(result.primary_confidence ?? 0, 0, 100)`, removed the erroneous `* 100`) and the dead `'build_soon'`/missing `'window_closing'` branches. Proven zone-wide by a `test.each(VALID_COMPONENTS)` parameterized suite in `profile-service.test.js`, plus a negative control confirming genuine success still scores unchanged (`failed:false`). Residual: the `components_run: 15` gauge-vs-action stamp is untouched — out of this SD's scope.

### C7 — R3 破: output is a scored brief, not a falsifiable thesis
- No how-reached/channel or price-point fields anywhere (`chairman-review.js:117-163` persisted fields enumerated); `grep -ri "kill_criteria|demand.test"` → 0 hits.
- Downstream gates use generic invented thresholds (`profile-service.js:299-322` `LEGACY_GATE_THRESHOLDS`, blanket `?? 0.5` at `:342`) — precisely the gate-realism failure R3 exists to prevent.

### C8 — R7 破: nursery resurfacing is dead code and its trigger conditions are never evaluated
- `git grep checkNurseryTriggers|reactivateVenture` → defining file + re-export + tests only; **no production caller**.
- `venture-nursery.js:230-241` — checks only `next_review_date <= now`; `trigger_conditions` copied to output, never evaluated. Parked ideas are guaranteed-silently lost.

---

## HIGH

### H1 — Strategic-fit weight (0.15) advertised, computes a constant 50 for every candidate
`paths/discovery-mode.js:112` calls `rankCandidates(candidates)` without the `strategicContext` in scope at `:79`; `:693` → `computeStrategicFit(c, null)` → `utils/strategic-fit.js:22-27` returns 50. Only production call site. Honest attribution note: `:709` omits it from `score_attribution` when null — the stamp is honest, the capability is dead.

### H2 — Two parallel weight systems; the deciding scores never touch the configurable profiles
Hard-coded `DEFAULT_RANK_WEIGHTS` (`discovery-mode.js:637-643`, no caller overrides) + hard-coded `RUBRIC_WEIGHTS` (`modeling.js:219-241`) produce the pick and `venture_score`; the profile-weighted composite lands in `metadata.synthesis.weighted_score` which **no live code reads** (repo-wide grep). The `agentic-fit.js:17` FR-4 claim ("weighted COMPONENT of venture_score") is false at runtime.

### H3 — `analyzeAgenticFit` calls the LLM with the wrong signature — every production request is mangled
`synthesis/agentic-fit.js:259` `client.complete({prompt, temperature, maxTokens})` vs canonical `complete(systemPrompt, userPrompt, options)` (`client-factory.js:429`; all 12 siblings). Production adapter effect (`lib/sub-agents/vetting/provider-adapters.js:568,574,112`): user turn becomes literally "Hello", options JSON-stringified into systemInstruction, decoding controls unreached; throw fails soft to a zero-fit record (`agentic-fit.js:282-290`).

### H4 — Stage-gates' declared Stage-0 provenance is never reached (reader/writer shape mismatch)
Reader `stage-gates.js:640-648` expects `result.rubric_scores`/`result.venture_score` top-level; live writer `stage-zero-queue-processor.js:399` nests them under `result.brief.metadata.*`. Only archived one-time scripts wrote the read shape. `stage0Score` silently `undefined` on the live path.

### H5 — Governance persistence swallowed as "non-fatal"
`chairman-review.js:213-215` (chairman_decisions), `:228-230` (Stage-0 artifact), `:294-296` (venture_briefs): insert failures warn-and-continue — ventures advance without their decision artifacts (R7 governed persistence). Same class: `gate-signal-service.js:44-47,66-69`, `chairman-override-tracker.js:28-63` return null on failure.

### H6 — Portfolio DB outage manufactures a 70/100 "first venture" score with a false narrative
`synthesis/portfolio-evaluation.js:89-91` error→`[]` + `:43-59` empty→`composite_score: 70, recommendation: 'proceed', summary: 'First venture in portfolio…'` — outage indistinguishable from empty portfolio; also a stub-reproducible constant.
- **RESOLVED** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831, `portfolio-evaluation.js`): `loadPortfolio` now throws on a DB error instead of returning `[]`; `evaluatePortfolioFit` wraps the call in try/catch and returns `{composite_score:0, portfolio_size:null, recommendation:'review', summary:'Portfolio outage...', _failed:true}` on outage — the genuine-empty-portfolio branch (`composite_score:70`) is untouched, so outage and empty are now distinguishable. Tested in `portfolio-evaluation.test.js` (empty vs outage cases, mocked query chain matching production).

### H7 — Forecast failure indistinguishable from worst venture; run proceeds scoreless
`modeling.js:187-190` catch → confidence 0 → score 0; `dual-evaluator.js:97` collapses failed/absent/genuine-zero; `stage-zero-orchestrator.js:108-110` catches forecast throw and proceeds to (auto-)review.
- **RESOLVED** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831, `modeling.js` + `stage-zero-orchestrator.js` + `dual-evaluator.js`): `defaultForecastResult` now includes `_failed:true`; the orchestrator's forecast-catch block stamps `synthesisResult.metadata = {...metadata, venture_score:0, forecast_failed:true}` instead of leaving `venture_score` silently absent; `dual-evaluator.js`'s `defaultEvaluator` distinguishes a genuine 0 from a missing score via `venture_score_missing: ventureScore == null` (changed from `||` to `??`/`== null` throughout). Tested in `modeling.test.js`, `stage-zero-orchestrator.test.js` (asserts a marked `venture_score:0`, not silent absence, on forecast throw), and `dual-evaluator.test.js`.

### H8 — R1/R7 absences: no WIP limit, no kill authority surface
`grep -ri "wip"` → 0 hits; `persistVentureBrief` inserts unconditionally (only a duplicate-name idempotency guard). No chairman kill mechanism exists in the zone.

### H9 — R9 evidence-snapshot/candidate-set dropped: the pick is non-reproducible
Ranked candidates live only in `pathOutput.raw_material.candidates` (`discovery-mode.js:120-126`); the persisted brief/run record carries top-1 + counts only (`synthesis/index.js:236-237`, `stage-zero-orchestrator.js:178-192`). The chairman can never see candidates 2-N.

### H10 — All remaining weighted components are raw LLM passthrough (E0) into the composite
`moat-architecture.js:83` (0.117), `virality.js:99` (0.117), `tech-trajectory.js:169-171` (0.045), `cross-reference.js:66` (0.09), `portfolio-evaluation.js:69` (0.09); aggregator breakdown (`profile-service.js:193-216`) has no provenance/grade fields.

---

## MEDIUM

- **M1** `profile-service.js:222-256` categorical→number maps (reframing 70/20; build_cost 90/60/30/50; time-horizon 100/75/25/50) presented as component scores. **RESOLVED (transparency)** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831): `calculateWeightedScore`'s breakdown entries now carry a `categorical: CATEGORICAL_COMPONENTS.has(component)` flag (`CATEGORICAL_COMPONENTS = {problem_reframing, build_cost, time_horizon, chairman_constraints}`) so downstream consumers can distinguish a bucket-derived number from a continuous measurement. Scope is provenance labeling, not re-deriving the underlying bucket values. Note: implemented correctly but not locked by a dedicated test (PLAN_VERIFICATION finding) — tracked as a completion-flag follow-up.
- **M2** `discovery-mode.js:746-756` `scoreTargetMarketSpecificity` — regex-feature-manufactured 0-100 at weight 0.20.
- **M3** `strategic-context-loader.js:232-241` — hard-coded "$4.8B / 34% CAGR" agent-economy 'data' injected into every prompt, no as-of/source. **RESOLVED (labeling)** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831): `getAgentEconomyContext` (now exported) stamps `evidence_grade: 'E0'` and the prompt section header is labeled `"AGENT ECONOMY CONTEXT (E0 — ungrounded, static placeholder, no source/as-of-date; treat as directional only)"`. Data is preserved, not deleted — this rides the SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001 evidence-grading convention. Tested in `strategic-context-loader-agent-economy.test.js`.
- **M4** `synthesis/tech-trajectory.js:42,47,147` — declared `dataFeed` external source has no caller anywhere; `data_feed_active` always false yet score carries weight. **RESOLVED** by SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-B (PR #6246): new `lib/eva/stage-zero/data-feed.js` `createStageZeroDataFeed(supabase)` exposes an honest-idle `getTechSignals()` that reads Child A's standing `research_intelligence_reference` table (`is_current` `tech_landscape`/`model_landscape` rows); `stage-zero-orchestrator.js` constructs and injects that feed at the single production site (the `enrichedDeps` line) so `analyzeTechTrajectory` receives it and stamps `data_feed_active: true` once live rows exist. The feed returns `null` on empty/error, so the prior training-data fallback is preserved byte-for-byte when nothing is live. An audit of all 14 synthesis components confirmed tech-trajectory is the only starved `dataFeed`-shaped hook (M5 below is advisory-only, not a `dataFeed` injection point). Tested in `data-feed.test.js` + `stage-zero-orchestrator-datafeed.test.js`.
- **M5** `attention-capital.js:71` / `narrative-risk.js:87-91` — sub-dimensions claim measurement of external signals with zero runtime reach (advisory-only, partially disclosed — hence MEDIUM). (Deliberately out of scope for SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 — deferred, see PRD TR-2.)
- **M6** `synthesis/index.js:129` + `narrative-risk.js:183` — failed narrative-risk reads `nr_score: 0` = numerically SAFEST band (risk-polarity inversion; inconsistent with attention-capital's fail→worst). **RESOLVED** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831, `narrative-risk.js`): `defaultNarrativeRiskResult`'s `nr_score` changed `0` → `100` (the correct worst-band value for this higher-is-worse metric) plus `_failed: true`. Tested in `narrative-risk.test.js` (both failure paths assert `nr_score:100` + `_failed:true`).
- **M7** Advisory outputs (`narrative_risk`, `attention_capital`, `mental_model_analysis`) computed every run, read by nothing in this repo (token burn + dead output; UI-repo caveat noted). (Deliberately out of scope for SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 — deferred, see PRD TR-2.)
- **M8** Import-depth latents: `modeling.js:155-166` (validation+repair imports inside the try whose catch disables the forecast); `synthesis/cross-reference.js:170` (domain-knowledge import failure ≡ "no patterns found"). **RESOLVED (observability only)** by SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (PR #5831): both dynamic imports isolated into their own try/catch with a distinct `INTERNAL_IMPORT_FAILURE` log-warn marker, ahead of the pre-existing outer try/catch — an internal module-resolution bug is now distinguishable in logs from an ordinary external LLM/DB failure. Return-value contract unchanged (`defaultForecastResult`/`[]`) — no scoring behavior change, so no dedicated failure-injection test was written (self-disclosed gap, PLAN_VERIFICATION-confirmed acceptable).
- **M9** `ranking-pipeline.js:51-67` — trend-scanner throw → valid-shaped fallback PathOutput flows on; `metadata.rankingDataAvailable` has no consumer found.
- **M10** Rank weight vector not stamped per run (`score_attribution` lists field names, not weights — `discovery-mode.js:705-717`).
- **M11** `portfolio-allocation.js:34-65` / `strategy-loader.js:26-33` / `strategic-context-loader.js:63-156` — outage ≡ unconfigured (fail-soft to defaults/[]).

## LOW

- **L1** `modeling.js:180` `confidence || 30` falsy-coercion (explicit 0 → 30).
- **L2** `chairman-constraints.js:101-103` silent DB-load swallow; `mental-model-analysis.js:42-55` 8s race → null ≡ no-match; `build-cost-estimation.js:124-127,133` failed estimate → 'moderate' → 60.
- **L3** `profile-service.js:238` dead `'build_soon'` branch (unreachable value).

---

## REFUTED CANDIDATES (survived scrutiny — evidence the code, not the spec, is right here)

1. **Hash/charCode score fabrication** — NOT FOUND anywhere in the zone; the fabrication vector is LLM-passthrough + fail-soft defaults, not string hashing (zone-wide grep; only profile-blender's config-integrity SHA `profile-blender.js:238-244`).
2. **`build-cost-estimation.js`** — the exemplar done right: `infra_cost_provenance = 'ESTIMATE' | 'DERIVED-from-operating-model'` (`:100-105`), genuinely reaches the operating-model SSOT and house-stack config at runtime.
3. **`cross-reference.js` provenance** — genuinely reaches 4 DB tables + domain-knowledge service and hard-throws without supabase (`:30-32`); only its final relevance_score is LLM-authored.
4. **Continuous background generation (R9 prediction)** — REFUTED: queue processor drains explicit on-demand `stage_zero_requests`; the autonomous batch generator is archived.
5. **Profile-weights stamp** — `weights_used` is the identical object passed to `calculateWeightedScore` (`synthesis/index.js:186-195`); stamped == computed for that subsystem.
6. **gplay poller import** — surfaces `success:false` per-source; not a silent no-op.
7. **Rank-weight drift** — module-load sum assert + validateWeights throw (`discovery-mode.js:645-649,736-742`).
8. **LLM candidate acquisition** — fails CLOSED with typed errors + strictMode undercount throw (`discovery-mode.js:31-63,257-264`); the one subsystem meeting the fail-closed bar.
9. **Sensitivity/counterfactual engines** — honest arithmetic; throw on invalid weights (`counterfactual-engine.js:226-242`).
10. **Legacy-candidate re-scoring** — v1 formula preserved and stamped `'legacy_v1_formula'` (`discovery-mode.js:674-686`).

## NOT-FOUNDs (explicit)

Posture/phase/weight-config concept; E0-E3 or any evidence-grade/source-of-number fields; WIP limit; pre-registered kill criteria; pre-build demand-test plan; capability-envelope traversability GATE (only a prompt-injection context block, `discovery-mode.js:20,216` — informs the LLM, cannot fail a candidate → R6 unmet); production caller of nursery resurfacing; caller passing `strategicContext`/`weights` to `rankCandidates`.

## Spec-delta scorecard (Solomon's falsifiable predictions)

| Prediction | Verdict |
|---|---|
| No posture concept (R2) | **CONFIRMED** (C3) |
| Scores not theses; no pre-registered kills (R3) | **CONFIRMED** (C7) |
| Ungrounded LLM scoring (R4) | **CONFIRMED** (C2, H10) |
| Silent web assumption (R5) | **CONFIRMED** (CP2: form_factor/PWA = 0 hits in lib/; web enforced only as a downstream prohibition at venture-stack-policy.js:56-57 + prompt bias at discovery-mode.js:438 and modeling.js:86 — no selection-time decision exists; app-store pollers ingest native-app signal into a web-only factory with no reconciling decision) |
| No capability-envelope input (R6) | **CONFIRMED-with-nuance** (context block exists, gate does not) |
| 17 synthesis modules unaudited vs R8 | **CONFIRMED and worse** (C4, C5, C6) |
| Continuous background generation | **REFUTED** (on-demand queue) |

---

# CHECKPOINT 2 — data-pollers/ + paths/ + R5 (appended)

## CRITICAL (checkpoint 2)

### C9 — Change detection queries a column that does not exist (`polled_at`)
`data-pollers/change-detector.js:43,57` + `data-pollers/pipeline-orchestrator.js:72-76` select/order on `polled_at`; the real column is `scraped_at` (migration `20260222_..._app_rankings_table.sql:34`; `polled_at` appears in no migration). Every real run errors; change-detector logs-and-continues, pipeline-orchestrator **discards the error via destructuring** — the run reports 0 movements as if the market were quiet. (`discovery-mode.js:191` uses `scraped_at` correctly — the bug is local.)

### C10 — Movement detection is structurally impossible: the upsert destroys the history it compares against
Pollers upsert on `(source, app_url)` (`apple-rss-poller.js:48`; unique constraint at migration L46) — one row per app. change-detector then reads "previous" and the pipeline reads "current" from the SAME just-overwritten rows: delta is always 0 even with C9 fixed. A stub returning `[]` is behaviorally identical to this "monitor" (R8/R10.2).

### C11 — Competitor "teardown" never fetches the competitor URL
`paths/competitor-teardown.js:9` promises "Fetch and analyze each competitor URL"; `deps.fetchUrl` (JSDoc `:40`) is never destructured or called; `:211` prompts "Based on what you know about this URL/company" — the analysis is LLM prior recall keyed on the URL STRING, live via `path-router.js:74`. R8 provenance-declared-not-reached; outputs (business_model, pricing, weaknesses) are E0 presented as competitor analysis (R4).

## HIGH (checkpoint 2)

### H11 — The entire monitoring chain is shipped-dead code (triple-masked)
Repo-wide grep: `runPipeline` (pipeline-orchestrator) — zero importers, zero tests; `generateCountermeasures` — zero importers, zero tests; `detectChanges`/`scoreMovements` imported only by those dead modules; `runRankingPipeline` consumed only by its unit test + an archived one-time script; pollers have NO live scheduled trigger — production only READS `app_rankings` (`discovery-mode.js:189`, `competitor-teardown.js:177-186`), a table nothing refreshes. C9+C10+H11 compound: the capability (a) is never invoked, (b) queries a phantom column, (c) cannot observe movement by schema design — any one masks the other two; zero test files exist for all four modules. (Live exceptions recorded: `retry.js` genuinely reused elsewhere; `runAllPollers` dead-ends into the unused ranking pipeline.)

### H12 — Significance score = magic constants with no evidence grade
`data-pollers/significance-scorer.js:8-12,30,33-35,41` — the 60/20/10/10 split, PH weight 0.8, maxMagnitude 50, up/down 10/5 are unexplained priors; output carries `significance_score` only — no E0-E3, no source field (R4).

### H13 — Countermeasure "recommendations" are string interpolation of the input row
`data-pollers/countermeasure-engine.js:13-34,39-50` — four if-branches + fill-in-the-blank sentences emitted as `enrichment_metadata.type:'competitor_countermeasures'` with urgency/action labels; nothing reaches beyond the movement row itself (R8 mock-indistinguishable; dead per H11 — decorative both ways).

## MEDIUM (checkpoint 2)

- **M12** Poller outage ≡ quiet market; the pipeline stamps `status:'success'` with ≥2 of 3 sources up (`apple-rss-poller.js:56-62`, `pipeline-orchestrator.js:108`, `ranking-pipeline.js:71`); no consumer can distinguish dead-poller from no-movement.
- **M13** Teardown grounding dies silently: the ONE real-data path ("Market Position Data", `competitor-teardown.js:160-199`) is wrapped in a bare swallow (`:197-199`); failed per-URL analyses flow onward as `{company_name: url, error}` → "unknown model" (`:249,:265`) with no R4 weakest-link downgrade.
- **M14** LLM-invented `cost_advantage_estimate`/`speed_advantage_estimate` (`competitor-teardown.js:300-301`) enter the brief ungraded (R4).
- **M15** `paths/blueprint-browse.js:70-72,168-171` — non-interactive auto-picks `blueprints[0]` (no declared tie-break); opportunity/confidence scores pass through ungraded; unfiltered `metadata`/`enhanced_data` spreads can silently override thesis fields.

## LOW (checkpoint 2)

- **L4** `ranking-pipeline.js:33` — "totalNewRecords" counts upserted (possibly identical) rows as new.
- **L5** `apple-rss-poller.js:13-15` — default category writes the chart name ("Top Free") into the genre column.

## REFUTED (checkpoint 2)

1. **gplay dynamic import as silent no-op** — dependency declared (`package.json:634`) and failure surfaces as `success:false`; live-fail only in stripped worktrees.
2. **competitor-teardown `scraped_at` queries** — correct column; only the C9 files use the phantom `polled_at`.
3. **venture-reseeding.js** — cleanest module audited: throws on missing source AND missing thesis ("Fail loud rather than seed a blank venture", `:44-59`).
4. **discovery-mode-versions.js dead-code suspicion** — live SSOT consumed at `discovery-mode.js:23,254,264,270`; genuinely R9-aligned versioned-prompt provenance.
5. **normalizer.js** — a deterministic field-mapper that claims to be exactly that; no violation.

## NOT-FOUNDs (checkpoint 2)

Zone-A ungrounded numbers beyond H12: none. Zone-A import-depth beyond the refuted gplay site: none. Zone-B mock-indistinguishable: none (paths flaws are grounding, not determinism). Zone-B dead code: none (all four paths modules live via path-router). Evidence-grade fields anywhere in either zone: zero.

## R5 VERDICT — SILENT ASSUMPTION (prediction CONFIRMED)

`form_factor|formFactor` = 0 hits in all of lib/; `PWA` = 0 hits in stage-zero. Web is enforced only as a downstream PROHIBITION (`lib/eva/standards/venture-stack-policy.js:56-57` — anti-CLI patterns, "Ventures are hosted SaaS web apps") plus prompt bias (`paths/discovery-mode.js:438`, `modeling.js:86`). The R5 ladder (web-first default → PWA middle → explicit native criterion) exists nowhere; no selection-time decision artifact. Compounding irony: the pollers ingest APP-STORE rankings (native-app signal) into a web-only factory with no reconciling decision.

---

# FINAL ROLL-UP (both checkpoints)

**11 CRITICAL / 13 HIGH / 15 MEDIUM / 5 LOW** across five zones (synthesis, top-level, data-pollers, paths, R5). **15 refuted candidates** with exonerating receipts. Spec-delta scorecard: **6 of 7 Solomon predictions CONFIRMED** (no-posture, score-not-thesis, ungrounded-LLM-scoring, silent-web, no-capability-gate-with-nuance, synthesis-fails-R8); 1 REFUTED (continuous background generation — the queue is on-demand). Exemplars worth preserving as the pattern to copy: `build-cost-estimation`'s provenance fields, `cross-reference`'s reached-DB grounding, `venture-reseeding`'s fail-loud discipline, `discovery-mode`'s typed fail-closed LLM acquisition + versioned prompts.

*Ledger complete. Delta (session 06fda730), Leg B, routed to Solomon for adjudication.*
