import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  phase: 'LEAD',
  summary: 'LEAD scope-lock validation for Michael child D (v1 feeders). Scope is real and non-duplicative. Retention leg CONFIRMED superseded by child B (retention.mjs + michael-retention-cron.yml byte-identical on origin/main). brief-assemble COLLIDES with child E, whose SD description and spec section 6 both claim the data_json contract and deterministic assembly; spec section 5 line 121 routes brief-assemble to section 6. No migration needed: every column D requires exists in the child B migration, but ZERO michael_* tables are live in the database (chairman-gated). Six dispatch premises refuted by measurement, one unverified. Full report at scratchpad/validation-lead-d-report.md.',
  findings: [
    'F1 CONFIRMED (a): retention SUPERSEDED. scripts/michael/retention.mjs (blob 7e9c46dd) and .github/workflows/michael-retention-cron.yml (blob d7519e99) are on origin/main from commit 9e722e6988c (child B PR 6/6); git diff origin/main --stat is empty. Workflow shape: concurrency plus cancel-in-progress lines 28-30 CONFIRMED, timeout-minutes 10 CONFIRMED, npm ci --ignore-scripts CONFIRMED, exactly SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY CONFIRMED (pinned by tests/unit/cron/michael-retention-wiring.test.js). Both-DST-offset shape ABSENT (single weekly cron 0 4 star star 0) but NOT a delta: spec section 2 specifies retention as GHA weekly, so there is no ET window to straddle. D ships nothing for retention; the D SD description must strike it.',
    'F2 REFUTED (b): assigning brief-assemble.mjs to D is unsound. Spec 02-SPEC.md:121 is a pure pointer (brief-assemble plus brief-render ... : section 6) and section 6 is child E source of record. Child E SD description claims verbatim the michael_brief_runs.data_json contract in the two-zone schema 2 shape ... deterministic assembly with a template lede. data_json schema does NOT need fixing in D: 02-SPEC.md:125 specifies schema 2 completely and migration line 268 has data_json JSONB NULL. Recommended: E owns brief-assemble.mjs and michael-brief-assemble-cron.yml; D owns only the section 5 ordering / degraded-at-05:45 predicate inside the shared feeder harness. Shipping the workflow in D without the script would exit ERR_MODULE_NOT_FOUND, breaking the house exit-0-on-inert invariant.',
    'F3 (c) columns CONFIRMED, metering premise REFUTED, host already half-built. michael_gmail_triage_items has class nullable (migration:211, the queue signal), verified_by (:218), borderline (:216), needs_you (:214), needs_you_reason (:215), summary (:219). michael_feeder_runs has model_used, tokens_in and tokens_out (:162-164). REFUTED: the item rows have NO model_used or tokens columns, and per spec section 3 metering belongs in michael_feeder_runs via the tick summary, so no new column and no child B follow-up. scripts/michael-quiet-tick.mjs is the right host and ALREADY reads the class=null queue (:106-108, gated on CLASSIFY_AFTER_ET 04:30) and ALREADY emits the contract line naming scripts/michael/classify-apply.mjs (:150). That script does not exist, nor does scripts/michael/brief-finalize.mjs named at :152, so the shipped tick instructs the seat to run two nonexistent scripts. D ships classify-apply.mjs; brief-finalize.mjs belongs to E. No new tick verb is needed.',
    'F4 (d) precedent CONFIRMED, spec shape REFUTED, elevation UNVERIFIED. scripts/setup-alarm-cron-tasks.mjs buildCreateArgs:131 emits /Create /TN /TR /SC MINUTE /MO /ST /F; buildHiddenTrAction emits wscript.exe //B with QUOTED vbs and cmd paths (CWE-428 correction documented in the header); buildWrapperScript GENERATES the .cmd at register time; /Query /TN /XML is used for read-back (:141); scripts/cron/run-hidden.vbs EXISTS (792 bytes). REFUTED: scripts/cron/stale-session-sweep-task.cmd DOES NOT EXIST. The only committed .cmd in the repo is scripts/cron/account-usage-sample-task.cmd. The PRD must cite setup-alarm-cron-tasks.mjs, not the spec-named missing file. UNVERIFIED: the unelevated /SC MINUTE claim. The file header line 56 records the chairman ELEVATED run (2026-09-06) as its only evidence. Verify from PowerShell before committing D1.',
    'F5 (e) credentials CONFIRMED, constants location PARTIALLY REFUTED. getAuthenticatedClient with sb, enc, env, client and now at lib/integrations/google/chairman-oauth.js:164 CONFIRMED. modifyThread at lib/michael/gmail-client.mjs:26 CONFIRMED with a FORBIDDEN_LABELS TRASH/SPAM guard. SCOPES include drive.readonly at chairman-oauth.js:26 CONFIRMED. Calendar events.list and Drive files clients CONFIRMED ABSENT (lib/michael/ holds only db.mjs, gmail-client.mjs and rules.mjs), so D builds both on getAuthenticatedClient. Chairman constants (Drive folder 1eahgoG3GBg4I6LII2oPEVAlDQ0n_8RvD, Exelon calendar 0c8c3f89, MICHAEL_GMAIL_MODIFY_CEILING) CONFIRMED absent from all code and .env.example; they appear only in docs/michael/02-SPEC.md:117, :111 and :113. PARTIAL REFUTATION of belongs-in-env-not-code: the house precedent is an EXPORTED MODULE CONSTANT with an env override, per lib/daily-review/drive-doc-client.js:18 CHAIRMAN_FOLDER_ID and lib/integrations/todoist/chairman-notify.js:25 DEFAULT_PROJECT_ID. Recommend lib/michael/constants.mjs using process.env.X with a default.',
    'F6 (f) Todoist CONFIRMED with one reuse trap. createTodoistClient at lib/integrations/todoist/todoist-sync.js:36 returns TodoistApi from the doist todoist-api-typescript package (import at :11); scripts/michael/todoist-act.mjs:42-43 already lazy-imports it. Reusable methods exercised in-tree: api.getProjects() (:58, unwrap results or bare array), api.getTasks with projectId (:71, same unwrap), api.updateTask(id, dueDate) (todoist-act.mjs:57), api.addTask with content, projectId and dueDate (:64), and the field mapping in mapTaskToIntakeRow (:82-97) for michael_todoist_snapshot. The raw v1 Sync API with a read-back verify is at chairman-notify.js:23-24 and :103-107 if reminders are needed (v1 only, never v9). TRAP: do NOT reuse findTargetProjects or getTargetProjects (:24, :57) because they filter to an env allowlist, whereas todoist-brief needs today-or-overdue across all projects MINUS three exclusions (EVA 6Wrq3gHw2j3gC2Gw, For Processing 6gfJpjh9Ghvv8fFq, EHG chairman 6grHWpvVM8QXrj5W read-only). TODOIST_API_TOKEN CONFIRMED as an existing GHA secret in 3 workflows: chairman-email-canary-cron.yml, eva-idea-sync-cron.yml and youtube-subscription-digest.yml, matching spec section 4 exactly. No new secret.',
    'F7 CONFIRMED (g): dedupe and ordering. Unique index michael_feeder_runs_date_feeder_attempt_uniq on (et_date, feeder, attempt) at migration:169, the same uniqueness set as the spec (feeder, et_date, attempt), with et_date first deliberately per the comment at :168. CHECK venue in task_scheduler, gha, seat at :156. CHECK status in ok, degraded, failed, skipped, imported at :157. counts JSONB with a jsonb_typeof object CHECK at :158 hosts threads_modified and the day classification. Upstream-status ordering is a plain read; the attempt-increment read is demonstrated at scripts/michael/retention.mjs:84.',
    'F8 (h) no DDL needed, but the migration is NOT APPLIED. Full column audit: every field the four feeders, the recorder and the setup script need already exists in database/migrations/20260906_michael_tables.sql. NO new DDL in D and NO child B follow-up. HOWEVER, measured against the live database, ZERO michael_* tables exist (a pg_tables query for schemaname public and tablename like michael returns 0 rows). The migration is chairman-gated (line 24 records the chairman-gated marker and no approved-by until the chairman signs). Consequence for planning: every D feeder ships inert by construction and no acceptance test can touch a real table. Acceptance must be unit tests with an injected supabase double plus the missing-relation path (lib/michael/db.mjs:18 and :23, TABLES_ABSENT and isMissingRelation), the same posture child B shipped.',
    'F9 REFUTED: the backlog gate. sd_backlog_map for D has 0 rows. The asserted DB constraint require_backlog_for_active DOES NOT EXIST. All 25 CHECK constraints on public.strategic_directives_v2 were enumerated and none references sd_backlog_map. Corroborated: every sibling has backlog=0 and A, B and C all reached status completed, while the parent is active at backlog=0. In this orchestrator family the PRD carries requirements, not sd_backlog_map. Backlog=0 is NOT a Gate 1 blocker for D.',
    'F10 spec-vs-code feeder shape divergence. Spec section 5 and scripts/cron/chairman-morning-brief-sweep.mjs:77 use an exported async main(argv, deps). Child B michael feeders instead export runRetention with sb, argv and now, and keep a PRIVATE main() (scripts/michael/retention.mjs:56 and :104), a separate pure renderer (:96) and NO ET window gate. The PRD must pin one explicitly. Recommend the michael-family shape (closer precedent, 62 passing tests, composes with lib/michael/db.mjs) with the window gate in the shared harness. The window primitives already exist and are exported: hhmmToMinutes and inWindow at scripts/michael-quiet-tick.mjs:35 and :42 over etLocalHour, etLocalMinute and etDateStr from lib/time/chairman-et-wall-clock.js:33-35. Move them into lib/michael/feeder.mjs and re-import in the tick rather than duplicating.',
    'F11 duplicate check CLEAN. All eight spec-named feeders are MISSING: calendar-read.mjs, gmail-triage.mjs, tasks-classifier.mjs, todoist-brief.mjs, brief-assemble.mjs, brief-render.mjs, brief-finalize.mjs and classify-apply.mjs. Also missing: scripts/setup-michael-host-tasks.mjs and lib/michael/render-brief.js. RELAY TO CHILD E: scripts/render-brief-artifact.py and templates/morning-brief-rebuild-template.html, which spec section 6 says to PORT, do not exist in this repo. server/routes/michael.js DOES exist (child C) but exposes only GET /oauth/status via createMichaelRouter at :38-40; the brief routes are genuinely unbuilt and belong to E.',
    'F12 multi-PR plan validated with a correction. The proposed four stages exceed the 400 LOC ceiling in at least two places. Recommended 8 PRs, all under 400 LOC, no migration: (1) lib/michael/feeder.mjs shared harness about 250; (2) lib/michael/google-clients.mjs plus constants.mjs about 200; (3) calendar-read.mjs about 300; (4a) gmail-triage read-only half with label reconcile and rules-first match about 300; (4b) gmail-triage write half with record-then-act, the modify ceiling and borderline resurface about 300; (5) tasks-classifier.mjs about 350; (6) todoist-brief.mjs plus its workflow about 350; (7) setup-michael-host-tasks.mjs about 250; (8) classify-apply.mjs recorder plus the queue reader about 200. Splitting gmail-triage at the read/write boundary lets the read half merge while the modify ceiling is still under review, the right risk order for the lane the spec calls the one irreversible-in-practice harm. The both-DST-offset template for PR 6 is .github/workflows/chairman-morning-brief-cron.yml.',
    'F13 holds cleared. metadata.review_hold_reason (HELD FOR CHAIRMAN GO, set by adam d1140357 at 2026-09-05T17:21:07Z) was cleared 2026-09-06T14:05:15.968Z by coordinator:6acf5a48; not_before was cleared at the same instant; needs_coordinator_review is false. D is unblocked.',
  ],
  warnings: [
    { severity: 'HIGH', issue: 'Child D and child E both claim brief assembly: the D SD description says michael-brief-assemble plus render, while the E SD description claims the data_json contract and deterministic assembly, and spec 02-SPEC.md:121 routes brief-assemble to section 6, which is E source of record.', recommendation: 'Move brief-assemble.mjs and michael-brief-assemble-cron.yml to child E; keep only the section 5 ordering / degraded-at-05:45 predicate in D inside the shared feeder harness. Never ship the workflow without the script because it would exit non-zero, breaking exit-0-on-inert.' },
    { severity: 'HIGH', issue: 'The D SD description still lists michael-retention as D2 work, but retention shipped in child B and is byte-identical on origin/main.', recommendation: 'Amend the D SD description to strike the retention leg before PLAN authors the PRD.' },
    { severity: 'MEDIUM', issue: 'Zero michael_* tables exist in the live database; the child B migration is chairman-gated and unapplied.', recommendation: 'PRD acceptance must be unit tests with an injected supabase double plus the TABLES_ABSENT / exit-0 inert path (lib/michael/db.mjs:18 and :23). No test may require a live michael table.' },
    { severity: 'MEDIUM', issue: 'The dispatch premise that unelevated schtasks /SC MINUTE works is unverified; setup-alarm-cron-tasks.mjs line 56 records an ELEVATED chairman run as its only evidence.', recommendation: 'Verify schtasks /Create /SC MINUTE unelevated from PowerShell on this host, never Git Bash, before committing the D1 setup script.' },
    { severity: 'MEDIUM', issue: 'Spec section 5 names scripts/cron/stale-session-sweep-task.cmd as the host-task shape, but that file does not exist; the only committed .cmd is account-usage-sample-task.cmd and all other wrappers are generated at register time.', recommendation: 'The PRD must cite scripts/setup-alarm-cron-tasks.mjs buildWrapperScript, buildHiddenTrAction and buildCreateArgs as the shape of record.' },
    { severity: 'MEDIUM', issue: 'Two competing feeder shapes exist in tree: spec section 5 main(argv, deps) versus child B runX with sb, argv and now plus a private main and no window gate.', recommendation: 'The PRD must pin one shape explicitly. Recommend the michael-family shape with the ET window gate moved into lib/michael/feeder.mjs, reusing the exported hhmmToMinutes and inWindow from michael-quiet-tick.mjs:35 and :42.' },
    { severity: 'LOW', issue: 'The shipped scripts/michael-quiet-tick.mjs emits contract lines naming scripts/michael/classify-apply.mjs (:150) and scripts/michael/brief-finalize.mjs (:152); neither script exists.', recommendation: 'D ships classify-apply.mjs; relay brief-finalize.mjs to child E, which already claims it.' },
    { severity: 'LOW', issue: 'scripts/render-brief-artifact.py and templates/morning-brief-rebuild-template.html, which spec section 6 tells child E to port, do not exist in this repo.', recommendation: 'Relay to child E at LEAD so it is not discovered mid-EXEC.' },
  ],
  recommendations: [
    'Condition 1: amend the D SD description to strike the retention leg, which shipped in child B.',
    'Condition 2: resolve the assemble collision with child E by moving brief-assemble.mjs and its workflow to E, or amend E in the same action; do not leave both rows claiming assembly.',
    'Condition 3: the PRD must pin the feeder shape, recommended as runX with sb, argv and now plus a private main, with the window gate in the shared harness.',
    'Condition 4: PRD acceptance must assume michael tables are absent, using an injected supabase double plus the TABLES_ABSENT / exit-0 inert path.',
    'Condition 5: split gmail-triage into two PRs at the read/write boundary to stay under 400 LOC and to merge the read half ahead of the modify ceiling.',
    'Condition 6: verify unelevated schtasks /SC MINUTE from PowerShell before committing the D1 setup script.',
    'Relay to child E: render-brief-artifact.py and morning-brief-rebuild-template.html do not exist in this repo.',
  ],
  metadata: {
    phase: 'LEAD',
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    sd_key: SD_KEY,
    scope_of_record: 'docs/michael/02-SPEC.md v0.3 sections 3, 5 and 6; strategic_directives_v2 description',
    report_path: 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad/validation-lead-d-report.md',
    duplicate_check: 'CLEAN for the 8 spec-named feeders; retention leg SUPERSEDED by child B; brief-assemble COLLIDES with child E',
    backlog_items: 0,
    backlog_constraint_exists: false,
    prd_count: 0,
    migration_required: false,
    michael_tables_live_in_db: 0,
    qa_smoke: 'npx vitest run --project unit scripts/michael/ produced 5 files and 62 tests passed in 808 ms',
    premises_confirmed: 17,
    premises_refuted: 6,
    premises_unverified: 1,
    conditions_for_pass: 6,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
});
console.log('resolution:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'VALIDATION',
  SD_ID,
  { code: 'VALIDATION', name: 'Principal Systems Analyst', metadata: { version: '3.0.0' } },
  results,
  { phase: 'LEAD', sdKey: SD_KEY }
);

console.log('STORED ROW ID:', stored?.id || JSON.stringify(stored));
console.log('VERDICT:', stored?.verdict);
console.log('PHASE:', stored?.phase);
console.log('repo_path:', stored?.metadata?.repo_path);
console.log('executed_from_cwd:', stored?.metadata?.executed_from_cwd);
console.log('session_id:', stored?.metadata?.session_id);
console.log('content_hash:', stored?.metadata?.content_hash);
console.log('evaluated_commit_sha:', stored?.metadata?.evaluated_commit_sha);
console.log('source:', stored?.metadata?.source);
