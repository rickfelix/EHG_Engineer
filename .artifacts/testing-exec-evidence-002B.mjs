import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = '058c33b2-62ce-45d0-a712-39716c5e8cfc';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B';
const UNIT = '.artifacts/testing-evidence/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B-unit.json';
const SMOKE = '.artifacts/testing-evidence/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B-smoke.txt';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const j = JSON.parse(fs.readFileSync(UNIT, 'utf8'));
const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const perFile = j.testResults.map((r) => ({
  file: r.name.replace(/\\/g, '/').split('/').slice(-3).join('/'),
  status: r.status,
  tests: r.assertionResults.length,
}));

const results = {
  verdict: 'PASS',
  confidence_score: 92,

  metadata: {
    phase: 'EXEC',
    sd_key: SD_KEY,
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B',
    review_type: 'exec_to_plan_measured_verification',
    measured: true,
    evaluated_commit_sha: head,
    session_id: 'fa09a46d-5b8e-4642-ae63-f1dce3f87fb1',
    prior_plan_row: '3b3bae92-e37a-41eb-9dcb-e214e3a4192a',
    test_execution: {
      framework: 'vitest',
      producer: 'vitest --project unit --reporter=json (runner-written file)',
      command: 'npx vitest run --project unit --reporter=json --outputFile=' + UNIT + ' lib/michael/ scripts/michael/ tests/unit/migrations/michael-tables-migration-shape.test.js tests/unit/cron/michael-retention-wiring.test.js scripts/michael-quiet-tick.test.js tests/unit/periodic-liveness-watcher.test.js',
      tests_executed: j.numTotalTests,
      tests_passed: j.numPassedTests,
      tests_failed: j.numFailedTests,
      tests_skipped: j.numPendingTests,
      suites: j.numTotalTestSuites,
      success: j.success,
      results_file: UNIT,
      sha256: sha(UNIT),
      per_file: perFile,
    },
    smoke_execution: {
      producer: 'bash .artifacts/smoke-run.sh (runner-written transcript)',
      results_file: SMOKE,
      sha256: sha(SMOKE),
      readers_inert_exit0: [
        'scripts/michael-rules-load.mjs --json -> {"tables_absent":true,"rules":[],"closures":[],"errors":[],"ok":true} exit=0',
        'scripts/michael-rules-render.mjs --json --out-dir <scratch> -> ok:true tables_absent:true counts{rules:0,closures:0} exit=0 (wrote only inside the supplied out-dir)',
        'scripts/michael/autonomy-read.mjs --json -> ok:true tables_absent:true threshold:7 proposals:[] revocations:[] exit=0',
        'scripts/michael/retention.mjs --json -> ok:true tables_absent:true mode:dry_run days:30 cutoff:2026-08-07 stamped:false exit=0',
      ],
      writers_named_refusal_exit2: [
        'rule-encode -> TABLES_ABSENT "michael_rules is not applied yet (chairman applies 20260906_michael_tables.sql)" exit=2',
        'closure-add -> TABLES_ABSENT "michael_closures: relation absent (migration unapplied)" exit=2 (with valid --key/--topic; a bare call is MISSING_ARGS exit=2)',
        'capture -> TABLES_ABSENT "michael_staged_items: relation absent (migration unapplied)" exit=2',
        'feedback-append -> TABLES_ABSENT "michael_feedback_ledger is not applied yet" exit=2',
        'gmail-act --thread x --archive -> GMAIL_CLIENT_ABSENT naming child C, would_call recorded, nothing written, exit=2',
        'todoist-act complete --task x --dry-run -> ok:true dry_run would_call closeTask exit=0 (see finding F1 for the non-dry-run path)',
      ],
    },
    lint_execution: {
      note: 'Each lint run with the exact invocation its workflow uses. HEAD is the post-merge main, so the three diff-scoped lints legitimately scan 0 changed files; the michael migration was therefore ALSO checked under the advisory --all sweeps and appears in ZERO violations of either scanner.',
      results: [
        { lint: 'secdef-execute-revoke-lint', cmd: 'node scripts/lint/secdef-execute-revoke-lint.mjs', exit: 0, out: 'diff: 0 file(s) scanned, 0 violations' },
        { lint: 'secdef-execute-revoke-lint --all (corroboration)', exit: 0, out: '308 pre-existing violations across 1685 files scanned; grep -ci michael = 0' },
        { lint: 'rls-anon-tenant-predicate-lint', cmd: 'node scripts/lint/rls-anon-tenant-predicate-lint.mjs', exit: 0, out: 'mode=diff scanned=0, 0 violations -- clean' },
        { lint: 'rls-anon-tenant-predicate-lint --all (corroboration)', exit: 0, out: 'mode=all scanned=1599, pre-existing backlog only; grep -ci michael = 0' },
        { lint: 'eol-renormalization-lint', cmd: 'node scripts/lint/eol-renormalization-lint.mjs', exit: 0, out: 'scanned 15574 eol=lf-managed paths, 0 renormalization-dirty (A26 satisfied)' },
        { lint: 'alter-default-override-lint', cmd: 'node scripts/lint/alter-default-override-lint.mjs', exit: 0, out: 'No un-allow-listed ALTER-SET-DEFAULT override drift' },
        { lint: 'count-truncation-diff-lint', cmd: 'node scripts/lint/count-truncation-diff-lint.mjs', exit: 0, out: '0 new needs-review select() sites across 0 changed files; readRows bound asserted by lib/michael/db.test.js:34 (A25)' },
        { lint: 'workflow-path-filter-lint', cmd: 'node scripts/lint/workflow-path-filter-lint.mjs', exit: 0, out: '0 brace-alternation path filters across 232 workflow files' },
        { lint: 'check-workflow-yaml (A24a)', cmd: 'node scripts/check-workflow-yaml.mjs .github/workflows/michael-retention-cron.yml', exit: 0, out: 'all 1 workflow file(s) parse OK' },
      ],
    },
    ddl_tier: {
      note: 'tests/ddl/michael-tables-ddl.db.test.js CANNOT run on this host (no PostgreSQL). Cited from CI, not re-asserted.',
      cited_run_id: '34006991077',
      job: 'ddl',
      conclusion: 'success',
      head_sha: '06a3161bf8a2b42d98bdd050d5a67880be4f8043',
      title: 'feat(SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B): the eleven michael_* tables (PR 1/6)',
      workflow_paths_registered: 'drive-reports-ddl.yml:125-129 lists the migration, the DOWN and the DDL test (A2 verified at this commit)',
    },
    amendments_verified: {
      landed: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24', 'A25', 'A26'],
      not_landed: [],
      evidence: {
        A1: 'tests/ddl/michael-tables-ddl.db.test.js (184 lines) applies the migration in PG16 and runs the extracted DO block plus has_table_privilege assertions; green in run 34006991077 job ddl',
        A2: '.github/workflows/drive-reports-ddl.yml:125-129 registers all three literal paths',
        A3: 'scripts/michael/verbs.test.js:59 - a plain new rule (no flip, no prior) needs NO verdict and writes one row',
        A4: 'verbs.test.js:108-120 table-driven, expect(new Set(codes).size).toBe(6)',
        A5: 'verbs.test.js:125 key-order-independent hash plus hand-typed-hash rejection; lib/michael/db.test.js:77 canonicalJson',
        A6: 'autonomy-read.test.js:30-45 precedence plus seeded threshold 3 yields a proposal at streak 3',
        A7: 'autonomy-read.test.js:65 mixed-rule ledger, exactly one proposal, for A',
        A8: 'autonomy-read.test.js:17 gap days ignored',
        A9: 'autonomy-read.test.js:17 override/skip/auto each reset; :59 complete AND delete never propose',
        A10: 'autonomy-read.test.js:95 a rule at threshold with a reopened_at is in revocations and NOT in proposals',
        A11: 'autonomy-read.test.js:84 reopened_at earlier than action_taken_at is not a revoke; moved_back_at is',
        A12: 'verbs.test.js:196 CHOSEN toEqual([approve,override,auto,skip]); :204 same-day append keeps the prior disposition (length 2)',
        A13: 'scripts/michael/act.test.js:124 same-date reschedule does not stamp moved_back_at; :104 reversesProposal requires a differing proposed_date',
        A14: 'act.test.js:44 GMAIL_CLIENT_ABSENT with ZERO from() calls',
        A15: 'retention.test.js:64 strict lt with the boundary row untouched; :81 never touches rules/closures/ledger/snapshots/labels/credentials/staged; :88 attempt increments from the newest same-ET-day row',
        A16: 'no michael file under tests/integration/; TS-11 executed as the live smoke run captured in the smoke transcript',
        A17: 'six write verbs measured exit 2 with named refusals (smoke transcript) plus unit twins at verbs.test.js:151/:178/:228 and act.test.js:89',
        A18: 'lib/michael/rules.test.js:92 git check-ignore docs/michael/generated/RULES.md',
        A19: 'rules.test.js:26-91 rules-load filters and shape, rules-render frontmatter/grouping/provenance, injected writer only',
        A20: 'verbs.test.js:86 guarded supersede writes both rows; :99 a zero-touch flip refuses the insert',
        A21: 'michael-tables-migration-shape.test.js:44-47 MICHAEL_TABLES length 11 and 11 CREATE TABLE IF NOT EXISTS; :151-153 11 DROP TABLE',
        A22: 'shape test:37-38 mirrors CHAIRMAN_GATED_RE and APPROVED_BY_RE from the seeder; asserted at :144-147',
        A23: 'every new suite is *.test.js - 10 files collected by the unit project, 168 tests, zero silently-skipped',
        A24: 'tests/unit/cron/michael-retention-wiring.test.js:15/21-29 pins cron 0 4 * * 0, contents:read, a concurrency group and env keys exactly [SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY] with no Google/Todoist/encryption secret; check-workflow-yaml exit 0',
        A25: 'lib/michael/db.test.js:34 - returns rows with a bounded select; count-truncation-diff-lint exit 0',
        A26: 'eol-renormalization-lint scanned 15574 lf-managed paths, 0 dirty',
      },
    },
    migration_disposition: {
      file: 'docs/audits/migration-dispositions.json',
      key: '20260906_michael_tables.sql',
      disposition: 'DEFERRED',
      source: 'auto:chairman-gate-marker',
      corroborated: false,
      note: 'FR-1 assumption confirmed: the seeder RULE A emitted the DEFERRED entry. The migration remains unapplied on the live DB, which is what makes every tables_absent=true reading above a genuine measurement of the inert path rather than a stub.',
    },
    findings: [
      {
        id: 'F1',
        severity: 'MEDIUM',
        blocking: false,
        title: 'todoist-act is act-then-record: the live Todoist API call precedes the tables-absent check',
        note: 'scripts/michael/todoist-act.mjs:47 issues the client call and only at :70 returns TABLES_ABSENT with api_applied:true ("the Todoist change was applied but not recorded"). scripts/michael/gmail-act.mjs:62 has the identical ordering. Measured live during smoke: a non-dry-run "todoist-act complete --task x" reached the real Todoist API and returned TODOIST_CALL_FAILED HTTP 400 (fake id, so nothing was mutated). The refusal is honest and unit-covered at act.test.js:89, and the seam is dry-run-guarded, but pre-migration the writer is NOT inert for Todoist the way the four readers are. Non-blocking for this SD (no ledger row can exist until the chairman applies the migration); worth a tables pre-flight before the API call in child C or a follow-up QF.',
      },
      {
        id: 'F2',
        severity: 'INFO',
        blocking: false,
        title: 'Three diff-scoped lints scanned 0 files at this HEAD',
        note: 'secdef-execute-revoke, rls-anon-tenant-predicate and count-truncation-diff resolve their file set from merge-base(HEAD, origin/main); the branch is already merged into main, so the diff is empty and a green result there is vacuous on its own. Corroborated by running the two SQL scanners in --all mode: the michael migration appears in zero violations across 1685 and 1599 files respectively. The blocking CI runs on the six PRs are the authoritative pass.',
      },
    ],
  },
  justification: 'PASS at 92%. Measured: 168/168 unit tests green across 10 suites (0 failed, 0 skipped) from a runner-written vitest JSON report; all six lints plus check-workflow-yaml exit 0; the four inert readers exit 0 with tables_absent=true and the write verbs exit 2 with named TABLES_ABSENT / GMAIL_CLIENT_ABSENT refusals against the real unapplied DB, captured to a runner-written transcript. All 26 PLAN amendments (row 3b3bae92) landed with a located assertion for each, including the three CRITICAL mechanical traps (A2 workflow paths, A16 TS-11 re-scoped out of tests/integration, A23 .test.js naming). The DDL tier is cited, not re-run: no PostgreSQL on this host, so tests/ddl/michael-tables-ddl.db.test.js is evidenced by CI run 34006991077 job "ddl" = success on 06a3161. Confidence is 92 rather than higher because (a) the DDL privilege assertions are cited from CI rather than measured here and (b) three diff-scoped lints scanned 0 files at a post-merge HEAD (F2). One non-blocking finding: todoist-act and gmail-act call the external API before the tables-absent check (F1).',
  recommendations: [
    'F1: add a tables-presence pre-flight to scripts/michael/todoist-act.mjs and scripts/michael/gmail-act.mjs before the external call, so the pre-migration posture is inert for writers as well as readers (child C or a follow-up QF).',
    'PLAN verification should re-run the diff-scoped lints on a PR head rather than on merged main (F2).',
    'The eleven tables remain unapplied by design; the chairman apply step gates any downstream child that needs live rows.',
  ],
};

const resolution = await resolveSubAgentRepo({ sdId: SD_UUID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_UUID, { name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
console.log('STORED_ID:', stored?.id || JSON.stringify(stored));
console.log('VERDICT:', results.verdict, 'CONF:', results.confidence_score);
console.log('repo_path:', results.metadata.repo_path);
console.log('executed_from_cwd:', results.metadata.executed_from_cwd);
console.log('tests:', results.metadata.test_execution.tests_executed, 'passed', results.metadata.test_execution.tests_passed);
console.log('unit_sha:', results.metadata.test_execution.sha256);
console.log('smoke_sha:', results.metadata.smoke_execution.sha256);
