#!/usr/bin/env node
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';

const findings = [
  {
    id: 'R2-F1-metadata-clobber-FIXED-verified',
    severity: 'INFO',
    summary: 'CLOSED. writeBackfillRow() in scripts/one-off/backfill-integration-operationalization-v2.mjs:88-127 now reads the current metadata immediately before writing and spreads it (`{ ...(currentRow?.metadata || {}), integration_backfill: {...} }`). It also checks readError and returns {ok:false} rather than treating a failed read as absence, so a transient read cannot cause a silent clobber. The per-row `.is(integration_operationalization, null)` concurrent-write guard is retained on the UPDATE. Verified by reading the source at HEAD 23a0b39532c, not from the handoff claim.'
  },
  {
    id: 'R2-F2-second-blind-replace-in-prd-creator-FIXED-verified',
    severity: 'INFO',
    summary: 'CLOSED. The dormant sibling defect that SECURITY found (evidence row 9d21ac12) is fixed: createPRDWithValidatedContent UPDATE-existing branch now writes `metadata: llmContent.metadata ? { ...(existingPRD.metadata || {}), ...llmContent.metadata } : undefined` (prd-creator.js:359-363), and the row select at :323 now includes metadata so the merge has a base. The `undefined` fall-through is correct: it omits the key from the PATCH payload, leaving the column untouched, rather than writing null. I confirm this was a genuine live defect I did not check in round 1 and that SECURITY was right to raise it.'
  },
  {
    id: 'R2-F3-metadata-preservation-regression-suite-ADDED-verified',
    severity: 'INFO',
    summary: 'CLOSED. tests/unit/backfill-integration-operationalization-v2.test.js grew from 3 to 8 tests. The 5 added cases (lines 141-190) are: preserves ALL pre-existing metadata keys (the exact superset assertion that would have caught the incident); genuinely-empty prior metadata; null (non-object) prior metadata; placeholder written alongside merged metadata; and the concurrent-write guard (no write when the row is no longer NULL). Re-run by me at HEAD: 8/8 pass.'
  },
  {
    id: 'R2-F4-my-round-1-F3-was-WRONG-recovery-path-existed',
    severity: 'HIGH',
    summary: 'SELF-CORRECTION, recorded so the error is not repeated. My round-1 finding F3 asserted "no in-repo recovery path exists". That was WRONG. I probed five GUESSED table names (prd_history, product_requirements_history, audit_log, audit_logs, prd_audit) and reasoned from their absence, instead of enumerating the audit tables that actually exist. governance_audit_log has an AFTER UPDATE trigger writing old_values = row_to_json(OLD), and it holds a complete pre-image for every affected row: I re-measured live and found an audit row inside the backfill window for 1570 of 1570 marked rows, zero missing. The correct method was to enumerate, not to guess names and treat the miss as absence. A null from a guessed probe is not absence.'
  },
  {
    id: 'R2-F5-blast-radius-corrected-1382-not-1570',
    severity: 'INFO',
    summary: 'My round-1 blast-radius figure of 1570 was the MARKED-ROW count, not the damaged-row count, and it over-counted. Measured exactly from governance_audit_log pre-images: 1382 rows had non-empty prior metadata and genuinely lost data, totalling 7743 destroyed keys; 188 of the 1570 marked rows had genuinely EMPTY prior metadata and lost nothing. My round-1 statistical inference (1570/1570 single-key vs a 2.1% base rate) was directionally correct about the mechanism but the audit log gives the exact answer and supersedes the inference. The RCA sub-agent correction to 1382 is confirmed independently by my own measurement.'
  },
  {
    id: 'R2-F6-restore-1364-of-1382-verified-by-containment',
    severity: 'INFO',
    summary: 'Restore state measured live, independently of the handoff claim: 1570 rows still carry the integration_backfill provenance marker; 1364 now have more than one metadata key (restored) and 206 have only the provenance key. Containment verified per row: for all 1364 restored rows, the CURRENT metadata is a strict superset of that row\'s governance_audit_log pre-image — 1364 ok, 0 violations. Of the 206 not-yet-restored, 188 had genuinely empty prior metadata (nothing to recover) and 18 have real keys outstanding. 1364 + 18 = 1382 reconciles exactly with the corrected blast radius.'
  },
  {
    id: 'R2-F7-18-rows-outstanding-all-on-closed-SDs',
    severity: 'MEDIUM',
    summary: 'OPEN, non-blocking, tracked as a condition. 18 PRD rows still hold only the provenance key while their pre-image carries real data. Owning SD status: 17 completed, 1 cancelled — ZERO active SDs, so no in-flight work is affected. Affected ids include PRD-SD-VW-BACKEND-RESILIENCE-001 (8 keys outstanding: key_files, plan_handoff, failure_modes, risk_analysis, affected_tables, design_analysis, database_analysis, target_application), PRD-SD-VW-BACKEND-EXEC-RECORDS-001 (7 keys), PRD-SD-VW-UI-REALTIME-SUBS-001 (5 keys), and 15 others. Every one of the 18 has an intact governance_audit_log pre-image, so the data is recoverable whenever the final --execute is authorized. I verified the restore script is genuinely idempotent and cannot corrupt further: it re-checks each row live and only writes when the row still carries exactly the single provenance key, so a row already restored or legitimately rewritten by something newer is skipped.'
  },
  {
    id: 'R2-F8-errored-select-treated-as-absence-STILL-OPEN',
    severity: 'MEDIUM',
    summary: 'OPEN — you asked for my independent read and I confirm it is NOT fixed at HEAD 23a0b39532c. scripts/prd/prd-creator.js:780 still reads `const { data: currentRow } = await supabase...` with no error check. On a transient query failure currentRow is undefined, `!currentRow?.integration_operationalization` is true, and the placeholder is written OVER real authored content — the exact clobber the surrounding comment claims to prevent, and the same defect class as the incident, just with a one-row blast radius instead of 1382. Fix: destructure error and skip the default-write (leave the field out of prdUpdate) when the read did not succeed — mirroring what writeBackfillRow now does correctly. SCOPE CORRECTION to my round-1 wording: I also flagged prd-creator.js:313, but on closer reading an errored select there yields existingPRD=null which routes to the INSERT path, so it risks a DUPLICATE PRD (the pre-existing PAT-SDCREATE-001 hazard, present identically at :126 and not introduced by this SD), NOT a metadata clobber. Line 780 is the only genuinely new, in-scope instance.'
  },
  {
    id: 'R2-F9-restore-script-offset-pagination-is-safe-here',
    severity: 'INFO',
    summary: 'Checked because the original incident script was also an offset-pagination bug. restore-integration-backfill-metadata.mjs fetchAllMarkedRows uses .range(from, from+999) over the predicate `metadata->integration_backfill is not null`. That predicate does NOT shrink as rows are restored, because the restore re-merges the provenance marker back in rather than dropping it — confirmed live: all 1364 restored rows still count as marked. So offset pagination is safe in this specific script. Not a defect.'
  },
  {
    id: 'R2-F10-old-fabricating-script-still-present',
    severity: 'LOW',
    summary: 'Unchanged from round 1, still open, still LOW: scripts/archive/one-time/backfill-prd-integration.js (the script that fabricated content into 707 rows) remains present and runnable with no guard. Archived path, not wired to any npm script.'
  }
];

const conditions = [
  { action: 'Fix scripts/prd/prd-creator.js:780 to check the select error and skip the default-write when the read fails, rather than treating an errored read as absence (finding R2-F8).', priority: 'high', blocking: false },
  { action: 'Run the final restore --execute for the remaining 18 rows once authorization lands, then re-verify containment reaches 1382/1382 with 0 failures (finding R2-F7).', priority: 'high', blocking: false },
  { action: 'Delete or guard scripts/archive/one-time/backfill-prd-integration.js (finding R2-F10).', priority: 'low', blocking: false }
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  conditions,
  justification: 'Every blocking-class defect from the round-1 FAIL is fixed and independently re-verified at HEAD 23a0b39532c: the backfill now read-then-merges with proper read-error handling, the dormant sibling blind-replace in prd-creator.js is fixed, and a 5-case metadata-preservation regression suite pins the exact assertion that would have caught the incident. All tests pass on a clean re-run (61/61 across the 4 SD files; 496/496 across 40 files in the wider sweep). Two non-blocking conditions remain: an unfixed errored-select-as-absence bug at prd-creator.js:780 with a one-row blast radius, and 18 rows of the restore outstanding, all on completed or cancelled SDs with intact and recoverable audit pre-images. Neither blocks EXEC-TO-PLAN; both are tracked as conditions rather than gated on, because no active SD is affected and the recovery mechanism is proven idempotent.',
  findings,
  warnings: [
    { severity: 'MEDIUM', issue: 'prd-creator.js:780 still treats an errored SELECT as absence and can write the placeholder over real authored content.', recommendation: 'Destructure and check error; skip the default-write on a failed read, mirroring writeBackfillRow.' },
    { severity: 'MEDIUM', issue: '18 PRD rows remain unrestored (17 completed SDs, 1 cancelled; 0 active).', recommendation: 'Complete the restore --execute when authorized; pre-images are intact in governance_audit_log and the script is idempotent.' },
    { severity: 'HIGH', issue: 'My own round-1 finding F3 ("no recovery path exists") was wrong because I probed guessed table names instead of enumerating audit tables.', recommendation: 'Enumerate candidate relations before concluding absence; a miss on a guessed name is not evidence of absence.' }
  ],
  recommendations: [
    'SHOULD-FIX before merge: error handling at prd-creator.js:780 (R2-F8).',
    'TRACK: final 18-row restore --execute, then re-verify 1382/1382 containment (R2-F7).',
    'NICE-TO-HAVE: delete or guard the archived fabricating backfill script (R2-F10).'
  ],
  summary: 'CONDITIONAL_PASS at HEAD 23a0b39532c, upgraded from the round-1 FAIL. All three blocking defects are closed and verified by reading the source rather than trusting the handoff: the backfill read-then-merges (and handles its read error correctly), the sibling blind-replace in prd-creator.js is fixed, and a metadata-preservation regression suite was added. Tests re-run clean: 61/61 across the 4 SD files (up from 56, the +5 being the new preservation cases) and 496/496 across 40 files in tests/unit/gates + tests/unit/prd + the named suites. Recovery independently verified against governance_audit_log: the true blast radius was 1382 rows / 7743 keys (not my round-1 figure of 1570, which counted marked rows rather than damaged rows), 1364 are restored with per-row containment confirmed and zero violations, and the outstanding 18 all sit on completed or cancelled SDs with intact pre-images. Two non-blocking conditions carry forward: the unfixed errored-select bug at prd-creator.js:780, and the final 18-row restore. Also recorded: my round-1 claim that no recovery path existed was wrong, and the method error that produced it.',
  detailed_analysis: {
    sd_key: SD_KEY,
    phase: 'EXEC_TO_PLAN',
    round: 2,
    supersedes: 'round-1 FAIL, evidence row 96d51bde-ab68-4da3-b70a-2b37e9195d74',
    head_commit: '23a0b39532c9694e60ad16b4d02211a21f13f857',
    mode: 'post-remediation independent re-verification (source re-read at HEAD, tests re-executed, live DB re-measured)',
    go_no_go: 'GO with conditions',
    test_execution: {
      sd_test_files: { files: 4, tests_passed: 61, tests_failed: 0, note: 'up from 56 in round 1; +5 metadata-preservation cases' },
      wider_sweep: { scope: 'tests/unit/gates + tests/unit/prd + backfill-integration-operationalization-v2 + prd-creator-prevalidation + add-prd-content-arg-parser + contract-gate-parity + prd-metadata-consistency', suites: 164, tests_executed: 504, tests_passed: 504, tests_failed: 0, runner_artifact: '.artifacts/les012-test-runs/les012-exec-to-plan-r2.json', artifact_sha256: 'b5e74f9d37d1927ea7dab0ce3351af97644516ef0912465d771f560152c44e94' },
      independently_executed: true
    },
    live_db_verification: {
      marked_rows: 1570,
      true_blast_radius_rows: 1382,
      keys_destroyed: 7743,
      rows_with_genuinely_empty_prior_metadata: 188,
      rows_missing_an_audit_pre_image: 0,
      restored_rows: 1364,
      containment_ok: 1364,
      containment_violations: 0,
      outstanding_rows: 18,
      outstanding_owning_sd_status: { completed: 17, cancelled: 1, active: 0 },
      recovery_source: 'governance_audit_log (AFTER UPDATE trigger, old_values = row_to_json(OLD))',
      reconciliation: '1364 restored + 18 outstanding = 1382 = measured blast radius'
    },
    closed_from_round_1: ['F1 metadata clobber', 'F2 same bug live in committed script', 'F5 test coverage gap'],
    still_open_from_round_1: ['F6 errored-select-as-absence at prd-creator.js:780', 'F9 archived fabricating script present'],
    corrected_from_round_1: [
      'F3 was WRONG: governance_audit_log provided a full recovery path I failed to find by guessing table names',
      'F1 blast radius restated from 1570 marked rows to 1382 genuinely-damaged rows',
      'F6 scope narrowed: prd-creator.js:313 risks a duplicate PRD (pre-existing PAT-SDCREATE-001 hazard), not a metadata clobber; only :780 is a new in-scope clobber'
    ],
    verification_method: 'Re-read the three remediated code sites at HEAD rather than accepting the handoff summary; re-executed every test file from source; re-measured the live restore by keyset-paginating all marked rows and, for each, fetching its governance_audit_log pre-image inside the backfill window and asserting the current metadata is a superset of it. The blast-radius correction and the 18-row residue were derived from those pre-images, not from the reported figures.'
  },
  phase: 'EXEC_TO_PLAN',
  metadata: {
    test_execution: buildTestExecution({
      executed: 504,
      passed: 504,
      failed: 0,
      skipped: 0,
      artifactSha: 'b5e74f9d37d1927ea7dab0ce3351af97644516ef0912465d771f560152c44e94',
      runner: 'vitest@4.1.4 --reporter=json',
      artifactPath: '.artifacts/les012-test-runs/les012-exec-to-plan-r2.json',
      source: 'fresh'
    })
  }
};

async function main() {
  const sb = createSupabaseServiceClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase: sb });
  const finalResults = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(
    'TESTING', SD_KEY, { name: 'Enhanced QA Engineering Director v2.4.0' }, finalResults,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );
  console.log('ROW ID:', stored.id);
  console.log('verdict:', stored.verdict, '| confidence:', stored.confidence, '| phase:', stored.phase);
  console.log('repo_path:', stored.metadata?.repo_path);
  console.log('executed_from_cwd:', stored.metadata?.executed_from_cwd);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
