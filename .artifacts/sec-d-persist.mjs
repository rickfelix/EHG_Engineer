import 'dotenv/config';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_ID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const SESSION_ID = '85c82b18-0984-4948-bd86-1992cdf5170d';
const REPORT = 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad/security-plan-d-report.md';

const reportText = fs.readFileSync(REPORT, 'utf8');
const content_hash = createHash('sha256').update(reportText, 'utf8').digest('hex');
const evaluated_commit_sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const critical_issues = [
  {
    id: 'F-1',
    severity: 'HIGH',
    title: 'Gmail modify ceiling is per-run and degraded re-arms the next */15 fire: up to 300 archives per morning against a 60 ceiling',
    location: 'PRD FR-5 (ceiling stop), FR-1(d) (degraded allows retry), FR-8 (*/15 across 04:30-05:30 ET)',
    detail: 'FR-5 marks the ceiling stop degraded and leaves remaining intents "for the next run"; FR-1(d) says a degraded or failed row allows a retry. Five fires in the window times 60 equals 300 modifies from one wrong rule, against the control the spec calls the guard on "the one irreversible-in-practice harm in this lane" (spec section 5, Solomon Q1.3). The ceiling as written is a rate limiter that resumes in 15 minutes, not the circuit breaker the spec intends. Rollback is gmail-act --unarchive once per thread, and each upserts on (et_date, thread_id) so the operator must pass --date matching the original day or the revoke signal lands on the wrong row.',
    recommendation: 'Make the ceiling a per-ET-date budget summed over counts.threads_modified of every prior run of that feeder for that date (a bounded readRows the harness already performs for single-flight). Once ceiling_hit is true for the date, every later fire is inert with reason ceiling_hit until a human clears it. Amend FR-1(d) so degraded re-arms a retry EXCEPT when the degradation reason is the ceiling. Test: 300 seeded intents with ceiling 60 across five simulated fires yield exactly 60 modify calls for the date, not 300.',
  },
  {
    id: 'F-2',
    severity: 'HIGH',
    title: 'Any active gmail rule yields an action_intent; there is no auto_apply gate, asymmetric with the Todoist lane',
    location: 'PRD FR-4 and FR-5 versus FR-7',
    detail: 'FR-7 mutates only for active michael_rules with auto_apply true and auto_apply_verb in label/reschedule. FR-4 derives action_intent from any matching active gmail rule with no such gate, and FR-5 applies every intent under --apply. The migration models the distinction (auto_apply BOOLEAN NOT NULL DEFAULT false; auto_apply_verb CHECK IN label/archive/reschedule) and child B built an Opus-verified rule-encode path specifically to gate flipping auto_apply; the gmail lane bypasses all of it. The Dropbox gmail.md rules are imported as michael_rules domain gmail, so any that were descriptive rather than automatic become archive instructions the first morning --apply runs.',
    recommendation: 'Gate gmail action_intent on auto_apply === true AND auto_apply_verb in {label, archive}, mirroring FR-7 word for word. A matching rule with auto_apply false must still write class and rule_key so the brief can show it, with action_intent null. Add the test to FR-4 acceptance criteria.',
  },
  {
    id: 'F-3',
    severity: 'HIGH',
    title: 'FR-8 bakes --apply into the host wrapper, contradicting the PRD own stated shadow rollout',
    location: 'PRD FR-8 task table versus metadata.observability_rollout.rollout_strategy',
    detail: 'The PRD rollout_strategy reads: "Shadow phase: feeders write rows nightly; gmail-triage dry-run until the chairman confirms rules; then --apply with the ceiling." Nothing in any FR encodes that phase. FR-8 writes --apply into the committed task table, so buildWrapperScript emits a wrapper that calls node scripts/michael/gmail-triage.mjs --apply and the very first registered morning applies. The shadow phase exists only in prose no code reads.',
    recommendation: 'Register the gmail-triage host task WITHOUT --apply (dry-run is FR-4 default and PR 4a whole point). Promotion to --apply is a second explicit registrar run (--remove plus re-register) the chairman performs after confirming rules, or a gate behind a michael_rules row or a host env flag so the promotion is auditable. The registrar test must assert the shipped table contains no --apply for gmail-triage.',
  },
  {
    id: 'F-4',
    severity: 'HIGH',
    title: 'classify-apply has no column allow-list, so a seat model verdict becomes an unattended threads.modify 15 minutes later',
    location: 'PRD FR-9 (verdict file items[] carries action_intent)',
    detail: 'FR-9 only avoids rows whose action_taken_at or chosen_action is already set; that protects already-acted rows but does not restrict WHICH columns may be written on a fresh row. A Sonnet or Opus sub-agent at the seat can set action_intent archive at 04:35 and the 04:45 gmail-triage fire executes it against Gmail with no human in the loop. The provenance check proves the file was not altered after the runner wrote it; it proves nothing about whether the content is sane, because the hash is computed by the same party that authored the judgement. Nothing in FR-9 forbids writing action_taken_at either, so the recorder could stamp it on a row that was never modified, permanently suppressing the real apply.',
    recommendation: 'State an explicit column allow-list in FR-9 and test the update payload keys, not just the row selection. items: class, needs_you, needs_you_reason, borderline, verified_by and nothing else (never action_intent, action_taken_at, summary, reopened_at). tasks: effort_grade, est_minutes, proposed_date, role_tag (never chosen_action, mutations_applied, moved_back_at). If the seat must propose an archive it writes michael_staged_items, never action_intent. A verdict file carrying a non-writable field is refused FIELD_NOT_WRITABLE rather than silently ignored, so the refusal is visible.',
  },
];

const warnings = [
  {
    id: 'F-5',
    severity: 'MEDIUM',
    title: 'classify-apply provenance is materially weaker than sibling rule-encode; child B SEC-M2 (runner-only path prefix) recurs unlanded',
    location: 'PRD FR-9 versus scripts/michael/rule-encode.mjs:71-83,124-131',
    detail: 'Child B SECURITY row b4e557d4 (SEC-M2) found a verdict file is seat-writable and the hash binds the SUBJECT not the AUTHOR, recommending a runner-only prefix .artifacts/michael-verifier/. rule-encode shipped with that prefix only in a usage comment (line 26), unenforced at line 127, but it does pin producer opus-verifier, model matching claude-opus, subject_hash equality and produced_at within 24h, each with a distinct refusal code. FR-9 checks strictly less: producer and run_id merely non-absent, plus the hash. No model pin, no freshness bound, no path constraint, and no et_date in the envelope, so replaying a prior day verdict file writes stale classifications onto today rows by the stable thread_id, feeding F-4.',
    recommendation: 'Bring FR-9 to rule-encode parity or better: pin producer to a named constant, pin model against the spec section 3 posture (sonnet for classify, opus for re-judge), bound produced_at (the tick window is 3 hours), carry et_date in the envelope and refuse a mismatch with todayEt(now), and enforce the .artifacts/michael-* path prefix child B recommended and did not land. Document in the FR that this gate is detective (auditable forgery), not preventive.',
  },
  {
    id: 'F-6',
    severity: 'MEDIUM',
    title: 'content_hash covers only items plus tasks; producer, run_id and the metering fields sit outside it',
    location: 'PRD FR-9; metadata.data_contracts "Seat verdict file for classify-apply"',
    detail: 'producer, run_id, model_used, tokens_in and tokens_out are not in the hash subject, so they can be edited without invalidating it. Those metering fields are what child G account-capacity gauge and the Max-plan quota protection read (spec section 3). Under ratification 6c263823 (no completion gate may accept evidence authored by the party it gates), the quota gauge is gated on self-reported, unauthenticated numbers from the seat being metered.',
    recommendation: 'Hash over canonicalJson({ producer, run_id, et_date, model_used, tokens_in, tokens_out, items, tasks }) - the whole envelope minus content_hash itself. One-line change to FR-9 and to the data_contracts entry. State plainly in the FR that metering remains self-reported and the hash makes tampering evident, not impossible.',
  },
  {
    id: 'F-7',
    severity: 'MEDIUM',
    title: 'michael_staged_items is exempt from retention and FR-6 stages raw task prose into it with no payload shape - a direct recurrence of child B SEC-M3',
    location: 'PRD FR-6 (kind task_route); scripts/michael/retention.mjs:31 NEVER_TOUCHED',
    detail: 'retention.mjs lists michael_staged_items in NEVER_TOUCHED alongside michael_todoist_snapshot. FR-6 stages every item no keyword rule routed to michael_staged_items kind task_route for the seat grading, and grading requires the task TEXT, which is chairman personal prose from phone captures. The PRD does not name the payload keys. So unrouted personal task text persists indefinitely in a table every service-role holder can read, with no 30-day null-out. todoist-act.mjs:22-33 fixed exactly this class for the sibling table by storing content_sha256 plus content_len, with the comment naming the reason. A sha256 is not available here because the seat needs the text, so the fix is retention, not redaction. The PRD is therefore NOT consistent between the two lanes, and the inconsistency is on the unbounded side.',
    recommendation: 'Name the task_route payload keys explicitly in FR-6 (task text, source file id, staged reason - nothing else, no Drive file body, no email address), and add michael_staged_items to retention.mjs null list for DISPOSITIONED rows older than 30 days (payload to empty jsonb, keeping kind, disposition and timestamps for the ledger). That is a code change to a child B file, not DDL, so it is in scope for -D. If the chairman prefers indefinite retention, record it as a deliberate exception in TR-4 with the reason.',
  },
  {
    id: 'F-8',
    severity: 'MEDIUM',
    title: 'queue-read emits no From/Subject so the seat classifier has nothing to classify on, and the obvious fix moves PII',
    location: 'PRD FR-9 (queue-read --json fields) and FR-4 (item row columns)',
    detail: 'FR-4 writes unmatched threads with class null, rule_key and last_message_id; the item row stores no subject and no sender, correctly, because the migration has no such columns. queue-read therefore prints thread_id, rule_key, last_message_id and borderline. A Sonnet sub-agent cannot classify an email from a thread id. Either the feature does not work, or EXEC reaches for the natural fix (re-fetch getThreadMeta at the seat, or add From/Subject to queue-read --json) and that fix changes the PII surface: headers land on a CLI stdout, inside a Claude Code transcript, and potentially in a captured log file. TS-4 counts-only corpus would not cover it, because queue-read stdout is a result, not a log line.',
    recommendation: 'Decide it in the PRD rather than at EXEC. Recommended: queue-read --json re-fetches metadata through getThreadMeta at call time and emits From/Subject ONLY to stdout, never to a run row, never to log_md, never to michael_staged_items. Mark it in TR-4 as the single sanctioned PII egress with that boundary stated, and extend TS-4 with a second corpus asserting queue-read headers never reach a michael_feeder_runs row.',
  },
  {
    id: 'F-9',
    severity: 'MEDIUM',
    title: 'Single-flight staleness (10 min) is shorter than the fire interval (15 min): overlapping runs double-apply and evade the ceiling',
    location: 'PRD FR-1(d) and FR-5',
    detail: 'The in-flight predicate treats a run as dead once started_at is older than 10 minutes, but fires arrive every 15 minutes. A gmail-triage run doing up to 200 getThreadMeta calls plus 60 sequential threads.modify calls can plausibly exceed 10 minutes. At minute 15 the successor sees started_at 15 minutes old, judges it dead, and proceeds concurrently. Both read intents where action_taken_at IS NULL - and action_taken_at is written after the modify, by design - so both modify the same threads. Re-archiving is idempotent at Gmail so the confidentiality harm is nil, but counts.threads_modified doubles and the ceiling is evaded, compounding F-1.',
    recommendation: 'Derive the staleness threshold from the feeder own interval (at least intervalMinutes plus a margin; 20 minutes for a */15 feeder) rather than a flat 10, and state it in FR-1(d) as a constant per feeder. Test: a run with started_at 12 minutes ago on a */15 feeder is still in_flight.',
  },
  {
    id: 'F-10',
    severity: 'MEDIUM',
    title: 'readDriveFileText takes an arbitrary fileId under a whole-Drive read scope',
    location: 'PRD FR-2; lib/integrations/google/chairman-oauth.js:26',
    detail: 'drive.readonly grants read access to the chairman entire Drive - there is no folder-scoped read scope (only drive.file, which is per-file and app-created). FR-2 readDriveFileText({ fileId }) accepts any file id with no parent check. listDriveFiles is folder-scoped by parameter so the normal path is fine, but a mis-set MICHAEL_TASKS_DRIVE_FOLDER_ID, a rule that carries a file id, or a future caller can pull an arbitrary Drive document into michael_staged_items, which F-7 shows is never aged out.',
    recommendation: 'FR-2 should require readDriveFileText to verify the file parents include the configured MICHAEL_TASKS_DRIVE_FOLDER_ID before returning content, returning FILE_OUTSIDE_CONFIGURED_FOLDER otherwise. One extra field in the files.get metadata call. Add it to FR-2 acceptance criteria.',
  },
  {
    id: 'F-11',
    severity: 'MEDIUM',
    title: 'assertHostVenue fires only inside the credential path; an injected auth bypasses it',
    location: 'PRD TR-3 and FR-3/FR-4/FR-6; lib/integrations/google/chairman-oauth.js:117-118,164-168; lib/michael/gmail-client.mjs:31',
    detail: 'The venue guard lives in getStoredTokens, which getAuthenticatedClient calls. But every client in FR-2 takes an injected auth or resolves one, and modifyThread already short-circuits on auth-or-resolve. Whenever auth is supplied, no venue check happens anywhere. The unit tier runs under GITHUB_ACTIONS true (the guard own comment says so) precisely because every test injects auth, so the guard is never exercised by the injection path, and TS-11 only proves the non-injected path refuses. TR-3 claim that assertHostVenue fires inside it is true but incomplete: it is a property of the credential resolver, not of the feeder.',
    recommendation: 'Each host feeder (calendar-read, gmail-triage, tasks-classifier) calls assertHostVenue(env) at the top of its own runX, before any client resolution and regardless of injection, mapping the coded throw to failed / HOST_VENUE_REQUIRED via FR-1(h). env is already injectable, so the unit tier passes a clean env and TS-11 passes a GITHUB_ACTIONS true env. This makes the refusal a property of the feeder, which is what TR-3 claims.',
  },
  {
    id: 'F-12',
    severity: 'MEDIUM',
    title: 'The seat metering upsert names a key the unique index does not have',
    location: 'PRD FR-9; database/migrations/20260906_michael_tables.sql:169',
    detail: 'The unique index is michael_feeder_runs_date_feeder_attempt_uniq ON (et_date, feeder, attempt). An upsert with onConflict et_date,feeder has no matching unique constraint and Postgres raises 42P10; writeRows converts that to a WRITE_FAILED refusal, so the run silently records no metering. The seat tick also fires every 15 minutes across 04:30-07:30 (up to 13 ticks), each of which would need its own attempt.',
    recommendation: 'FR-9 specifies onConflict et_date,feeder,attempt with the same attempt max+1 plus 23505 retry the harness already provides (FR-1(e)) - that is, the seat recorder goes through runFeeder too, venue seat, rather than hand-rolling an upsert. State it explicitly so EXEC does not guess.',
  },
  {
    id: 'F-13',
    severity: 'LOW',
    title: 'FR-1(b) specifies a half-open window; the shipped helper FR-1(a) tells EXEC to reuse is closed at both ends',
    location: 'PRD FR-1(a)(b); scripts/michael-quiet-tick.mjs:41-46',
    detail: 'FR-1(b) says inert outside [window.start, window.end). The shipped inWindow is inclusive at both ends (minuteOfDay less-than-or-equal e), and FR-1(a) tells EXEC to move that exact function into the harness with no third copy. Both cannot hold. If EXEC changes the helper to half-open, that is a silent behaviour change to a shipped component whose 62 tests may not pin 07:30; if it keeps it closed, gmail-triage gets a sixth fire at exactly 05:30, multiplying F-1.',
    recommendation: 'FR-1 states which semantics win and, if half-open, requires an added quiet-tick test pinning the 07:30 boundary before the helper moves.',
  },
  {
    id: 'F-14',
    severity: 'LOW',
    title: 'No ceiling and no record-then-act ordering on the Todoist mutation lane, under cancel-in-progress true',
    location: 'PRD FR-7',
    detail: 'The Gmail lane got a ceiling; the Todoist lane got none. The natural bound is the (et_date, task_id, action) dedupe inside mutations_applied, capping at one mutation per task per action per day, but not the number of tasks. Separately, concurrency cancel-in-progress true (mandated by spec section 5) can kill the job between the Todoist API call and the snapshot write, leaving a mutation applied but unrecorded; the next fire dedupe cannot see it and re-applies. Harmless for a label add and for an absolute reschedule, compounding for a relative one.',
    recommendation: 'FR-7 states that auto_apply_verb reschedule targets an absolute date only, never a relative offset, so a re-apply after a cancelled run is idempotent; and adds MICHAEL_TODOIST_MUTATION_CEILING to constants.mjs mirroring the Gmail ceiling, marking the run degraded above it. Reversibility is high (moved_back_at), so this is prudence, not urgency.',
  },
  {
    id: 'F-15',
    severity: 'LOW',
    title: 'buildWrapperScript will write any env map into the .cmd as plaintext set lines, and one sibling wrapper is tracked despite the ignore rule',
    location: 'PRD FR-8; scripts/setup-alarm-cron-tasks.mjs:90-98; .gitignore:498; scripts/cron/account-usage-sample-task.cmd',
    detail: 'The -D task table carries no env, so the three wrappers contain no secret - verified by reading the builder. But the builder emits a set K=V line for every entry, and one sibling wrapper is already TRACKED despite the ignore rule (scripts/cron/account-usage-sample-task.cmd, committed with the absolute host path; ignore rules do not apply to tracked files). A future task-table entry with a token would be written to disk in plaintext and, if force-added, committed.',
    recommendation: 'tests/unit/fleet/setup-michael-host-tasks.test.js asserts each generated wrapper contains no set line and matches the scripts/cron/*-task.cmd ignore pattern. Two assertions; closes the class rather than the instance.',
  },
  {
    id: 'F-16',
    severity: 'LOW',
    title: 'The /RU plus /NP S4U venue is never proven to launch node',
    location: 'PRD FR-8 and TR-8; scripts/cron/run-hidden.vbs:12',
    detail: 'run-hidden.vbs launches fire-and-forget (Run with wait false), so LastTaskResult is 0 whether or not node ever started. Under an S4U (/NP) logon the process runs in session 0 with a profile that may not carry the interactive PATH. If node is not resolvable there, all three feeders silently never run and the only signal is an absent run row - indistinguishable from the sleeping-laptop case the PRD already rates HIGH probability. FR-8 --verify checks the OS-returned XML shape only, and the evidence required by VALIDATION condition 6 is a /Create result, not a /Run result.',
    recommendation: '--verify additionally performs schtasks /Run /TN on one registered task and confirms the venue actually executed node (the feeder is inert outside its window and with tables absent, so this is a safe zero-side-effect probe that still writes a log line). Record that transcript line in the PR body next to the /Create measurement.',
  },
  {
    id: 'F-17',
    severity: 'LOW',
    title: 'Chairman identifiers are already in committed docs; env-not-code is hygiene, not a secret boundary (informational, no action)',
    location: 'PRD FR-2; docs/michael/02-SPEC.md:111,115,117; CLAUDE_MICHAEL.md:62; docs/protocol/michael/role-contract.md:59',
    detail: 'FR-2 rule that no chairman identifier is hard-coded in a feeder is good practice, but the Drive folder id, the Exelon calendar prefix, the EHG project id and the daily check-in task id are already committed in four markdown files, and MICHAEL_EHG_CHAIRMAN_PROJECT_ID keeps a hard-coded default anyway. These are identifiers, not credentials, and are useless without the grant. The real secrets (MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID/SECRET, TODOIST_API_TOKEN) are correctly env-only and absent from every workflow (measured: zero matches).',
    recommendation: 'No action. Recorded so a later reviewer does not mistake the doc occurrences for a leak.',
  },
];

const recommendations = [
  'CONDITION FOR EXEC: resolve F-1, F-2, F-3 and F-4 in the PRD text before EXEC opens.',
  'CONDITION FOR EXEC: resolve F-5, F-7, F-11 and F-12 either in the PRD or as named EXEC acceptance criteria.',
  'At EXEC the SECURITY re-review should measure rather than re-read: the ceiling test at 300 seeded intents across five fires; an auto_apply=false rule yielding action_intent null; the shipped registrar table containing no --apply for gmail-triage; and classify-apply refusing a verdict file that carries action_intent.',
];

const summary = 'CONDITIONAL_PASS. PLAN-phase design review of PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D against docs/michael/02-SPEC.md sections 3 and 5, the child B migration, chairman-oauth.js, gmail-client.mjs, db.mjs, todoist-act.mjs, the two Task Scheduler registrars, michael-retention-cron.yml and its wiring test. 4 HIGH, 8 MEDIUM, 5 LOW. Correct and not re-litigated: the TRASH/SPAM refusal is real and scans both label lists; record-then-act ordering is right; Gmail reads are format=metadata with four headers and no bodies; drive.readonly only, and the PRD correctly overrides spec section 5 by STAGING the cleanup list instead of writing to Drive; measured zero MICHAEL_ENCRYPTION_KEY / GOOGLE_CLIENT_* / REFRESH_TOKEN matches across .github/workflows, and TODOIST_API_TOKEN pre-exists in three workflows so no new secret is introduced; no DDL; child B RLS posture correct; wrapper .cmd files carry no secret and match the *-task.cmd ignore pattern. Two open paths to bulk mis-archive: the per-run ceiling that degraded re-arms every 15 minutes (up to 300 archives per morning against a 60 ceiling), and the missing auto_apply gate on the gmail lane that turns any imported descriptive rule into an archive instruction. FR-8 also bakes --apply into the host wrapper, removing the shadow phase that would have caught either. The seat recorder has no column allow-list, so a model verdict can write action_intent into the modify lane, and its provenance is weaker than the sibling rule-encode (no producer or model pin, no freshness bound, no et_date, no runner-only path prefix - child B SEC-M2 recurring). Personal task prose staged to michael_staged_items escapes retention exactly as child B SEC-M3 described for the sibling table.';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary,
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis: reportText,
  metadata: {
    session_id: SESSION_ID,
    content_hash,
    evaluated_commit_sha,
    sd_key: SD_KEY,
    phase: 'PLAN',
    review_type: 'plan_phase_design_review_no_code_yet',
    report_path: REPORT,
    artifacts_reviewed: [
      'product_requirements_v2 PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
      'docs/michael/02-SPEC.md sections 2,3,4,5',
      'database/migrations/20260906_michael_tables.sql',
      'lib/integrations/google/chairman-oauth.js',
      'lib/michael/gmail-client.mjs',
      'lib/michael/db.mjs',
      'scripts/michael/todoist-act.mjs',
      'scripts/michael/gmail-act.mjs',
      'scripts/michael/rule-encode.mjs',
      'scripts/michael/retention.mjs',
      'scripts/michael-quiet-tick.mjs',
      'scripts/setup-alarm-cron-tasks.mjs',
      'scripts/setup-eva-watcher-task.mjs',
      'scripts/cron/run-hidden.vbs',
      '.github/workflows/michael-retention-cron.yml',
      'tests/unit/cron/michael-retention-wiring.test.js',
      'sub_agent_execution_results b4e557d4 (child B SECURITY SEC-M2 and SEC-M3)',
    ],
    measurements: {
      google_or_encryption_tokens_in_workflows: 0,
      workflows_already_carrying_todoist_api_token: 3,
      dotenv_gitignored: true,
      tracked_task_cmd_wrappers: 1,
      michael_tables_with_rls_and_service_role_only_policy: 11,
      max_gmail_modifies_per_morning_as_specified: 300,
      specified_ceiling: 60,
    },
    findings_count: { HIGH: 4, MEDIUM: 8, LOW: 5 },
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);
console.log('resolution:', JSON.stringify(resolution));
console.log('metadata.repo_path:', results.metadata.repo_path);
console.log('metadata.executed_from_cwd:', results.metadata.executed_from_cwd);
console.log('verdict after verdict-adjust:', results.verdict);
console.log('content_hash:', content_hash);
console.log('evaluated_commit_sha:', evaluated_commit_sha);

const stored = await storeSubAgentResults(
  'SECURITY',
  SD_ID,
  { code: 'SECURITY', name: 'Chief Security Architect' },
  results,
  { sdKey: SD_KEY, phase: 'PLAN', source: 'sub_agent_executor' },
);
console.log('STORED:', JSON.stringify(stored));
