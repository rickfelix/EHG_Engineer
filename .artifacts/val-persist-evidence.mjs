import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../../lib/sub-agent-executor/results-storage.js';
dotenv.config({ path: '../../../.env' });
dotenv.config();

const SD_ID = '234928d8-f45b-4998-a1e6-28704e78cf6e';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('id', SD_ID).single();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  status: 'complete',
  summary: [
    'Independent PRD-conformance audit of the shipped implementation (deliberately NOT a repeat of the TESTING/SECURITY lenses).',
    'All 6 FRs implemented; TR-1..TR-8 addressed (TR-6 via the PRD-sanctioned schema-lint-disable-line pragma, lint EXECUTED clean; TR-8 partial). 71/71 unit tests green.',
    'THREE substantive gaps.',
    '(1) HIGH: implementation_approach ROLLOUT PRECONDITION claims FR-6 makes merge-before-migration safe because a live run "degrades LOUDLY, never silently". Measured against the live production DB, only 1 of 3 schema-missing paths is loud. findActiveOverride swallows 42703 in "if (error || !data || data.length === 0) return null" with no warning, so from PR merge until ceremony N+1 the audited-override escape hatch fails SILENTLY and closed while the gate keeps blocking. Live base rate makes it material: 30/30 (100%) plan_critiques rows in the last 14d are severity=block and 7 carried overrides. No automated backstop exists: LEAD-FINAL verifyMigrationsApplied scans only database/migrations|supabase/migrations|migrations and only regex-matches CREATE TABLE, so a chairman-gated ALTER TABLE ADD COLUMN is invisible to it.',
    '(2) MEDIUM: the staged migration ships a COMMENT ON COLUMN plan_critiques.content_hash that describes the PRE-SEC-HIGH-1 defective behaviour ("post-truncation") as if it were the design; the same stale wording appears in the migration header prose, critique-override.js docstring, and PRD FR-4 AC-1. Code is correct; three durable descriptions of it are wrong, and the COMMENT becomes catalog-level authority the moment ceremony N+1 applies it.',
    '(3) MEDIUM: FR-5 (whose stated purpose is "called out as its own FR so it is deliberately tested, not an unverified side effect of FR-4") shipped as exactly that unverified side effect. TS-9 has no test, yet the integration file header advertises "TS-5/TS-6/TS-8/TS-9" coverage.',
    'Coherence between the two TESTING and two SECURITY fix rounds was checked specifically and found sound; no bad interaction.',
  ].join(' '),
  findings: [
    {
      severity: 'HIGH',
      id: 'VAL-1',
      title: 'ROLLOUT PRECONDITION safety argument is measurably incomplete - the override lookup fails SILENTLY on the missing column',
      evidence: 'Executed all four affected query shapes against the live production DB. persistCritique insert -> PGRST204 (FR-6 loud branch fires, correct). findActiveOverride select + eq(content_hash) -> 42703, swallowed by "if (error || !data || data.length === 0) return null" at pre-plan-critique.js:381, NO warning pushed, indistinguishable from "no override exists". lookupCacheHit -> 42703 swallowed (harmless, optimization only). critique-override.js -> 42703 rendered to the operator as the misleading "No blocking critique found ... nothing to override". Live rates: last 14d, 30/30 plan_critiques rows severity=block, 7 overridden; 241 rows total. Net effect of merging before ceremony N+1: block verdicts become unoverridable fleet-wide with no loud signal on the one path that actually gates the handoff; the only recovery is handoff.js --bypass-validation. Note this is the SAME defect class FR-6 exists to close, applied at persistCritique but not at findActiveOverride.',
      location: 'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js:364-391 (findActiveOverride); PRD implementation_approach.steps[5]',
      fix: 'Give findActiveOverride the same SCHEMA_MISSING_CODES named branch persistCritique already has (push a loud warning; the fail-closed return stays correct). Amend the ROLLOUT PRECONDITION text to state which paths are loud and which are not, rather than asserting all of them are.',
    },
    {
      severity: 'MEDIUM',
      id: 'VAL-2',
      title: 'Staged migration COMMENT ON COLUMN documents the SEC-HIGH-1 defect as if it were the design',
      evidence: 'Migration line 62 reads: "SHA-256 of the exact PRD+arch text sent to the LLM, post-truncation, plus adapter.defaultModel + archLoadStatus." The actual computeContentHash (devils-advocate.js:420-430) hashes prdRawText + archRawText (FULL, PRE-truncation) + archLoadStatus + model + MAX_CRITIQUE_ANALYSIS_CHARS + SECTION_BUDGETS. The same stale "post-truncation" wording appears at migration header lines 22-24, scripts/critique-override.js:14, and PRD FR-4 AC-1. The migration header additionally redirects readers to the COMMENT as the currently-accurate authority (lines 20-21) - pointing at the stale text.',
      location: 'database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql:22-24,62',
      fix: 'Correct the COMMENT and header prose BEFORE ceremony N+1 applies it; correct critique-override.js:14 and PRD FR-4 AC-1 to match.',
    },
    {
      severity: 'MEDIUM',
      id: 'VAL-3',
      title: 'FR-5 / TS-9 shipped untested while the integration file header claims the coverage',
      evidence: 'tests/integration/eva/pre-plan-critique-content-hash.integration.test.js:3 declares "TS-5/TS-6/TS-8/TS-9". The file implements four tests: TS-8 binding, TR-5 NULL, TS-5 cache hit, TS-6 cache miss. No test constructs >10 plan_critiques rows with the matching override falling outside the most-recent 10 by created_at. FR-5 has exactly one acceptance criterion and that is it. Additionally, every test in this file is currently unexecutable (it requires the staged columns to exist), so the real-DB evidence for FR-4/FR-5 binding is written but not yet run anywhere.',
      location: 'tests/integration/eva/pre-plan-critique-content-hash.integration.test.js',
      fix: 'Add the TS-9 burst test, or drop TS-9 from the header claim and record it as deferred to post-ceremony verification.',
    },
    {
      severity: 'MEDIUM',
      id: 'VAL-4',
      title: 'Gate-side persistence contracts for FR-1 AC-4 and FR-4 AC-5 are unasserted',
      evidence: 'grep of pre-plan-critique.test.js returns zero occurrences of truncat*, cache_hit, cacheHit, archLoadStatus, load_failed. FR-1 AC-4 requires a persisted metadata.truncated.prd=true with real shown/total AND a warnings line naming the truncation; FR-4 AC-5 requires metadata.cache_hit=true plus cache_source_id on the persisted row (TS-13); TS-19 requires both metadata keys coexisting. Only the devils-advocate RETURN VALUE is asserted, never the gate WRITE. The harness already supports this - line 217 asserts supabase._inserted[0].metadata.llm_result. Also untested: the gate branch deriving archLoadStatus load_failed vs not_found (pre-plan-critique.js:112-121, the gate half of TS-14), and TS-15 entirely.',
      location: 'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.test.js',
      fix: 'Add gate-level assertions on supabase._inserted[0].metadata for truncated / cache_hit / cache_source_id, and on the warnings array for the truncation line.',
    },
    {
      severity: 'LOW',
      id: 'VAL-5',
      title: 'TS-10 budget-boundary test (length N vs N+1) absent',
      evidence: 'No test exercises rawTotal === MAX_CRITIQUE_ANALYSIS_CHARS vs MAX+1. Behaviour verified correct by inspection (buildBudgetedPrdText:694 uses "if (rawTotal <= MAX)"), but TS-10 exists precisely to pin that a naive >= never fires a spurious marker on an exact-length match.',
      location: 'tests/unit/eva/devils-advocate-critique-truncation.test.js',
      fix: 'Add the two-case boundary test.',
    },
    {
      severity: 'LOW',
      id: 'VAL-6',
      title: 'TR-8 fixture only partially materialized',
      evidence: 'TR-8 asks EXEC to materialize strategic_directives_v2.metadata.truncation_repro_fixture as a real test fixture FILE for TS-1/TS-2 rather than relying solely on a synthetic string. The fixture was used as a MEASUREMENT source for SECTION_BUDGETS (documented at devils-advocate.js:60-67) and the integration test adopts its sd_id/prd_id convention, but no fixture file exists and TS-2 coverage uses synthetic repeat() strings. The reduction is not flagged anywhere as deliberate.',
      location: 'TR-8',
      fix: 'Either materialize the fixture file or record the reduction explicitly rather than leaving it silent.',
    },
    {
      severity: 'LOW',
      id: 'VAL-7',
      title: 'PRD text left self-contradictory where this PRD own convention is to amend',
      evidence: 'TR-3 title still reads "TIER-1, database/migrations/, NOT chairman-gated" while the artifact shipped to database/chairman-gated/ (documented in implementation_approach and the migration header, but TR-3 itself never amended). Top-level acceptance_criteria[4] still reads "the audited override mechanism [is] never weakened or altered by this SD" - the SD deliberately REPLACES its binding predicate, which is exactly the contradiction TR-2 was rewritten to resolve at the TR level. Top-level acceptance_criteria[2] still names MAX_ANALYSIS_CHARS, superseded by FR-3 introducing a separate constant. This PRD demonstrably amends contradicted requirements (TR-2 was rewritten for precisely this reason); these three were not.',
      location: 'PRD TR-3 title; acceptance_criteria[2] and [4]',
      fix: 'Amend TR-3 and the two stale top-level ACs so the PRD does not contradict its own shipped artifact.',
    },
    {
      severity: 'LOW',
      id: 'VAL-8',
      title: 'FR-3 AC-2 population-derivation half missing at the constant definition',
      evidence: 'FR-3 AC-2 requires the definition comment to document: the 4340-PRD live population, today max of 43236 chars, 1.48x headroom at 0% truncation, and the explicit rejection of 48000 (1.11x) because LANES-001 grew past its cap within a single PLAN phase. devils-advocate.js:31-48 instead documents the gpt-5.4 272,000-token context-window derivation plus this SD own 30,632-char PRD - none of the population figures appear. Top-level acceptance_criteria[2] ("derived from a measured model context window") IS satisfied; FR-3 AC-2 is half-satisfied.',
      location: 'lib/eva/devils-advocate.js:31-48',
      fix: 'Append the population measurement and the 48000-rejection rationale to the constant comment.',
    },
    {
      severity: 'INFO',
      id: 'VAL-9',
      title: 'Coherence between the TESTING and SECURITY fix rounds - checked specifically, found sound',
      evidence: '(a) Full-content hashing vs FR-2 budgeting: budgets affect only what is SENT; the budget constants are folded into the hash, so a budget change invalidates overrides in the safe direction. (b) Full-content hashing vs FR-1 transparency: truncation metadata is RECOMPUTED fresh on every call including cache hits, and because the hash pins both content and budgets the recomputation is provably identical to the source row - TS-19 "cache hit drops the inherited marker" concern is structurally impossible, not merely untested. (c) TESTING fast path (rawTotal <= MAX skips section budgeting) vs SECURITY budget-in-hash: a SECTION_BUDGETS change invalidates hashes even for PRDs the fast path meant the budgets never touched - over-invalidation, safe direction, worth a one-line note only. (d) TR-2 verified: the combined-severity DERIVATION at pre-plan-critique.js:145-161 is genuinely untouched while the binding predicate moved, exactly as TR-2 rewrite directs. No incoherence found.',
      location: 'lib/eva/devils-advocate.js',
      fix: 'None required.',
    },
  ],
  recommendations: [
    'MERGE-BLOCKING: fix VAL-1 (loud named branch in findActiveOverride plus corrected ROLLOUT PRECONDITION text). The measured 100% block rate over the last 14 days makes a silent-and-closed override path a live fleet risk, and no automated backstop catches it.',
    'BEFORE CEREMONY N+1: fix VAL-2 - the COMMENT ON COLUMN becomes catalog-level authority the moment it is applied, and it currently describes the security defect that was fixed.',
    'SHOULD-FIX in this SD: VAL-3 and VAL-4 - both are acceptance criteria the PRD enumerated explicitly, and VAL-3 additionally carries a coverage claim the file does not honour.',
    'MAY DEFER: VAL-5 through VAL-8 as documented follow-ups, provided the reductions are recorded rather than left silent.',
    'TR-6 is NOT a gap and was NOT deferred - the schema-lint-disable-line pragma path is explicitly authorised by TR-6 itself, and I verified by execution that scripts/lint/schema-reference-extract.mjs:33 honours it and that the diff lint reports 0 new violations.',
  ],
  detailed_analysis: [
    'SCOPE: independent PRD-conformance audit at PLAN_VERIFICATION, deliberately not re-running the TESTING or SECURITY lenses.',
    'READ FRESH: live product_requirements_v2 row (FR-1..FR-6, TR-1..TR-8, 19 test_scenarios, 6 top-level acceptance_criteria, risks, implementation_approach); lib/eva/devils-advocate.js; pre-plan-critique.js; critique-override.js; all four test suites; the staged migration plus its _DOWN and _acceptance siblings; the 12 branch commits from merge-base 48f08b3e.',
    'EXECUTED (not assumed): 71/71 unit tests green across 4 suites - TR-7 baseline was 41/41 across 3, so the requirement to stay fully green is satisfied. schema-reference-lint --diff clean (3 files, 0 new violations); --all shows no plan_critiques or critique-path violations. Four live production query probes reproducing exact post-merge/pre-migration behaviour.',
    'FR VERDICTS: FR-1 PASS (marker in the trusted frame strictly before the first BEGIN delimiter; input-sanitizer shape reused rather than a third dialect; fingerprint invariance tested; tri-state not_measured honoured). FR-2 PASS (section budgets plus deterministic FR-id-list preservation via TS-17; the fast path added in the TESTING round correctly stops the section split self-inflicting truncation). FR-3 PASS with VAL-8 (separate constant, MAX_ANALYSIS_CHARS=8000 pinned by a regression test, out-of-scope declaration present). FR-4 PASS (full-content hash, adapter.defaultModel not response.model with a dedicated test, archLoadStatus tri-state, cache hit still persists a flagged row, could_not_check never cached, override lookup and severity derivation both outside the cache branch). FR-5 IMPLEMENTED but UNTESTED (VAL-3). FR-6 PASS at persistCritique, but its rollout-precondition consequence is where VAL-1 lives.',
    'TR VERDICTS: TR-1 PASS. TR-2 PASS. TR-3 PASS on SQL, deviates on location per COORDINATOR RULING 9e51c5ae, with VAL-2 and VAL-7. TR-4 PASS (the stale KNOWN LIMITATION docstring is gone). TR-5 PASS (defensive early-return plus a real-DB test). TR-6 PASS (verified by execution). TR-7 PASS. TR-8 PARTIAL (VAL-6).',
    'STAGED-MIGRATION QUESTION, ANSWERED DIRECTLY: deferring the apply to ceremony N+1 is correct in principle and the coordinator ruling is sound. But the stated SAFETY ARGUMENT does not survive measurement (VAL-1), and nothing in the machinery enforces the ordering - verifyMigrationsApplied at LEAD-FINAL scans only database/migrations, supabase/migrations and migrations, and only regex-matches CREATE TABLE, so this chairman-gated ALTER TABLE ADD COLUMN is invisible to the one gate that would otherwise catch it. The deferral is therefore convention-only, resting entirely on the ceremony list plus a warning that fires on the persistence path but not on the gating path.',
  ].join(' '),
  execution_time_ms: 0,
  metadata: {
    sd_key: 'SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    prd_id: 'PRD-SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    branch: 'feat/SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    commits_reviewed: 12,
    merge_base: '48f08b3edc1d9519fcdf8fe3c6b16259fccdbb6b',
    tests_executed: '71/71 passed (devils-advocate-critique-truncation, pre-plan-critique, devils-advocate.critique, devils-advocate)',
    schema_lint: 'schema-reference-lint --diff: 3 files, 0 new violations; --all: no critique-path violations',
    live_probes: {
      persistCritique_insert: 'PGRST204 - loud, FR-6 branch fires',
      findActiveOverride_select: '42703 - SILENT, swallowed, no warning',
      lookupCacheHit_select: '42703 - silent, optimization only',
      critique_override_cli: '42703 - rendered as misleading "No blocking critique found"',
      plan_critiques_last_14d: '30 rows, 30 block, 7 overridden',
      plan_critiques_total: 241,
      columns_live: 'metadata=ABSENT, content_hash=ABSENT',
    },
    fr_coverage: { 'FR-1': 'PASS', 'FR-2': 'PASS', 'FR-3': 'PASS (VAL-8)', 'FR-4': 'PASS', 'FR-5': 'IMPLEMENTED_UNTESTED (VAL-3)', 'FR-6': 'PASS (VAL-1 on its rollout consequence)' },
    tr_coverage: { 'TR-1': 'PASS', 'TR-2': 'PASS', 'TR-3': 'PASS_WITH_DEVIATION (VAL-2, VAL-7)', 'TR-4': 'PASS', 'TR-5': 'PASS', 'TR-6': 'PASS (pragma path, lint executed)', 'TR-7': 'PASS', 'TR-8': 'PARTIAL (VAL-6)' },
    test_scenario_coverage: {
      covered: ['TS-2 (partial)', 'TS-3 (partial)', 'TS-4', 'TS-5', 'TS-6', 'TS-7', 'TS-8', 'TS-11', 'TS-12', 'TS-16', 'TS-17', 'TS-18'],
      reframed_manual: ['TS-1'],
      missing: ['TS-9', 'TS-10', 'TS-13', 'TS-14 (gate half)', 'TS-15', 'TS-19'],
    },
    top_level_ac: {
      '1': 'PASS',
      '2': 'PASS - FR-3 supersedes the stale MAX_ANALYSIS_CHARS wording',
      '3': 'PASS',
      '4': 'PASS',
      '5': 'DELIBERATELY_ALTERED per the TR-2 rewrite - stale AC text (VAL-7)',
      '6': 'NOT_PERFORMED - TS-1 reframed to a probabilistic manual check',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: sd?.target_application,
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'VALIDATION',
  SD_ID,
  { id: null, name: 'Principal Systems Analyst' },
  results,
  { phase: 'PLAN_VERIFICATION', sdKey: 'SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001' }
);
console.log('STORED:', JSON.stringify(stored)?.slice(0, 500));
console.log('REPO_RESOLUTION:', JSON.stringify(resolution));
