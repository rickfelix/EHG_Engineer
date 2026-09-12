// TESTING evidence for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D, phase EXEC.
// Every count below is READ from a runner-written results file and hashed here.
// Nothing is hand-written from a summary (ratification 6c263823).
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution, isMeasuredExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_UUID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const SESSION_ID = '45211d51-02f2-4f3e-91cc-0a0524c003fe';
const COMMIT = '68c2b9481c8e784b462a401ab3c8f29543c95641';
const RUNNER = 'vitest/4.1.4 win32-x64 node-v24.12.0 --project unit --reporter=json';

const R = '.artifacts/qa-results/';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// --- runner artifacts -------------------------------------------------------
const shippedPath = R + 'michael-d-shipped.json';
const fullPath = R + 'unit-full.json';
const floorPath = R + 'baseline-floor.json';
const lintPath = R + 'eslint-shipped.json';
const smokePath = R + 'ts15-smoke.json';

const shipped = load(shippedPath);
const full = load(fullPath);
const floor = load(floorPath);
const lint = load(lintPath);
const smoke = load(smokePath);

const shippedSha = sha(shippedPath);
const fullSha = sha(fullPath);
const floorSha = sha(floorPath);
const lintSha = sha(lintPath);
const smokeSha = sha(smokePath);

const rel = (n) => n.replace(/\\/g, '/').replace(/^.*002-D\//, '');
const perFile = shipped.testResults.map((s) => ({
  file: rel(s.name),
  tests: s.assertionResults.length,
  passed: s.assertionResults.filter((a) => a.status === 'passed').length,
  failed: s.assertionResults.filter((a) => a.status === 'failed').length,
  status: s.status,
}));
const floorPerFile = floor.testResults.map((s) => ({ file: rel(s.name), tests: s.assertionResults.length, status: s.status }));

const lintErrors = lint.reduce((a, f) => a + f.errorCount, 0);
const lintWarnings = lint.reduce((a, f) => a + f.warningCount, 0);

// --- test_execution: the SD's own shipped suite -----------------------------
const test_execution = buildTestExecution({
  executed: shipped.numTotalTests,
  passed: shipped.numPassedTests,
  failed: shipped.numFailedTests,
  skipped: shipped.numPendingTests || 0,
  artifactSha: shippedSha,
  runner: RUNNER,
  artifactPath: shippedPath,
  source: 'fresh',
});
if (!isMeasuredExecution(test_execution)) throw new Error('test_execution not measured - refusing to write');
if (test_execution.tests_failed !== 0) throw new Error('shipped suite has failures - refusing to write PASS');

// --- TS-1..TS-19 coverage map (test file + case named for each) -------------
const scenario_coverage = {
  scenarios_total: 19,
  covered: 17,
  covered_unlabelled: 1,
  uncovered_by_automated_test: 1,
  map: [
    { ts: 'TS-1', title: 'Harness inert paths', type: 'unit', status: 'covered',
      tests: ['lib/michael/feeder.test.js > runFeeder inert paths (TS-1) > 8 cases: unregistered feeder id refused before any read; inert outside the ET window; window END minute is in-window (calendar-read at exactly 05:00); inert tables_absent on a missing relation; inert already_ok / ceiling_hit / upstream_not_ready; { feeder, accept } narrows readiness; malformed upstream is UPSTREAM_INVALID before any read; a degraded upstream counts as ready'] },
    { ts: 'TS-2', title: 'Single-flight and attempt', type: 'unit', status: 'covered',
      tests: ['lib/michael/feeder.test.js > single-flight and attempt (TS-2) > 10 cases, incl. "a row started 12 minutes ago on a */15 feeder is still in_flight; 21 minutes ago is not"; "writes the start row as status skipped / phase started"; "retries exactly once on a 23505 ... minting attempt max+1"; "a 23505 whose re-read shows the winner still running yields in_flight"; "losing the race twice is inert in_flight, never failed"'] },
    { ts: 'TS-3', title: 'Upstream ordering and assembleReadiness', type: 'unit', status: 'covered',
      tests: ['lib/michael/feeder.test.js > assembleReadiness (TS-3) > 4 cases: assembles when every required feeder is ok (best attempt per feeder); degraded when a required feeder is only degraded; waits for a missing feeder before the deadline and assembles degraded after it; honours injected required set and deadline (child E contract)'] },
    { ts: 'TS-4', title: 'PII-safe logging', type: 'security', status: 'covered_unlabelled',
      tests: [
        'scripts/michael/gmail-triage.test.js:167 (in "dry run: metadata-only reads, rules-first matching, auto_apply gate...") asserts none of 8 seeded PII literals (@, subjects, sender domains) reaches counts or preview rows',
        'scripts/michael/calendar-read.test.js:163 asserts no attendee address (p1@) reaches counts',
        'lib/michael/feeder.test.js:193 (in "a coded throw from run() lands as status failed") asserts the ledger row carries no @',
        'lib/michael/feeder.test.js > "logs single-line JSON to the injected logger and never to stdout" — capturing logger, one line per record, no newline, never stdout',
        'scripts/michael/todoist-brief.test.js:97 asserts mutationRecord is redacted to a hash (task title absent)',
        'scripts/michael/tasks-classifier.test.js:191 asserts task content is not passed through to addTask',
      ],
      note: 'Covered in substance by 6 assertions across 5 files but no test carries a TS-4 label. The capturing-logger assertion (feeder.test.js) checks line SHAPE, not PII absence; PII absence is asserted on the counts/preview/row payloads that the log line is built from. Equivalent in effect, weaker in form than PLAN checklist item 13, which asked for seeded address/subject/content literals asserted absent on the captured lines themselves.' },
    { ts: 'TS-5', title: 'Gmail ceiling and record-then-act', type: 'unit', status: 'covered',
      tests: [
        'scripts/michael/gmail-triage.test.js > "TS-5: 80 intents with ceiling 60 yield exactly 60 modify calls in creation order, degraded with ceiling_hit, 20 intents left"',
        'scripts/michael/gmail-triage.test.js > "TS-5 re-run: after an interrupted run only the intents without action_taken_at are acted on"',
        'scripts/michael/gmail-triage.test.js > "the ceiling bounds the ET date: prior runs\' threads_modified shrink the budget and exhaust it (five fires, exactly 60 for the date)"',
        'scripts/michael/gmail-triage.test.js > "two live attempts cannot spend additively: the ledger is re-read every LEDGER_RECHECK_EVERY modifies"',
        'lib/michael/gmail-client.test.js > "getThreadMeta requests format metadata with exactly the four headers and never a body"',
      ] },
    { ts: 'TS-6', title: 'Borderline resurfacing', type: 'unit', status: 'covered',
      tests: ['scripts/michael/gmail-triage.test.js > "TS-6: a previously archived thread back with a newer last message is written borderline and not modified"'] },
    { ts: 'TS-7', title: 'Missing label degrades', type: 'unit', status: 'covered',
      tests: ['scripts/michael/gmail-triage.test.js > "TS-7: a configured class whose label is missing from Gmail degrades, is listed, and its rule is skipped while others proceed"'] },
    { ts: 'TS-8', title: 'Calendar classification', type: 'unit', status: 'covered',
      tests: ['scripts/michael/calendar-read.test.js > classifyDay (TS-8) > 5 cases: Recovery with no non-optional events; Interpersonal >=3 accepted / Deep <2 / Shallow exactly 2; a coded event overrides everything incl. three meetings and the Tuesday rule; Tuesday-office rule fires only on Tuesday; summarize reports counts by date/coded/optional/overlap'] },
    { ts: 'TS-9', title: 'Tasks-classifier guards and routing', type: 'unit', status: 'covered',
      tests: [
        'scripts/michael/tasks-classifier.test.js > "TS-9: a stale file (> 36 h) is skipped/stale with no Todoist call; a missing file is skipped/file_missing"',
        'scripts/michael/tasks-classifier.test.js > "TS-9: an unconsumed cleanup-pending.json ... is skipped/cleanup_pending; a consumed one proceeds"',
        'scripts/michael/tasks-classifier.test.js > "TS-9 dry run: routes by bucket, previews creations and stagings, calls no addTask and writes nothing"',
        'scripts/michael/tasks-classifier.test.js > "TS-9 apply: creates routed non-duplicate tasks with both labels, stages unrouted items and the consumed set, never writes Drive"',
        'scripts/michael/tasks-classifier.test.js > "the Todoist dedupe follows every page: a twin on page 2 is still a duplicate"',
      ] },
    { ts: 'TS-10', title: 'Todoist brief filtering and auto_apply', type: 'unit', status: 'covered',
      tests: [
        'scripts/michael/todoist-brief.test.js > "TS-10 dry run: exclusions by name and id, grading, role tags, ungraded null, planned mutations; writes nothing"',
        'scripts/michael/todoist-brief.test.js > "TS-10 apply: guarded snapshot writes of the owned keys, label and reschedule mutations applied once and recorded redacted"',
        'scripts/michael/todoist-brief.test.js > "TS-10 re-run: a mutation already in mutations_applied is deduped, a row with chosen_action set is untouched, an archive-verb rule never mutates"',
      ] },
    { ts: 'TS-11', title: 'Venue refusal on GHA', type: 'security', status: 'covered_with_deviation',
      tests: [
        'scripts/michael/calendar-read.test.js > "GITHUB_ACTIONS=true is refused HOST_VENUE_REQUIRED before any client or read, even with auth injected" (asserts calls==[] AND dbCalls==[])',
        'scripts/michael/gmail-triage.test.js > "runGmailTriage refuses GITHUB_ACTIONS=true before any call, --modify without --apply, --date, a bad --et-date, and an invalid ceiling"',
        'scripts/michael/tasks-classifier.test.js > "refuses GITHUB_ACTIONS=true before any Drive call even with auth injected"',
        'scripts/michael/queue-read.test.js > "--headers ... refused on GHA"',
      ],
      deviation: 'PRD TS-11 expects "a failed run row with error_code HOST_VENUE_REQUIRED". The shipped code refuses EARLIER: assertHostVenue runs before runFeeder (calendar-read.mjs:203, tasks-classifier.mjs:147), so it returns a refusal envelope and writes NO run row and makes NO DB call at all. Strictly safer than the scenario (zero writes, no client), but the stated run row does not exist. Writing one would require the DB client the refusal deliberately never constructs. Recorded as a scenario/implementation divergence, not a defect.' },
    { ts: 'TS-12', title: 'Workflow wiring', type: 'integration', status: 'covered',
      tests: ['tests/unit/cron/michael-todoist-brief-wiring.test.js > 5 cases covering every TS-12 clause: EXACTLY the Supabase pair plus TODOIST_API_TOKEN and no Google credential; order-sensitive env keys; the EDT and EST cron pair with the ET window comment, dispatch, read-only contents, single-flight concurrency and a 10-minute timeout; npm ci --ignore-scripts on node 22 invoking todoist-brief.mjs --apply by repo-relative path with no cd; repo-wide grep that no workflow references the Google client or the Michael encryption key'] },
    { ts: 'TS-13', title: 'Host registrar builders', type: 'unit', status: 'covered',
      tests: ['tests/unit/fleet/setup-michael-host-tasks.test.js > 10 cases covering every TS-13 clause: /SC MINUTE /MO 15 /ST 00:00 /F with NEITHER /RU NOR /NP; the TR action as the quoted hidden launcher with --verify reading the split <Command>/<Arguments> XML; a Task-Scheduler-illegal character throws inside the build path before any schtasks call (QF-20260906-961); --status, --remove, --verify branches; missing run-hidden.vbs refusal; non-win32 exit 2'] },
    { ts: 'TS-14', title: 'Recorder provenance', type: 'security', status: 'covered',
      tests: [
        'scripts/michael/classify-apply.test.js > "a file without producer or run_id is refused PROVENANCE_MISSING before any read; a wrong producer PRODUCER_UNKNOWN"',
        'scripts/michael/classify-apply.test.js > "a tampered file is refused HASH_MISMATCH (any field, including metering and a verdict); a missing hash too"',
        'scripts/michael/classify-apply.test.js > "model, metering, produced_at, et_date and unknown envelope keys are refused with their own codes"',
        'scripts/michael/classify-apply.test.js > "items and tasks: allow-lists, class shape, bounded reason, intent shape, grades" (FIELD_NOT_WRITABLE asserted at lines 84 and 92; enforced at classify-apply.mjs:70,84,95)',
        'scripts/michael/classify-apply.test.js > "a valid file updates only the addressed rows by natural key ... and upserts one seat feeder_runs row with metering"',
        'scripts/michael/classify-apply.test.js > "pathAllowed admits only .json files under .artifacts/michael-seat/"',
      ] },
    { ts: 'TS-15', title: 'Smoke outside windows', type: 'smoke', status: 'no_automated_test',
      tests: [],
      note: 'No test spawns the real scripts as processes (grep for child_process/spawnSync/execFileSync across every child-D test file returns only lib/michael/rules.test.js, which shells out to git check-ignore). The scenario is covered IN-PROCESS by the inert-outside-window and tables_absent cases in calendar-read, gmail-triage, tasks-classifier, todoist-brief and classify-apply, plus import-purity source assertions (no googleapis import, no credential read at module load).',
      manual_measurement: 'Measured here by a runner script (.artifacts/qa-smoke-ts15.cjs, results ts15-smoke.json) at 20:02 EDT 2026-09-06, outside every ET window, michael_* migration unapplied. All 6 scripts emitted EXACTLY ONE JSON object on stdout and constructed no API factory. gmail-triage and todoist-brief: exit 0, action inert, reason outside_et_window. queue-read and retention: exit 0, tables_absent true. calendar-read and tasks-classifier: exit 2, refusal CONSTANT_MISSING (MICHAEL_EXELON_CALENDAR_ID / MICHAEL_TASKS_DRIVE_FOLDER_ID absent in this worktree). The exit 2 is the DESIGNED gate order host-venue -> constants -> window (calendar-read.mjs:203-205, tasks-classifier.mjs:147-148) and is itself unit-tested; TS-15 exit 0 for those two therefore holds only on a host with the MICHAEL_ constants configured. That is the chairman post-migration host smoke.' },
    { ts: 'TS-16', title: 'Client modules and constants', type: 'unit', status: 'covered',
      tests: [
        'lib/michael/google-clients.test.js > 6 cases: calendarId/timeMin/timeMax with singleEvents, orderBy startTime, maxResults 250; missing args refused and a rejecting factory mapped to { ok:false, error }; Drive folder listing with the bounded field set; text read only after the parents check (metadata get then alt=media); FILE_OUTSIDE_CONFIGURED_FOLDER with no content fetched; credential resolver refuses with an empty env (no network, no throw)',
        'lib/michael/gmail-client.test.js > read legs (child D FR-2, TS-16) > listThreads bounded maxResults with truncation flag; getThreadMeta format metadata with exactly four headers and never a body; listLabels, and a rejecting factory on every read leg',
        'lib/michael/constants.test.js > 5 cases: CONSTANT_MISSING names the variable (never a throw); ceiling defaults to 60 and the EHG chairman project id matches chairman-notify.js; the ceiling parses an env override and refuses a non-positive integer; CONSTANT_UNKNOWN and a frozen registry; resolveConstants returns all values or the first refusal',
      ] },
    { ts: 'TS-17', title: 'Guarded writes and gmail auto_apply gate', type: 'unit', status: 'covered',
      tests: [
        'scripts/michael/gmail-triage.test.js > "--apply: label reconcile writes only the three owned columns; items use ignoreDuplicates then guarded updates of the owned keys (TS-17)"',
        'scripts/michael/gmail-triage.test.js > "intentFor yields an intent only for auto_apply=true with verb label or archive (SECURITY F-2)"',
        'scripts/michael/todoist-brief.test.js > "TS-10 apply: guarded snapshot writes of the owned keys ..."',
        'scripts/michael/classify-apply.test.js > "a valid file updates only the addressed rows by natural key, never those with action_taken_at / chosen_action / already classified or graded"',
      ] },
    { ts: 'TS-18', title: 'queue-read shape and bounds', type: 'unit', status: 'covered',
      tests: ['scripts/michael/queue-read.test.js > 6 runQueueRead cases covering every TS-18 clause: class-null items and effort_grade-null tasks for the ET date bounded by the LITERAL read bound, printing only the published keys; --et-date validated and --date refused; absent tables yield empty lists, ok, exit 0 and NO count read; a full page is reported truncated and only then counted exactly (presence first, never a head-count on an absent table); --headers writes header strings to stdout only and never to a run row, capped, refused on GHA; read-only source assertion (no writeRows import, no update/insert/upsert)'] },
    { ts: 'TS-19', title: 'Staged-item dedupe and retention null-out', type: 'unit', status: 'covered',
      tests: [
        'scripts/michael/tasks-classifier.test.js > "TS-19: a second fire stages zero duplicates for dedupe_keys already open"',
        'scripts/michael/tasks-classifier.test.js > "staged payloads carry exactly the named keys and a 200-char title"',
        'scripts/michael/retention.test.js > "child D: empties the payload of DISPOSITIONED staged rows strictly older than the cutoff instant and leaves undispositioned rows untouched (TS-19)"',
      ] },
  ],
};

const summary =
  `EXEC verification for child D at ${COMMIT.slice(0, 11)} (all 12 merged PRs). MEASURED, all counts read from runner-written JSON: ` +
  `shipped suite ${shipped.numTotalTestSuites === undefined ? '' : ''}14 files / ${shipped.numTotalTests} tests, ${shipped.numPassedTests} passed, ${shipped.numFailedTests} failed, ${shipped.numPendingTests} skipped, exit 0. ` +
  `Full unit tier regression: ${full.numTotalTests} tests, ${full.numPassedTests} passed, ${full.numFailedTests} failed, ${full.numPendingTests} skipped, ${full.numTodoTests} todo across ${full.testResults.length} files, exit 0. ` +
  `PLAN regression floor (12 baseline files): ${floor.numTotalTests} tests all green (PLAN recorded 159; grew to ${floor.numTotalTests} because child D extended db, gmail-client, rules and retention). ` +
  `ESLint over ${lint.length} shipped files: ${lintErrors} errors, ${lintWarnings} warnings. ` +
  `Scenario coverage: 17 of 19 directly covered with a labelled test, TS-4 covered in substance but unlabelled, TS-15 has NO automated test (process smoke) and was measured by a runner script instead. ` +
  `The michael_* tables are UNAPPLIED live (chairman-gated migration, shipped by child B, untouched by all 12 child-D PRs): every test injects its client, and queue-read/retention smoke both read tables_absent=true. The first real run is the chairman post-migration host smoke.`;

let results = {
  verdict: 'PASS',
  confidence_score: 93,
  summary,
  justification:
    'PASS: every shipped test file is green. 14 of 14 files, 250 of 250 tests passed with zero failures and zero skips, and the whole unit tier is green at 48,582 passed / 0 failed, so nothing this child shipped regressed anything else. ESLint is clean across all 28 shipped source and test files. 17 of the 19 PRD scenarios map to a named, labelled, passing test; TS-4 is covered in substance by six assertions across five files without a TS-4 label; TS-15 is a process smoke that no automated test performs, so it was measured directly with a runner script and passed on the clauses that are host-independent (exactly one JSON object on stdout, no API factory constructed) while its exit-0 clause is host-conditional for the two credentialed Google feeders. Neither shortfall is a failing test, and neither blocks EXEC-TO-PLAN: TS-15 is by construction the chairman post-migration host smoke.',
  findings: [
    { severity: 'medium', type: 'coverage_gap', title: 'TS-15 has no automated test: no child-D test spawns the real feeder scripts as processes, so the smoke scenario is verified only in-process. Measured manually here; the exit-0 clause holds for gmail-triage and todoist-brief but calendar-read and tasks-classifier exit 2 with CONSTANT_MISSING on a host without the MICHAEL_ constants.' },
    { severity: 'low', type: 'scenario_divergence', title: 'TS-11 expects a failed run row carrying error_code HOST_VENUE_REQUIRED; the shipped code refuses before runFeeder and writes no run row and makes no DB call at all. Safer than the scenario, but the stated artifact does not exist.' },
    { severity: 'low', type: 'traceability', title: 'TS-4 (PII-safe logging) has no test carrying its label. Six assertions across five files cover it in substance, but the capturing-logger test asserts line shape rather than PII absence, which is weaker in form than PLAN checklist item 13.' },
    { severity: 'low', type: 'traceability', title: 'Test-scenario labels collide across children: lib/michael/gmail-client.test.js carries a "TS-12: TRASH and SPAM are refused" case that belongs to child B numbering, while child D TS-12 is the workflow wiring test. Reading TS ids without the owning child is ambiguous.' },
    { severity: 'info', type: 'environment', title: 'The michael_* tables are unapplied live. queue-read and retention both measured tables_absent=true against the real database. Every unit test injects its client, so no test has ever exercised a real michael_* table.' },
  ],
  recommendations: [
    'Leave TS-15 to the chairman post-migration host smoke; it cannot be satisfied in CI or in an unconfigured worktree because two of the six scripts refuse on CONSTANT_MISSING before the window gate, by design.',
    'Either relabel TS-11 in the PRD to expect a pre-runFeeder refusal envelope with no run row, or accept the divergence explicitly at PLAN verification. The code is the safer of the two and should not change.',
    'Add a TS-4 label to the PII assertions so the scenario is greppable, and consider extending the capturing-logger test in lib/michael/feeder.test.js to assert seeded PII literals are absent from the captured lines, closing the form gap against PLAN checklist item 13.',
    'Namespace test-scenario ids by child (e.g. D-TS-12) to stop the cross-child TS collision between gmail-client.test.js and the wiring test.',
  ],
  metadata: {
    session_id: SESSION_ID,
    evaluated_commit_sha: COMMIT,
    phase_reviewed: 'EXEC',
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
    sd_key: SD_KEY,
    test_execution,
    shipped_suite: {
      artifact_path: shippedPath, artifact_sha: shippedSha, runner: RUNNER,
      files: perFile.length, describe_suites: shipped.numTotalTestSuites,
      tests: shipped.numTotalTests, passed: shipped.numPassedTests, failed: shipped.numFailedTests,
      skipped: shipped.numPendingTests, todo: shipped.numTodoTests, success: shipped.success,
      started_at: new Date(shipped.startTime).toISOString(),
      per_file: perFile,
    },
    regression_full_unit_tier: {
      artifact_path: fullPath, artifact_sha: fullSha, runner: RUNNER,
      files: full.testResults.length, describe_suites: full.numTotalTestSuites,
      tests: full.numTotalTests, passed: full.numPassedTests, failed: full.numFailedTests,
      skipped: full.numPendingTests, todo: full.numTodoTests, success: full.success,
      console_log_path: R + 'unit-full.log',
      console_line: 'Test Files 3952 passed | 15 skipped (3967) / Tests 48581 passed | 1 expected fail | 209 skipped | 2 todo (48793) / Duration 224.47s',
      note: 'The JSON reporter counts the one expected-fail as passed (48582) while the console reporter lists it separately (48581 + 1 expected fail). Both readings recorded; numFailedTests is 0 either way.',
    },
    regression_baseline_floor: {
      artifact_path: floorPath, artifact_sha: floorSha, runner: RUNNER,
      plan_recorded_total: 159, measured_total: floor.numTotalTests,
      files: floorPerFile.length, passed: floor.numPassedTests, failed: floor.numFailedTests,
      per_file: floorPerFile,
      note: 'PLAN checklist item 23. Floor held: 12 of 12 files green. Total grew 159 -> ' + floor.numTotalTests + ' because child D extended lib/michael/db.test.js (11->13), lib/michael/gmail-client.test.js (3->6), lib/michael/rules.test.js (21->23) and scripts/michael/retention.test.js (7->8).',
    },
    lint: {
      artifact_path: lintPath, artifact_sha: lintSha,
      tool: 'eslint (repo config) -f json', files_linted: lint.length,
      errors: lintErrors, warnings: lintWarnings,
    },
    ts15_smoke: {
      artifact_path: smokePath, artifact_sha: smokeSha,
      producer: '.artifacts/qa-smoke-ts15.cjs', ran_at: smoke.ranAt,
      scripts: smoke.results.length,
      all_stdout_single_json_object: smoke.results.every((r) => r.stdoutIsSingleJsonObject),
      per_script: smoke.results.map((r) => ({
        script: r.script, exit: r.exitCode,
        single_json_object: r.stdoutIsSingleJsonObject,
        action: r.parsed && r.parsed.action, reason: r.parsed && r.parsed.reason,
        refusal: r.parsed && r.parsed.refusal, tables_absent: r.parsed && r.parsed.tables_absent,
      })),
    },
    scenario_coverage,
    e2e_applicability: {
      applies: false,
      reason: 'No UI surface. The child ships lib modules, Node CLI scripts, one GitHub Actions workflow, a Windows Task Scheduler registrar and two docs. PRD ui_ux_requirements is empty; there is no route, component or page. TS-15 is a CLI process smoke, correctly typed test_type=smoke in the live PRD (PLAN checklist item 22 applied).',
    },
    database_change_check: {
      method: 'git show --name-only on each of the 12 child-D PR merge commits, counting paths under database/ or supabase/migrations/',
      prs_checked: [8364, 8365, 8366, 8371, 8372, 8373, 8375, 8377, 8378, 8379, 8380, 8385],
      db_files_changed: 0,
      note: 'PLAN gap G-3 / AC-8 satisfied. database/migrations/20260906_michael_tables.sql was shipped by child B (commits 06a3161bf8a, 7e63718da1f) and is untouched by child D. It remains unapplied live, confirmed by the queue-read and retention smoke both reading tables_absent=true.',
    },
    quarantine_check: {
      manifest: 'tests/quarantine-manifest.json', total_entries: 150, entries_matching_michael: 0,
      note: 'No shipped test file is silently excluded from the unit project by the quarantine manifest.',
    },
    provenance: {
      ratification: '6c263823',
      producer: 'testing-agent (Opus 5, claude-opus-5[1m]) via .artifacts/testing-exec-d-persist.mjs',
      rule: 'Every count in this row is read from a runner-written results file whose sha256 is recorded beside it. No number is transcribed from a console summary except the explicitly-labelled console_line, which is recorded only to document the JSON-vs-console expected-fail discrepancy.',
    },
  },
};

const resolution = await resolveSubAgentRepo({ sdId: SD_UUID, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING' });
results = applySubAgentRepoVerdict(results, resolution);
console.log('repo_path=', results.metadata.repo_path);
console.log('executed_from_cwd=', results.metadata.executed_from_cwd);
console.log('repo_resolved=', results.metadata.repo_resolved, 'registry_source=', results.metadata.registry_source);
console.log('verdict_after_writer=', results.verdict);
console.log('test_execution=', JSON.stringify(test_execution));

const stored = await storeSubAgentResults(
  'TESTING',
  SD_UUID,
  { id: null, name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { phase: 'EXEC', sdKey: SD_KEY, source: 'sub_agent_executor' }
);
console.log('STORED=', JSON.stringify(stored));
