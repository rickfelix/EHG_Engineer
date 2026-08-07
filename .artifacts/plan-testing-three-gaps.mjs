import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-THREE-GAPS-APPLIED-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 88,
  summary:
    'Test strategy is sound because every deliverable here is a FENCE, and the PRD requires each one '
    + 'demonstrated on a seeded defect rather than accepted on a green run. Eight scenarios, four of them '
    + 'paired two-sided. Two conditions carried into EXEC: seed the data, and never apply the DDL.',
  findings: [
    { id: 'every-fence-must-be-proven-able-to-fail', severity: 'critical', note: 'THE GOVERNING CONSTRAINT (TR-3). Each deliverable in this SD is a check whose whole value is failing when something diverges. A check that has never failed is indistinguishable from a check that CANNOT fail, and this SD exists precisely because three such mechanisms were trusted without that proof. TS-3/TS-4 and TS-5/TS-6 are deliberately paired so each fence is exercised in both directions; a fence delivered with only its passing case is not accepted here.' },
    { id: 'seed-the-data-the-live-population-is-one-row', severity: 'critical', note: 'MEASURED: public.feedback holds exactly 1 row with source_type=telegram and 0 matching feedback_type LIKE user_%. The rate limit is count(*) < 50. Any test that leans on live data asserts against a population of one and PASSES VACUOUSLY while appearing to exercise the threshold. TS-5/TS-6 must seed 50+ rows themselves. This is the capped-fetch/measured-the-wrong-population failure in test clothing.' },
    { id: 'the-load-bearing-direction-of-fr3-is-the-narrowed-case', severity: 'critical', note: 'TS-5 is the scenario that justifies FR-3 existing. The limit works TODAY (verified: anon SELECT is telegram_bot_select_feedback USING source_type=telegram, which covers the limit WHERE clause exactly), so a test that only checks current behaviour proves nothing about the hazard. The test must NARROW anon SELECT in the fixture and assert the insert is STILL rejected. A run where the narrowed case ACCEPTS is the exact defect, and it must fail the suite rather than be reported as a warning.' },
    { id: 'restrictive-keyword-needs-its-own-assertion', severity: 'critical', note: 'TS-7 exists because the failure is invisible post-hoc: anon_feedback_ingress_bounds is the ONLY restrictive policy on feedback while anon holds two PERMISSIVE insert policies, and permissive policies OR together. A recreate that drops AS RESTRICTIVE disarms the entire bound while pg_policy still lists the policy as present. The assertion must read the STAGED SQL and fail when the keyword is removed — asserting on the live catalog cannot help, because the DDL is never applied by the builder.' },
    { id: 'fr1-acceptance-is-partly-a-text-assertion-not-a-code-assertion', severity: 'warning', note: 'FR-1 can legitimately be satisfied by AMENDING A CLAIM rather than changing code, so TS-1/TS-2 assert on closure language as well as on the grant. That is unusual and correct: a false closure claim is worse than an open gap because it stops anyone looking. CAUTION FROM THIS SESSION: a grep over prose matches the prose EXPLAINING the thing being searched for — four separate instances this session, including inside a verification script written to catch exactly that. Any claim-scanning check must strip comments and anchor on the asserted sentence, not a bare keyword.' },
    { id: 'the-sd-premise-was-overstated-and-tests-must-follow-the-corrected-one', severity: 'warning', note: 'The SD states the function inserts severity=high. MEASURED: two paths — normal writes medium, storm-watermark writes high. A test written against the SD sentence would exercise a path that does not produce the claimed severity and would pass while proving nothing. TS-1 asserts BOTH literals; TS-2 asserts the storm-path reachability condition (caller controls p_error_hash against a 20-fingerprint-per-hour ceiling) is stated rather than hand-waved.' },
    { id: 'no-applied-ddl-means-validation-is-read-only', severity: 'warning', note: 'TS-8. Every staged migration is validated via BEGIN; SET TRANSACTION READ ONLY; ...; ROLLBACK. The builder stages; the chairman applies — and that holds even inside a rolled-back transaction, so a test that applies DDL to prove the migration works is itself a violation. Evidence rows for this SD must show ddl_applied=0.' },
    { id: 'coverage-boundary-g2-is-not-tested-here-and-that-is-deliberate', severity: 'info', note: 'No scenario covers G2 (the cold-DoS rate-limit clause). That is correct scope — G2 is a separate chairman ratification ask — but FR-5 requires completion evidence to state G2 status POSITIVELY. An absence of G2 tests is not evidence that G2 was considered, which is why the requirement is a positive statement rather than a silence.' },
  ],
  metadata: {
    scenarios: 8, two_sided_pairs: 2, seeded_defect_required: true,
    ddl_applied: 0, conditions: 2,
    mechanism_verifications: [
      { verified_by: 'the live telegram population is too small to exercise the limit', verified_at: 'public.feedback where source_type=telegram: 1 row total, 0 matching feedback_type LIKE user_% — against a count(*) < 50 threshold' },
      { verified_by: 'the rate limit is not starved today, so the narrowed case is the only meaningful test', verified_at: 'pg_policy.polroles: select_feedback_policy -> authenticated; telegram_bot_select_feedback -> anon USING (source_type=telegram)' },
      { verified_by: 'the ingress bound is restrictive among permissive peers on the same role and command', verified_at: 'pg_policy.polpermissive=false for anon_feedback_ingress_bounds; telegram_bot_insert_feedback and venture_user_insert_feedback are permissive, role anon, cmd a' },
      { verified_by: 'the function has two insert paths with different severities', verified_at: 'pg_get_functiondef(record_venture_error): normal VALUES (... issue,new,medium); storm VALUES (... issue,new,high)' },
    ],
  },
  execution_time_ms: 720000,
};

const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testing, res);
const s = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, testing, { phase: 'PLAN' });
console.log('STORED TESTING/PLAN id=' + (s && s.id));
