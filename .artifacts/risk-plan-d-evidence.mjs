import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults, resolveEvaluatedCommitSha } from '../lib/sub-agent-executor/results-storage.js';

const SD = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const REPORT = 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad/risk-plan-d-report.md';
const SESSION = '85c82b18-0984-4948-bd86-1992cdf5170d';
const reportText = fs.readFileSync(REPORT, 'utf8');
const contentHash = crypto.createHash('sha256').update(reportText).digest('hex');
const repoPath = process.cwd();
const sha = resolveEvaluatedCommitSha(repoPath);

const RISK_DOMAINS = {
  security: 7,
  operational: 8,
  data_migration: 6,
  technical_complexity: 5,
  delivery: 4,
  integration: 4,
};

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  execution_time_ms: 0,
  critical_issues: [],
  conditions: [
    'Condition 1 (security): make MICHAEL_GMAIL_MODIFY_CEILING bound the ET DATE, not the run. FR-5 stops applying at 60 and marks the run degraded; FR-1(d) states a degraded row ALLOWS A RETRY; FR-8 registers every-15-minutes across the 04:30-05:30 window. Four in-window fires times 60 = up to 240 archives in one morning, each run individually reporting itself within the ceiling. Sum counts.threads_modified across today gmail-triage runs and go inert with reason ceiling_hit once the day total is reached. Separately gate the first live apply: register --dry-run, or make --apply inert unless an explicit MICHAEL_GMAIL_APPLY_ENABLED host constant is set, so the chairman sees one full dry-run morning before the first real archive against a live mailbox. Bulk mis-archive is the one irreversible-in-practice harm per Solomon Q1.3.',
    'Condition 2 (technical/operational): correct the host-registration facts before PR 7 is written. MEASURED unelevated on this host from PowerShell: the plain /Create /SC MINUTE /MO 15 /ST 00:00 /F form SUCCEEDS (exit 0, LogonType=InteractiveToken); the same plus /RU rickf /NP that TR-8 mandates prompts for a password then returns ERROR: Access is denied (exit 1). Throwaway created and verified deleted. All TEN existing EHG host tasks read LogonType=Interactive, NOT S4U; console suppression comes from scripts/cron/run-hidden.vbs (QF-20260902-191). Drop /RU /NP from the mandated args and rely on run-hidden.vbs as the precedent actually does, or document the one-time elevated registration as a chairman runbook step. Also state the BATTERY precondition beside the awake precondition: five of eight measured tasks carry DisallowStartIfOnBatteries=True, so an awake-but-unplugged laptop still misses every 03:45-05:30 window silently.',
    'Condition 3 (data/operational): bound the staged payload and make the unclassified count exact. scripts/michael/retention.mjs line 31 lists michael_staged_items in NEVER_TOUCHED, and FR-6 makes child D the feature that starts writing personal prose there (kind task_route carries raw Google Tasks text). Stage ids, a content hash and at most a truncated title, never full task text, since whatever lands there is permanent. And have queue-read.mjs derive counts from an exact count query rather than the length of the array bounded by the literal limit 500 in lib/michael/db.mjs, so the brief unclassified-N-threads figure cannot understate at the moment the backlog matters.',
  ],
  justification: 'HIGH overall risk (6.5/10), driven by operational 8 and security 7, with a documented mitigation plan largely present in the PRD. CONDITIONAL_PASS rather than FAIL because no domain reaches CRITICAL: nothing in this child can delete mail (TRASH/SPAM refused at lib/michael/gmail-client.mjs FORBIDDEN_LABELS, code-verified), leak a credential to GHA (assertHostVenue in lib/integrations/google/chairman-oauth.js refuses on GITHUB_ACTIONS/CI, code-verified, plus a wiring test and workflow grep), or write DDL (git diff --stat acceptance criterion). All eight michael_* tables measured ABSENT live (PGRST205 against a control probe), so the child ships inert by construction and no identified exposure can fire before the chairman applies the -B migration and completes the -C consent. The three conditions are small local changes closing the gap between the mitigations as written and the harms as scoped.',
  warnings: [
    {
      id: 'RISK-S1',
      severity: 'HIGH',
      issue: 'The gmail modify ceiling bounds a RUN, not a morning',
      evidence: 'FR-5 stops applying at MICHAEL_GMAIL_MODIFY_CEILING and marks the run degraded, leaving intents "for the next run"; FR-1(d) says a degraded or failed row allows a retry; FR-8 registers /SC MINUTE /MO 15 across the gmail-triage window 04:30-05:30 ET, which is 4 in-window fires. 4 x 60 = up to 240 archives per morning with every run reporting itself compliant. Solomon Q1.3 names bulk mis-archive as the one irreversible-in-practice harm and this ceiling is the brake the adjudication leans on.',
      location: 'PRD FR-5, FR-1(d), FR-8',
      recommendation: 'Evaluate the ceiling against the sum of today threads_modified across all gmail-triage runs; once reached, subsequent fires go inert with reason ceiling_hit until a human clears it.',
    },
    {
      id: 'RISK-S2',
      severity: 'HIGH',
      issue: 'The first live --apply is unobserved and there is no kill switch',
      evidence: 'FR-8 registers the literal command scripts/michael/gmail-triage.mjs --apply. Harmless today because the tables are absent (measured PGRST205). The moment the chairman applies the -B migration and completes the -C consent, the next in-window fire archives against a live mailbox with no chairman-observed dry run, no go/no-go, and no flag or DB row that disables applying short of editing the scheduled task. The PRD assumption line names the trigger without treating it as an exposure.',
      location: 'PRD FR-8, PRD assumptions',
      recommendation: 'Register --dry-run initially, or make --apply inert unless MICHAEL_GMAIL_APPLY_ENABLED is set on the host.',
    },
    {
      id: 'RISK-S3',
      severity: 'MEDIUM',
      issue: 'The stated rollback does not scale to the stated worst case',
      evidence: 'The PRD rollback_plan for the HIGH-impact bulk mis-archive risk is "run gmail-act --unarchive per intent row; the item rows carry every intent so the set is enumerable". Read live: scripts/michael/gmail-act.mjs takes a single --thread per invocation (usage line 12, planModify at line 21). Reversing a 240-thread event is 240 manual invocations against a rate-limited API. No bulk or by-run revoke verb is in scope for this child.',
      location: 'scripts/michael/gmail-act.mjs; PRD risks[0].rollback_plan',
      recommendation: 'Add a --from-run <run_id> or --all-intents <et_date> bulk revoke, or state plainly that the enumerating script is not written.',
    },
    {
      id: 'RISK-O1',
      severity: 'HIGH',
      issue: 'MEASURED: no host task wakes and the precedent shape is battery-suppressed; spec section 5 overstates the power configuration',
      evidence: 'Spec 02-SPEC.md section 5 states "the existing power/wake configuration used by the reboot-respawn task covers it". Measured every registered EHG task via PowerShell Get-ScheduledTask: WakeToRun=False on ALL of them. Additionally DisallowStartIfOnBatteries=True on five of eight, including every PT15M watcher whose shape FR-8 copies. TR-8 concedes wake-from-sleep is not configured but is silent on the battery setting, which is the sharper failure: an awake-but-unplugged laptop misses every 03:45-05:30 window silently.',
      location: 'docs/michael/02-SPEC.md section 5; PRD TR-8 and FR-8; host Task Scheduler',
      recommendation: 'State the battery precondition beside the awake precondition in the registrar header, and correct the spec sentence claiming existing wake configuration covers it.',
    },
    {
      id: 'RISK-O2',
      severity: 'MEDIUM',
      issue: 'The unclassified count can silently cap at 500',
      evidence: 'lib/michael/db.mjs readRows carries a deliberate literal limit of 500 (count-truncation-diff-lint reads the literal). FR-9 specifies queue-read.mjs prints bounded rows "plus counts". If counts derive from the bounded array length, a backlog above 500 renders as exactly 500 and the brief unclassified-N-threads figure understates by an unknown margin at exactly the moment the backlog matters.',
      location: 'lib/michael/db.mjs around line 47; PRD FR-9',
      recommendation: 'Derive counts from an exact count query, never from the truncated array length.',
    },
    {
      id: 'RISK-O3',
      severity: 'MEDIUM',
      issue: 'Single-flight staleness (10 minutes) is shorter than the fire interval (15 minutes)',
      evidence: 'FR-1(d) treats a run as in-flight only while started_at is younger than 10 minutes; FR-8 fires every 15 minutes. A gmail-triage run exceeding 10 minutes (plausible at up to 200 threads with a per-thread metadata call plus modifies) is invisible to the next fire. Two concurrent --apply runs can read the same intent rows before either stamps action_taken_at, producing duplicate modify calls and two independent ceiling counters. Archive is idempotent so direct harm is bounded, but this compounds RISK-S1.',
      location: 'PRD FR-1(d) versus FR-8',
      recommendation: 'Set the staleness threshold at or above the fire interval, or add a heartbeat to the running row.',
    },
    {
      id: 'RISK-DA1',
      severity: 'MEDIUM',
      issue: 'Child D fills michael_staged_items, which retention is explicitly forbidden to touch',
      evidence: 'Read live: scripts/michael/retention.mjs line 31 NEVER_TOUCHED includes michael_staged_items. Retention nulls prose on michael_brief_runs, michael_gmail_triage_items and michael_feeder_runs and deletes michael_calendar_day rows. FR-6 makes child D the feature that starts writing personal prose there: unrouted Google Tasks items as kind task_route (raw task text) and the cleanup list as kind tasks_cleanup. Result: an unbounded, never-expiring personal-prose sink. This is child B SEC-M3 landing in child D lap; D ships no migration so the D-side remedy is to bound what it stages.',
      location: 'scripts/michael/retention.mjs line 31; PRD FR-6',
      recommendation: 'Stage ids, a content hash and at most a truncated title; never full task text.',
    },
    {
      id: 'RISK-T1',
      severity: 'HIGH',
      issue: 'MEASURED: the /RU /NP registration form TR-8 mandates is denied unelevated and matches none of the ten existing host tasks',
      evidence: 'Measured from PowerShell unelevated (whoami=rickf, Elevated=False): the plain schtasks /Create /SC MINUTE /MO 15 /ST 00:00 /F form SUCCEEDS at exit 0 registering LogonType=InteractiveToken; adding /RU rickf /NP prompts "Please enter the run as password for rickf" then returns ERROR: Access is denied at exit 1. Throwaway task created and verified deleted, nothing left behind. All ten existing EHG host tasks read LogonType=Interactive, NOT S4U; console suppression comes from scripts/cron/run-hidden.vbs (QF-20260902-191, window style 0), not from /RU /NP. The PRD risk table rates this probability LOW; for the mandated form it is certain. PRD VALIDATION condition 6 anticipated the shape and prescribed the fallback, so the escape hatch is correct and is now resolved negatively.',
      location: 'PRD TR-8 and FR-8; scripts/setup-eva-watcher-task.mjs lines 97-108; host Task Scheduler',
      recommendation: 'Drop /RU /NP from the mandated args and rely on run-hidden.vbs as the ten existing tasks do, or keep the S4U form and document the one-time elevated registration as a chairman runbook step. Update the FR-8 test to pin what this host accepts.',
    },
    {
      id: 'RISK-T3',
      severity: 'LOW',
      issue: 'Two window semantics collide in the harness extraction',
      evidence: 'scripts/michael-quiet-tick.mjs lines 35-46 defines inWindow with an INCLUSIVE start-to-end comparison and 62 existing tests pin that behavior. FR-1(b) specifies a HALF-OPEN window for feeders. Moving the helper into lib/michael/feeder.mjs must not change the tick semantics.',
      location: 'scripts/michael-quiet-tick.mjs lines 35-46 versus PRD FR-1(b)',
      recommendation: 'Add an explicit test stating the distinction; the 62-tests-green criterion catches a regression but does not document why.',
    },
    {
      id: 'RISK-D1',
      severity: 'LOW',
      issue: 'PR 7 (registrar) must land after PR 4b (apply)',
      evidence: 'PR 7 registers the literal --apply command; PR 4a refuses --apply with APPLY_NOT_LANDED until 4b lands. If the registrar merges first the task writes a failed run every 15 minutes in-window. Harmless while tables are absent, noisy and misleading afterward.',
      location: 'PRD FR-4, FR-5 and FR-8 sequencing',
      recommendation: 'Land PR 7 after PR 4b, or register --dry-run, which Condition 1 wants anyway.',
    },
    {
      id: 'RISK-DA4',
      severity: 'LOW',
      issue: 'tasks-classifier has no per-run creation cap and v1 has no consumer for the cleanup list',
      evidence: 'FR-6 creates Todoist tasks with no ceiling analogous to gmail. Because the grant is drive.readonly the cleanup list is STAGED rather than written back to Drive, so the Apps Script never consumes it and current-tasks.json keeps the same items. Dedupe is a 7-day lookback on labels captured plus from-google-tasks, so items in a repeatedly-refreshed file age out of the window and get recreated. The 36-hour staleness abort limits this where the file stops being refreshed, making the exposure narrow but not zero.',
      location: 'PRD FR-6',
      recommendation: 'Record consumed item ids and skip them regardless of age, or cap creations per run.',
    },
  ],
  recommendations: [
    'Overall risk HIGH (6.5/10). Domain scores: operational 8, security 7, data 6, technical 5, delivery 4, integration 4. Any domain at 7-8 with none above 8 yields HIGH per the scoring methodology.',
    'MEASURED, not read: all eight michael_* tables are genuinely ABSENT live (PGRST205, verified against a control probe of an invented table name). The child does ship inert by construction. Recording an instrument that lied: a select with count exact and head true returned NO error and count=null for all eight, reading as PRESENT; a plain bounded select is the honest probe.',
    'MEASURED: unelevated schtasks /Create SUCCEEDS in the plain form and is DENIED with /RU /NP. This resolves PRD VALIDATION condition 6 before EXEC, negatively, and removes the only unknown on the critical path. The throwaway task was created and verified deleted.',
    'MEASURED: WakeToRun=False on every EHG host task and DisallowStartIfOnBatteries=True on five of eight, contradicting the spec section 5 claim that the existing power/wake configuration covers the morning window.',
    'Child C plumbing verified present and correct: assertHostVenue with injectable env, all four coded throws FR-1(h) maps, FORBIDDEN_LABELS refusing TRASH and SPAM, the googleapis lazy import, and googleapis ^171.4.0 plus google-auth-library ^10.5.0 declared. gmail-act.mjs --unarchive exists and stamps reopened_at.',
    'No open PR touches any michael path, so there is no in-flight collision; 30 PRs open repo-wide makes merge-queue contention the real schedule risk for eight sequential PRs, not the ~13-minute tier.',
    'Mitigations already in the PRD and credited: record-then-act with an interrupt-and-resume test, TRASH/SPAM refused at the client, a single injectable host-venue enforcement point, no Google credential in GHA made falsifiable by a wiring test and a grep, metadata-only reads with a PII log-corpus security test, PROVENANCE_MISSING and HASH_MISMATCH refusals honoring ratification 6c263823, rows with action_taken_at or chosen_action never overwritten, no DDL with a git diff --stat criterion, missing-relation-is-inert, and single-flight with attempt max+1 and a 23505 retry.',
    'Missing mitigations: a day-level gmail cap, a first-run gate or kill switch for --apply, a bulk unarchive verb, a bound on the staged payload, an exact unclassified count, a single-flight threshold at or above the fire interval, and corrected registrar args plus a stated battery precondition.',
    'Proceed to EXEC under the three conditions. Full report at C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad/risk-plan-d-report.md',
  ],
  detailed_analysis: reportText,
  metadata: {
    session_id: SESSION,
    content_hash: contentHash,
    evaluated_commit_sha: sha,
    risk_level: 'HIGH',
    overall_risk_score: 6.5,
    risk_domains: RISK_DOMAINS,
    report_path: REPORT,
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
    spec_sections_read: ['docs/michael/02-SPEC.md section 3', 'docs/michael/02-SPEC.md section 5'],
    measurements_taken: [
      'Live probe of 8 michael_* tables: ALL ABSENT (PGRST205) verified against a control probe of an invented table name',
      'Unelevated schtasks /Create plain form: SUCCESS exit 0, LogonType=InteractiveToken (throwaway created and verified deleted)',
      'Unelevated schtasks /Create with /RU /NP: ERROR Access is denied, exit 1 (resolves PRD VALIDATION condition 6, negatively)',
      'PowerShell Get-ScheduledTask across all EHG tasks: WakeToRun=False on all 10, DisallowStartIfOnBatteries=True on 5 of 8, all LogonType=Interactive with no S4U',
      'scripts/michael/retention.mjs line 31 NEVER_TOUCHED includes michael_staged_items',
      'lib/michael/db.mjs readRows literal limit of 500',
      'lib/michael/gmail-client.mjs FORBIDDEN_LABELS refuses TRASH and SPAM, plus a lazy googleapis import',
      'lib/integrations/google/chairman-oauth.js assertHostVenue refuses on GITHUB_ACTIONS or CI with injectable env',
      'scripts/michael/gmail-act.mjs --unarchive is single-thread per invocation',
      'gh pr list: no open PR touches any michael path',
    ],
    conditions_count: 3,
    warnings_high: 4,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RISK',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'RISK',
  SD,
  { name: 'Risk Assessment Sub-Agent', code: 'RISK' },
  results,
  { phase: 'PLAN', sdKey: SD },
);

console.log('\nSTORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
console.log('repo_path:', results.metadata.repo_path, '| executed_from_cwd:', results.metadata.executed_from_cwd);
console.log('content_hash:', contentHash);
console.log('evaluated_commit_sha:', sha);
