import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = 'fbbf9a6d-e079-4c22-9189-88336aae9a16';
const commit = execSync('git rev-parse HEAD').toString().trim();
const reviewed = [
  'database/chairman-gated/20260913_uat_control_pack_evaluated_derive.sql',
  'database/chairman-gated/20260913_uat_control_pack_evaluated_derive_DOWN.sql',
  'database/chairman-gated/20260913_uat_control_pack_evaluated_derive_dry_run.mjs',
  'scripts/lint/summary-column-derivation-lint.mjs',
  '.github/workflows/summary-column-derivation-lint.yml',
];
const h = createHash('sha256');
for (const f of reviewed) h.update(f + '\0' + readFileSync(f, 'utf8'));
const contentHash = h.digest('hex');

const critical_issues = [];

const warnings = [
  {
    severity: 'MEDIUM',
    issue: "NEW (introduced by the CRITICAL-2 fix): moving the snapshot into the UP file makes a re-apply cycle (UP -> DOWN -> UP) append a SECOND, POST-derivation batch into the same uat_control_pack_evaluated_rollback_snapshot table, because DOWN deliberately leaves the table in place and the UP's INSERT ... SELECT is unconditional. Verified live in one always-ROLLBACK transaction: after UP -> (trigger corrects a drifted row true->false) -> DOWN -> UP, the table holds 2 rows for the same id with values [true, false] -- the first is the genuine pre-derivation value, the second is post-derivation state carrying a pre-derivation label. The table has 0 constraints (no PK, no batch id) and neither file documents that a restore must use the earliest snapshotted_at batch. In the real apply path (apply-migration.js runs each file in its own transaction) the two batches DO get distinct snapshotted_at values, so an operator who knows to filter can tell them apart -- the gap is the absence of a marker/PK/guidance, not indistinguishability. This is the CRITICAL-2 failure class re-entering through the re-apply door, and a re-apply during an incident is precisely when this table gets read.",
    recommendation: 'Make the UP snapshot idempotent or batch-labelled: either guard the INSERT with a NOT EXISTS predicate over the snapshot table, or add a batch_id uuid DEFAULT gen_random_uuid() / migration-run marker column, and state in both file headers that a restore must use the EARLIEST batch.',
  },
  {
    severity: 'LOW',
    issue: "TS-2j in the dry-run does not discriminate. Its fixture row's control_pack_status is fully-evaluated, so the correct derived value is true AND the stored value is true -- the assertion control_pack_evaluated === true therefore passes whether the guard short-circuits or recomputes. Proven live: I ran TS-2j's exact sequence and exact assertion against a trigger with NO GUARD AT ALL (always recomputes) and TS-2j still passed. Its log line -- 'does not recompute -- correct value preserved, not merely unchanged by coincidence' -- overclaims; it IS unchanged by coincidence. The short-circuit behaviour it purports to test is real (verified separately, see the third warning), but TS-2j is not what establishes it.",
    recommendation: 'Make TS-2j discriminating: plant a row whose stored control_pack_evaluated DISAGREES with its control_pack_status (insert with the trigger disabled via ALTER TABLE ... DISABLE TRIGGER), then UPDATE only the unrelated subkey and assert the DISAGREEING value survives. That assertion fails against an unguarded trigger and passes only against the real guard.',
  },
  {
    severity: 'LOW',
    issue: "Residual self-healing boundary (not a regression; the precise limit of the headline 'can never drift out of sync' claim). The widened guard makes the summary self-healing for every write that touches control_pack_status or control_pack_evaluated, so a row that passes through an INSERT under the trigger can never drift. But a row already drifted BEFORE the trigger is installed is NOT auto-healed by (a) an UPDATE touching only unrelated metadata subkeys, or (b) a re-write of the SAME wrong value (OLD.cpe IS NOT DISTINCT FROM NEW.cpe, so the guard does not fire). Both verified live against a deliberately planted pre-install drifted row. Because the migration ships NO BACKFILL, this is the one path by which a stale wrong value can persist after install. I re-measured the live corpus and the NO BACKFILL decision is currently SAFE: 26 rows, 24 carry the key with 0 disagreements against the exact trigger predicate, and the 2 rows missing the key both derive to false -- which is what the sole consumer (lib/eva/uat-robustness-gate.js:141, a falsy check) already treats them as. Zero live instances, so this is a documentation-precision point, not a live defect.",
    recommendation: 'Either state the boundary explicitly in the UP header (post-install rows can never drift; pre-install drift is not backfilled and is only healed by a write that changes control_pack_status or the value of control_pack_evaluated), or add a one-line backfill UPDATE right after the snapshot -- now cheap and provably a no-op, since 0 of 26 rows disagree.',
  },
];

const recommendations = [
  'SHIP. Both CRITICAL findings from evidence cf40b474 are fixed and independently re-verified by execution against a live PG 17.4 database in always-ROLLBACK transactions; both MEDIUM findings are fixed; the live table is byte-identical before and after all runs.',
  'Before the chairman apply-ceremony, address the MEDIUM (re-apply appends a post-derivation snapshot batch) -- it is a ~2-line change (idempotency guard or batch marker) and it protects the exact artifact an operator reads during a rollback.',
  'Fix TS-2j to be discriminating so the dry-run genuinely covers the short-circuit branch; today that branch is covered by no assertion that could fail.',
  'Consider adding the now-provably-no-op backfill so the UP file needs no caveat on its headline invariant.',
  'No action needed on recursion: the widened guard introduces ZERO infinite-recompute risk, verified by invocation counting rather than by reasoning alone.',
];

const detailed_analysis = {
  verdict: 'PASS',
  confidence: 94,
  scope:
    "Independent EXEC-phase RE-CHECK of commit dbd9205b64a, executing the code rather than reading it. All DB work ran against the live EHG database via lib/supabase-connection.js createDatabaseClient('ehg') inside BEGIN/ROLLBACK transactions; nothing was committed.",
  prior_findings_status: {
    'CRITICAL-1 (direct write to control_pack_evaluated bypassed derivation)':
      "FIXED -- verified live with a positive control. I first rebuilt the PRE-FIX 2-clause guard and reproduced the original failure exactly: INSERT a row with control_pack_status 4/4 not_attempted (derives false), then UPDATE with jsonb_set on control_pack_evaluated to true -> value stuck at TRUE (drift). I then dropped it, applied the CURRENT UP file, and ran the identical sequence: the forced true is immediately corrected to FALSE, and a fresh SELECT confirms FALSE is what actually persisted (not merely what RETURNING showed). A wholesale metadata replacement carrying control_pack_evaluated=true is likewise corrected to false. The baseline reproduction is what makes this a real test rather than a green that could not have failed.",
    'CRITICAL-2 (DOWN snapshot ran after the trigger was live)':
      'FIXED -- DOWN (22 lines) now contains only DROP TRIGGER IF EXISTS + DROP FUNCTION IF EXISTS; there are zero snapshot/INSERT/CREATE TABLE statements in it. In the UP file the snapshot table creation and INSERT ... SELECT are at lines 113-122 and CREATE TRIGGER is at lines 124-128 -- the snapshot strictly precedes trigger creation. The dry-run observes 26 snapshot rows captured before the trigger could touch anything. See the MEDIUM warning for the residual re-apply wrinkle this fix introduced.',
    'MEDIUM-3 (jsonb_build_object matched regardless of statement shape, 10/10 false positives)':
      'FIXED, and the drop is measured, not asserted. I checked out the PRE-FIX lint from commit 72429bd7b71 and ran it against the same live corpus: 8 files / 10 findings, every one an audit-log INSERT or a function RETURN payload. The CURRENT lint on the same corpus: 1 file / 1 finding. That remaining finding is GENUINE, not another false positive -- database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql line 92 is an UPDATE public.ventures SET metadata = jsonb_set(... || jsonb_build_object(pbn_verdict, ...)), i.e. an in-place overwrite of an existing persisted jsonb column with a summary-shaped key and no CREATE TRIGGER in the file. Correct shape, correctly flagged.',
    'MEDIUM-4 (lint scope implied, not stated)':
      'FIXED -- lint docstring lines 30-33 state the scope explicitly, naming database/chairman-gated/ as a deliberate exclusion ("a deliberate future decision, not an oversight"). The CI workflow comment carries the same statement.',
    'LOW (2 stale docstring claims about a -> / ->> detection path never implemented)':
      'FIXED -- searching for the ->> operator across both the lint and the workflow YAML returns nothing; the claim is gone from both.',
  },
  executed_verification: {
    'recursion / infinite-recompute probe (task item 6)':
      'NO RISK -- measured, not reasoned. The concern was that the trigger WRITES control_pack_evaluated inside its own body while the guard now COMPARES that same key, so it might re-fire on itself. It cannot: a BEFORE ROW trigger that merely assigns to NEW issues no new SQL statement against the table, and row triggers fire once per row per statement. Verified with an instrumented clone of the function (identical logic plus a counter table): INSERT -> exactly 1 invocation; the UPDATE that forces a wrong control_pack_evaluated (the precise self-write scenario) -> exactly 1 invocation, 16ms; a bulk UPDATE of all 27 rows -> exactly 27 invocations for 27 rows updated, 56ms. Invocations == rows, never more.',
    'dry-run script':
      'PASS, exit code 0. All 13 assertions true, including the new TS-2k (a direct write forcing control_pack_evaluated=false on a fully-evaluated row is self-corrected back to true). I ran it TWICE back-to-back and both runs were clean, which independently proves the ROLLBACK holds -- a leak would have left the trigger or the snapshot table behind and broken run 2.',
    'live table untouched after all runs':
      'CONFIRMED byte-for-byte. Pre-state and post-state both: 26 rows, 0 user triggers on uat_test_runs, no derive_uat_control_pack_evaluated function, to_regclass of the snapshot table IS NULL, and an md5 over every row id+metadata ordered by id identical at 43a757ede4de2fe53d1376403455b90c.',
    'unit tests':
      'PASS -- 3 files, 31 tests, 0 failures (tests/unit/lint/summary-column-derivation-lint.test.js, tests/unit/eva/uat-robustness-gate-control-pack-sync.test.js, tests/unit/eva/uat-robustness-gate.test.js). The MEDIUM-3 fix carries its own named regression test: "ignores jsonb_build_object inside an INSERT INTO ... VALUES (audit-log row, not a persisted summary column)".',
    'CI blast radius of the 1 remaining lint finding':
      'NOT A CI BREAKER. The lint exits 1 on the live corpus, but .github/workflows/summary-column-derivation-lint.yml sets continue-on-error: true on the lint step (advisory-first, matching the alter-default-override-lint.yml precedent), so the workflow stays green. permissions are correctly narrowed to contents: read.',
    'production writer compatibility of the widened guard':
      'NO REGRESSION. The widened guard now overrides any app-written control_pack_evaluated, so I checked every writer. lib/uat/result-recorder.js:619 is the sole production writer and it sets control_pack_evaluated and control_pack_status in the SAME .update() metadata object -- the trigger therefore re-derives from the freshly-written status and agrees with the app allRequiredEvaluated for every shape that writer produces. There is no code path that writes the summary without its detail.',
    'NO BACKFILL claim re-measured live':
      'HOLDS TODAY. uat_test_runs: 26 rows; 24 carry control_pack_evaluated with 0 disagreements against the exact trigger predicate; 2 lack the key and both derive to false, matching the sole consumer falsy treatment. 0 rows would be changed by a backfill.',
  },
  new_defects_introduced:
    '1 MEDIUM (snapshot re-apply) + 2 LOW. None blocks the fix; the MEDIUM is confined to the rollback artifact and has a ~2-line remedy.',
  provenance: {
    commit,
    reviewed_files: reviewed,
    content_hash: contentHash,
    database: 'live EHG (PG 17.4), all writes inside BEGIN/ROLLBACK',
    probes: [
      '.artifacts/tst-rc-live1.mjs (CRITICAL-1 pre-fix reproduction + post-fix self-heal)',
      '.artifacts/tst-rc-live2.mjs (recursion invocation counting + live corpus predicate measurement)',
      '.artifacts/tst-rc-live3.mjs (TS-2j discrimination probe)',
      '.artifacts/tst-rc-live5.mjs (re-apply snapshot value divergence)',
    ],
  },
};

const results = { verdict: 'PASS', confidence: 94, critical_issues, warnings, recommendations, detailed_analysis };

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  supabase: s,
});
applySubAgentRepoVerdict(results, resolution);
results.metadata = {
  ...results.metadata,
  commit_sha: commit,
  content_hash: contentHash,
  reviewed_files: reviewed,
  branch: 'feat/SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001',
  run_id: randomUUID(),
  recheck_of: 'cf40b474-85f4-496e-9e87-0755c39328b1',
};

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  detailed_analysis: JSON.stringify(results.detailed_analysis),
  execution_time: 0,
  metadata: results.metadata,
  validation_mode: 'prospective',
  phase: 'EXEC',
  source: 'testing-agent (Opus 5) EXEC re-check -- executed, not read',
  summary:
    'RE-CHECK of commit dbd9205b64a. Both CRITICALs from cf40b474 verified FIXED by execution against live PG (CRITICAL-1 confirmed with a pre-fix positive control that reproduced the original drift, then showed the current code self-heals). Both MEDIUMs fixed; lint false positives measured 10 -> 1, and the 1 survivor is a genuine persisted-column UPDATE. No recursion risk: exactly 1 trigger invocation per row per statement, counted. Dry-run passes twice, live table byte-identical, 31/31 unit tests pass. 1 new MEDIUM (UP->DOWN->UP appends a post-derivation batch to the rollback snapshot table) + 2 LOW, none blocking.',
  executed_from_cwd: process.cwd(),
};

const { data, error } = await s.from('sub_agent_execution_results').insert(row).select('id, verdict, confidence, created_at').single();
if (error) {
  console.log('INSERT ERROR:', error.message, JSON.stringify(error));
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));
console.log('content_hash', contentHash);
console.log('repo_path', results.metadata.repo_path);
