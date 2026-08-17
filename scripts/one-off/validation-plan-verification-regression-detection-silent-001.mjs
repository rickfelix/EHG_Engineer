#!/usr/bin/env node
/**
 * VALIDATION (Principal Systems Analyst) — PLAN_VERIFICATION evidence for
 * SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001.
 *
 * PRD-fidelity verification of the SHIPPED code (commits 304b506f9fc, cbcaca62e27, b123bb02380)
 * against PRD-SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001's 8 FRs + 6 top-level ACs, plus a
 * scope-drift sweep and a re-confirmation that nothing depends on the retired
 * test_failures/playwright_test_scenarios behaviour.
 *
 * Run from inside the SD worktree so executed_from_cwd reflects the tree actually analysed.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }
console.log('SD id:', sd.id);

const F = (id, severity, title, detail, disposition) => ({ id, severity, title, detail, disposition });

const findings = [
  F('V-1', 'HIGH', 'FR-4 sd_id is derived from the PRIOR (passing) run, not the failing row\'s run — US-004 AC-2 is unmet yet the story is marked completed',
    "lib/rca-runtime-triggers.js:191 `const sd_id = mostRecentRun.sd_id ?? null;`. `mostRecentRun` is `priorRuns[0]`, sourced from `.from('test_runs').in('id', priorRunIds)` where priorRunIds derive exclusively from test_results rows that were `.neq('test_run_id', failure.test_run_id)`-excluded (line 149). The failing row's OWN test_runs row is therefore never queried anywhere in the handler; `failure.test_run_id` is used only as an exclusion argument. "
    + "PRD FR-4 requires deriving sd_id 'via a join through test_runs (test_results.test_run_id -> test_runs.id -> test_runs.sd_id)' for 'the triggerRCA(...) params built from the failing row'. user_stories US-004 AC-2 is explicit and falsifiable: GIVEN 'the failure's test_run_id maps to a test_runs row with a non-null sd_id' THEN 'the sd_id param is that value'. The shipped code structurally cannot satisfy that given/then. US-004 status is nonetheless 'completed'. "
    + "Consequence: root_cause_reports.sd_id attributes the regression to whichever SD's run last PASSED the test, not the SD whose run just broke it — i.e. the RCR is filed against the SD least likely to have caused it. failure_signature `test_regression:<title>:<sd_id>` dedups on that same wrong key, so two different SDs breaking the same test after the same passing run collapse into one RCR with an incremented recurrence_count. "
    + "Severity bounded (not CRITICAL): root_cause_reports.sd_id is varchar WITH a FOREIGN KEY to strategic_directives_v2, and test_runs.sd_id carries the same FK, so the prior run's value is always FK-valid — this mis-attributes, it does not trigger an FK violation that the fail-soft wrapper would swallow. Also currently inert: the staged ALTER PUBLICATION is unapplied, so the handler cannot fire yet. It becomes wrong the moment the chairman applies the migration, which is precisely when nobody is watching.",
    'MUST-FIX before LEAD-FINAL-APPROVAL. ~2 lines: either add failure.test_run_id to the `.in()` list and read the current run\'s sd_id off it (keeping priorRuns[0] for the pass/fail comparison), or issue a second `.from(\'test_runs\').select(\'sd_id\').eq(\'id\', failure.test_run_id).maybeSingle()`. Then re-open US-004 or record why AC-2 was intentionally revised.'),

  F('V-2', 'HIGH', 'TS-1 cannot observe the sd_id it asserts — the fixture supplies only ONE run, so the test passes identically under correct and incorrect derivation',
    "tests/unit/rca-runtime-triggers-monitor-test-failures.test.js TS-1 seeds `testRunsResult: { data: [{ id: 'run-prior', started_at: '2026-08-01T00:00:00Z', sd_id: 'SD-EXAMPLE-001' }] }` and asserts `expect(payload.sd_id).toBe('SD-EXAMPLE-001')` plus the same value inside failure_signature. Because no test_runs row exists for the FAILING row's run ('run-current'), 'the prior run's sd_id' and 'the failing run's sd_id' are indistinguishable in this fixture. The assertion is real but its subject is unobservable — it would go green against either implementation, so it provides zero discriminating power over V-1. "
    + "This is the fixture-blind guard class (a check that runs but cannot observe its subject), and it is why V-1 survived an EXEC-phase TESTING PASS (evidence 54a0c0f3) that included mutation testing: the mutation exercised was trigger_tier 2->3, not the sd_id source.",
    'MUST-FIX alongside V-1. Add a distinct current-run fixture (e.g. `run-current` with sd_id `SD-CURRENT-001`) and assert the payload carries SD-CURRENT-001, so the test is two-sided and can actually fail.'),

  F('V-3', 'MEDIUM', 'lib/rca-monitor-bootstrap.js — the direct caller of the fixed code — still narrates the retired mechanism in operator-visible startup output',
    "Two console.log lines were true when written and are false as of this SD: line 32 `'   - T2 (High): Sub-agent FAIL verdicts, Test regressions < 24h, Handoff rejections x 2+'` (the wall-clock 24h window is exactly what FR-2 removed and replaced with a run-relative comparison), and line 42 `'   - Test failures & regressions (test_failures)'` (names the retired table, confirmed ABSENT from the live DB via to_regclass -> null). "
    + "FR-8's own description asserts docs/reference/root-cause-agent.md 'is the one other file (besides the broken call site itself) that documents the mechanism this SD replaces'. That premise is under-measured — rca-monitor-bootstrap.js documents it too, and it is the FIRST thing an operator reads when the server starts. Not a code defect and not a regression introduced by this SD, but it is the identical stale-narration class FR-8 exists to close, one file over.",
    'SHOULD-FIX in this SD (2-line edit, same commit). Alternatively file as a follow-up QF, but do not leave the caller advertising a mechanism the callee no longer implements.'),

  F('V-4', 'LOW', 'FR-2 shipped as "different run", not "earlier run" — no started_at comparison against the failing row\'s own run exists',
    "lib/rca-runtime-triggers.js:149 uses `.neq('test_run_id', failure.test_run_id)` and then selects `priorRuns[0]` after ordering by (started_at DESC, id DESC). Nothing constrains the candidate set to runs that started BEFORE the failing row's run. PRD FR-2's requirement text says 'comparing to the most recent PRIOR row from an earlier test_run_id' and its description says 'a DIFFERENT, EARLIER test_run_id'. Under normal realtime-INSERT semantics the current run is the newest so the two coincide; they diverge under parallel CI runs or any backfill/out-of-order ingest, where a LATER-started run's passing result would be treated as the 'prior' baseline and could manufacture a false regression. "
    + "Recording it because FR-2's own evidence base (runs 8-24 days apart, one run wrote zero detail rows) describes an ingest pipeline irregular enough that out-of-order arrival is not hypothetical.",
    'ADVISORY. Either add a started_at upper bound against the failing row\'s run, or amend FR-2\'s wording to "a different run" so spec and code agree. Currently the spec claims a constraint the code does not enforce.'),

  F('V-5', 'LOW', 'Prior-run retries are unordered — `.find()` picks an arbitrary row when the baseline run contains multiple results for the same title',
    "lib/rca-runtime-triggers.js:185 `priorResults.find((r) => r.test_run_id === mostRecentRun.id)`. The test_results lookback (line 145-149) selects only `status, test_run_id` with no ordering and no tiebreaker, so if the selected baseline run contained a Playwright retry for the same test_full_title (pass-then-fail or fail-then-pass), which row is compared is whatever PostgREST returned first. TS-6 closes same-run retry ambiguity for the CURRENT run only (via .neq); the PRIOR run's retries are unaddressed by any FR, AC or test. FR-2's phrase 'the most recent row' is undefined in that case. "
    + "Low likelihood at present volume (52 rows, 52 distinct pairs measured at PLAN) but it is the same non-determinism class the (started_at DESC, id DESC) tiebreaker was added to eliminate one level up.",
    'ADVISORY. A `.order(\'id\', { ascending: false })` on the test_results lookback would make the pick deterministic for ~1 line.'),

  F('V-6', 'INFO', 'FR-6 AC-2\'s PR-description limb is not yet satisfiable — no PR exists for this branch',
    "`gh pr list --head feat/SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 --state all` returns []. FR-6 AC-2 permits the new coverage to live in a dedicated file 'and this fact is noted in the PR description'. The substantive half is fully met and verified: tests/unit/rca-runtime-triggers-monitor-test-failures.test.js imports the REAL exported monitorTestFailures, and its header comment (lines 3-8) explicitly documents that tests/unit/rca-runtime-triggers.test.js still declares local copies of helper logic and never imports the real module. Zero-coverage-of-the-real-function IS closed. Only the PR-description restatement is outstanding, and it cannot be written before the PR is opened.",
    'CARRY as a PR-creation checklist item. Not a defect; recorded so it is not silently dropped at merge.'),

  F('C-1', 'INFO', 'CONFIRMED DELIVERED: FR-1, FR-3, FR-5, FR-7, FR-8 fully met; FR-2 and FR-6 met with the advisories above',
    "FR-1: lib/rca-runtime-triggers.js:115-123 — channel renamed to 'test_results_regression' (kills the channel-name false-pin trap the PRD's own risk register flagged) and the .on() config is exactly {event:'INSERT',schema:'public',table:'test_results',filter:'status=eq.failed'}. TS-7 asserts it by deep-equal on the captured mock arg AND asserts `.channel` was never called with 'test_failures' — two-sided. "
    + "FR-3: guard at lines 133-142 covers null AND empty string via `!failure.test_full_title`, placed before any `.from()`. TS-4 asserts `expect(mockSupabase.from).not.toHaveBeenCalled()` — proves 'no lookback query attempted', not merely 'no trigger fired'. "
    + "FR-5: line 442 createSupabaseServiceClient() in triggerRCAOrThrow; triggerRCA is a thin try/catch delegator so the single edit covers both entry points. The 4 monitor subscription clients (lines 24/112/234/318) remain anon, matching FR-5's stated scope. git diff confirms monitorSubAgentFailures/monitorQualityGates/monitorHandoffRejections bodies are byte-identical to the merge-base. TS-9 asserts createSupabaseServiceClient WAS called and createSupabaseClient was NOT — two-sided, non-vacuous. "
    + "FR-7: database/migrations/20260817_add_test_results_to_realtime_publication.sql contains exactly one ALTER PUBLICATION inside a DO block guarded by NOT EXISTS(SELECT 1 FROM pg_publication_tables ...). INDEPENDENTLY RE-VERIFIED NOT APPLIED via a direct Postgres connection (createDatabaseClient, not REST — the same discriminating method this SD insists on): supabase_realtime carries 21 published tables and test_results / test_runs / test_failures are absent from all of them. metadata.apply_gate reads 'chairman ceremony for the DDL - do not apply inline'. "
    + "FR-8: docs/reference/root-cause-agent.md:369 Tier-2 row rewritten to 'test_results INSERT (status=failed) + run-relative self-join via test_runs'; no test_failures / playwright_test_scenarios remain in it. "
    + "FR-2/FR-6: delivered as described, subject to V-4/V-5 (FR-2) and V-6 (FR-6).",
    'NO ACTION.'),

  F('C-2', 'INFO', 'CONFIRMED: all 6 top-level PRD acceptance criteria hold, including the negative ones',
    "AC-2 (tests pass, not quarantined): 39/39 passing across tests/unit/rca-runtime-triggers-monitor-test-failures.test.js + tests/unit/rca-trigger-failsoft.test.js + tests/unit/rca-runtime-triggers.test.js, re-run by this pass at HEAD b123bb02380. Neither new/modified file appears in tests/quarantine-manifest.json. "
    + "AC-3 (<=1 migration file, exactly the ALTER PUBLICATION): verified — one file, one statement. "
    + "AC-4 (docs): verified. "
    + "AC-5 (other 3 monitors unchanged): verified by diff against merge-base a9f19467b1d. "
    + "AC-6 (no new env vars / feature flags / npm deps): verified — package.json and package-lock.json are untouched by the diff, and the diff contains zero process.env or feature-flag additions. "
    + "AC-1 (TS-8 live fire): correctly DEFERRED, not silently dropped — declared as an honest gap in PRD risks[3] and in metadata.real_callee_attestation[3], gated on the chairman ceremony. Confirmed the gate is real: the publication still excludes test_results.",
    'NO ACTION.'),

  F('C-3', 'INFO', 'CONFIRMED: nothing depends on the retired behaviour — LEAD-phase Explore finding re-confirmed and strictly improved post-implementation',
    "playwright_test_scenarios: ZERO references remain in runtime code. The only surviving hits repo-wide are this SD's own scripts/one-off/*.mjs DB-writer artifacts, which quote the retired mechanism historically inside PRD/LEAD-decision text — not executable references to the table. The broken call site is gone. Relation confirmed ABSENT on the live DB (to_regclass('public.playwright_test_scenarios') -> null). "
    + "test_failures: relation likewise confirmed ABSENT (to_regclass -> null). All remaining references are pre-existing and none execute against the fixed path — database/schema/005_test_failures_schema.sql (never applied), scripts/archive/one-time/* (archived), docs/audits + docs/database historical sweeps, .claude/file-trees.md. The one LIVE-code reference is lib/rca-monitor-bootstrap.js's log strings (see V-3), which are narration, not a data dependency. "
    + "No consumer breakage introduced: the only test_results/test_runs consumers are WRITERS (lib/reporters/leo-playwright-reporter.js:353, lib/test-evidence-ingest.js:274 and its scripts/lib twin) plus one e2e fixture reader (tests/e2e/fixtures/stringency-resolver.ts:225). This SD only READS those tables and changes no schema, column or constraint. No other code subscribes to test_results, so the staged publication change has no blast radius beyond the fixed monitor.",
    'NO ACTION. Explore\'s LEAD-phase conclusion holds post-implementation; nothing new appeared.'),

  F('C-4', 'INFO', 'CONFIRMED: no scope drift in product code',
    "13 files changed vs merge-base a9f19467b1d. Product surface is 3 files (lib/rca-runtime-triggers.js, docs/reference/root-cause-agent.md, database/migrations/20260817_...sql), tests are 2, and the remaining 8 are scripts/one-off/*.mjs DB-writer process artifacts (PRD insert, user-story insert/complete, three LEAD-decision records, testing-informed record, attestation record). Inspected: none of the one-off scripts alter runtime behaviour — they write rows to strategic_directives_v2 / product_requirements_v2 / user_stories. Nothing delivered that the PRD did not ask for; nothing in the PRD's FR list is absent from the diff. "
    + "All 7 user stories (US-001..US-007) are status='completed' — correctly so for 6 of them; US-004's AC-2 is the exception (V-1).",
    'NO ACTION beyond V-1\'s US-004 re-open.'),
];

const conditions = [
  'MUST-FIX (V-1): derive sd_id from the FAILING row\'s test_run_id, not from priorRuns[0]. US-004 AC-2 is currently unmet while the story reads completed.',
  'MUST-FIX (V-2): give TS-1 a distinct current-run fixture so the sd_id assertion can actually fail. As written it is fixture-blind and cannot discriminate V-1.',
  'SHOULD-FIX (V-3): update lib/rca-monitor-bootstrap.js lines 32 and 42 — the direct caller still advertises "test regressions < 24h" and "(test_failures)" at every server start.',
  'ADVISORY (V-4): reconcile FR-2 spec text ("earlier test_run_id") with the shipped `.neq` ("different test_run_id"), in one direction or the other.',
  'ADVISORY (V-5): order the test_results lookback so the prior run\'s retries resolve deterministically.',
  'CARRY (V-6): note in the PR description that the real-function coverage lives in a dedicated file, per FR-6 AC-2. No PR exists on this branch yet.',
  'UNCHANGED-AND-CORRECT: TS-8 stays deferred to the chairman ceremony. Do not let the fix ship as "verified end-to-end" — it is unit-verified and live-inert until ALTER PUBLICATION is applied.',
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 91,
  status: 'completed',
  findings,
  critical_issues: findings.filter((f) => f.severity === 'HIGH').map((f) => `${f.id}: ${f.title}`),
  recommendations: conditions,
  detailed_analysis: [
    'PLAN_VERIFICATION VALIDATION pass for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 at HEAD b123bb02380 on feat/SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001. This was PRD-fidelity verification of shipped code, not re-discovery: every FR and AC in PRD-SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 was checked against the diff vs merge-base a9f19467b1d, plus a scope-drift sweep and a re-confirmation of the retired-behaviour dependency question.',
    '',
    'VERDICT: CONCERNS / CONDITIONAL_PASS (confidence 91). The SD does what it set out to do — the four confirmed dead layers are genuinely closed, and closed with tests that can fail. 7 of 8 FRs are fully delivered and all 6 top-level ACs hold, including the negative ones (no new deps, no scope creep into the other 3 monitors, migration staged-not-applied). I independently re-verified the migration is unapplied via a direct Postgres connection rather than REST, because "staged, not applied" is the single claim in this SD that a REST-layer check could report wrongly.',
    '',
    'What blocks a clean PASS is one narrow but real defect that three prior green reviews did not catch, for a structural reason worth naming: sd_id is read off the PRIOR (passing) run rather than the failing row\'s run (V-1), and TS-1 cannot see the difference because its fixture supplies only one test_runs row (V-2). The EXEC TESTING pass (54a0c0f3) mutation-tested trigger_tier, not the sd_id source, so the blind spot survived a genuinely rigorous review. user_stories US-004 AC-2 states the correct behaviour in falsifiable given/then form and the shipped code structurally cannot satisfy it — yet US-004 reads completed. That combination (an AC that is unmet, a story that says completed, and a test that cannot fail) is the finding, more than the two lines of code.',
    '',
    'Severity is bounded honestly. root_cause_reports.sd_id carries an FK to strategic_directives_v2 and so does test_runs.sd_id, so the prior run\'s value is always FK-valid — this mis-attributes an RCR, it does not produce an insert error that the fail-soft wrapper would swallow. And the whole path is live-inert today because the ALTER PUBLICATION is unapplied. The defect activates at exactly the moment the chairman applies the migration, which is the moment least likely to be watched. That is why it is MUST-FIX now rather than a follow-up.',
    '',
    'One scope-adjacent gap: FR-8 asserts docs/reference/root-cause-agent.md is "the one other file (besides the broken call site itself) that documents the mechanism this SD replaces". That premise is under-measured. lib/rca-monitor-bootstrap.js — the direct caller — prints "Test regressions < 24h" and "(test_failures)" at every server start, both now false. Same stale-narration class FR-8 exists to close, one file over, and the first thing an operator reads.',
    '',
    'On the specific re-confirmation asked for: the LEAD-phase Explore finding holds and has improved. playwright_test_scenarios now has ZERO runtime references — the only survivors are this SD\'s own one-off DB-writer scripts quoting the retired mechanism as history. test_failures has no live data dependency either; its one live-code reference is the bootstrap log string above. Both relations confirmed ABSENT on the live DB via to_regclass. No new references appeared during implementation, and no consumer of test_results/test_runs was broken — this SD only reads them and adds no schema change.',
  ].join('\n'),
  metadata: {
    phase: 'PLAN_VERIFICATION',
    sd_key: SD_KEY,
    prd_id: 'PRD-SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001',
    review_type: 'PRD-fidelity verification of shipped code (PLAN-TO-LEAD gate)',
    head_commit: 'b123bb02380',
    branch: 'feat/SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001',
    merge_base: 'a9f19467b1d',
    findings_total: findings.length,
    findings_high: findings.filter((f) => f.severity === 'HIGH').length,
    findings_medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    findings_low: findings.filter((f) => f.severity === 'LOW').length,
    fr_verdicts: {
      'FR-1': 'MET',
      'FR-2': 'MET (advisories V-4, V-5)',
      'FR-3': 'MET',
      'FR-4': 'PARTIAL — 2 of 3 ACs met; sd_id derivation unmet (V-1)',
      'FR-5': 'MET',
      'FR-6': 'MET (PR-description limb pending, V-6)',
      'FR-7': 'MET — independently re-verified unapplied via direct pg connection',
      'FR-8': 'MET (scope-adjacent residue in caller, V-3)',
    },
    top_level_ac_verdicts: {
      'AC-1 TS-8 live fire': 'DEFERRED BY DESIGN — publication confirmed still unapplied',
      'AC-2 tests pass, not quarantined': 'MET — 39/39, no quarantine entry',
      'AC-3 <=1 migration, single ALTER PUBLICATION': 'MET',
      'AC-4 docs updated': 'MET',
      'AC-5 other 3 monitors unchanged': 'MET',
      'AC-6 no new env/flags/deps': 'MET',
    },
    user_story_status: {
      total: 7,
      marked_completed: 7,
      ac_actually_unmet: ['US-004 AC-2 (sd_id derived from the failing row\'s test_run_id)'],
    },
    independent_verification: {
      method: 'direct Postgres connection via scripts/lib/supabase-connection.js createDatabaseClient (NOT REST/PostgREST)',
      publication_members: 21,
      test_results_published: false,
      test_runs_published: false,
      test_failures_published: false,
      to_regclass_test_failures: null,
      to_regclass_playwright_test_scenarios: null,
      to_regclass_test_results: 'test_results',
      to_regclass_test_runs: 'test_runs',
      root_cause_reports_sd_id: 'character varying, FK -> strategic_directives_v2',
      test_runs_sd_id: 'character varying, FK -> strategic_directives_v2',
      tests_rerun: '39/39 passing (3 files) at HEAD b123bb02380',
      pr_exists: false,
    },
    retired_behaviour_sweep: {
      playwright_test_scenarios_runtime_refs: 0,
      playwright_test_scenarios_remaining: 'scripts/one-off/*.mjs (this SD\'s own DB-writer artifacts, historical quotation only)',
      test_failures_live_code_refs: ['lib/rca-monitor-bootstrap.js:42 (log string, see V-3)'],
      test_failures_other_refs: 'database/schema/005_test_failures_schema.sql (never applied), scripts/archive/one-time/*, docs/audits, docs/database, .claude/file-trees.md — all pre-existing, none executable against the fixed path',
      test_results_consumers: [
        'lib/reporters/leo-playwright-reporter.js:353 (writer)',
        'lib/test-evidence-ingest.js:274 (writer)',
        'scripts/lib/test-evidence-ingest.js:274 (writer)',
        'tests/e2e/fixtures/stringency-resolver.ts:225 (reader)',
      ],
      other_realtime_subscribers_to_test_results: 0,
      consumer_breakage: 'none — this SD only reads test_results/test_runs and changes no schema, column or constraint',
    },
    scope_drift: {
      files_changed: 13,
      product_files: 3,
      test_files: 2,
      process_artifact_files: 8,
      drift_detected: false,
      note: 'The 8 scripts/one-off/*.mjs files are DB-writer process artifacts (PRD, user stories, LEAD decisions, attestation). Inspected — none alter runtime behaviour.',
    },
    prior_evidence_reviewed: {
      'VALIDATION (LEAD)': '092fa8f6-b74a-4b11-842e-7b242f222fd8',
      'Explore (LEAD)': '32a7210a-4061-4ecd-90f5-a8bc372d5dc7',
      'TESTING (PLAN, prospective)': '5990427e-005c-44e8-bd40-5ed27fbcf347',
      'TESTING (EXEC)': '54a0c0f3-23b5-42b5-ac84-abe111c6f851',
      'SECURITY (EXEC)': '914040e9-221d-4ea3-97eb-70cbaac0c74c',
    },
    why_prior_reviews_missed_v1: 'EXEC TESTING (54a0c0f3) mutation-tested trigger_tier 2->3, which TS-1 catches. It did not mutate the sd_id source, and TS-1\'s single-run fixture makes that mutation undetectable — the assertion exists but its subject is unobservable. A green mutation test proves the mutations tried were caught, not that the suite is two-sided everywhere.',
    lead_conditions: conditions,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', sd.id, { name: 'VALIDATION' }, results, {
  phase: 'PLAN_VERIFICATION',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
