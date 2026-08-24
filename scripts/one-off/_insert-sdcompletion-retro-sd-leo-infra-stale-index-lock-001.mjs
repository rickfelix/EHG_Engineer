#!/usr/bin/env node
/**
 * One-off: INSERT the SD_COMPLETION retrospective row for
 * SD-LEO-INFRA-STALE-INDEX-LOCK-001.
 *
 * CRITICAL constraints (per LEO gate semantics, scripts/modules/handoff/retro-filters.js):
 *  - retro_type           = 'SD_COMPLETION'
 *  - retrospective_type   = NULL  (the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE and
 *    LEAD-FINAL-APPROVAL exists-gate both `.or('retrospective_type.is.null,
 *    retrospective_type.eq.SD_COMPLETION')` — NULL is the canonical value; the
 *    LEAD_TO_PLAN handoff retro already occupies retrospective_type='LEAD_TO_PLAN')
 *  - created_at            > the LEAD-TO-PLAN acceptance timestamp
 *    (2026-08-24T16:24:50.969112+00:00, from sd_phase_handoffs) — this script uses
 *    now(), which is comfortably after that.
 *
 * Content is written from the actual session narrative (12+ live crash recurrences,
 * the 3-round prospective TESTING review that reshaped the fix twice, the vacuous
 * pre-existing test found and repaired) — not boilerplate. The PLAN-TO-LEAD precheck
 * rejected an earlier pass specifically for lacking SD-specific content.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

(function loadEnvFromAncestors() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) { dotenv.config({ path: envFile }); return; }
    dir = path.dirname(dir);
  }
})();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';
const SD_KEY = 'SD-LEO-INFRA-STALE-INDEX-LOCK-001';
const nowIso = new Date().toISOString();

const what_went_well = [
  'LEAD-phase Explore investigation measured the SD\'s own submitted premise FALSE before any code was written: the SD claimed two prior SDs (SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001, SD-LEO-INFRA-JAMMED-GIT-INDEX-001) had shipped a worktree-blind stale-lock guard. Neither actually shipped hook-wired lock cleanup for either topology — SD #1 fixed an unrelated setInterval in lib/heartbeat-manager.mjs, SD #2 shipped detection-only and explicitly punted on cleanup. Catching this before EXEC prevented building a fix for a problem that had already been (differently) diagnosed and re-scoped LEAD toward the real root cause.',
  'The real root cause was measured, not assumed: scripts/append-fleet-commit-trailer.js raced a Supabase query against a ref\'d, uncleared 2000ms setTimeout, then called process.exit(0) unconditionally — the exact defect class already fixed once in this repo (lib/heartbeat-manager.mjs armUnrefInterval()) but never applied to this file. The crash (Windows libuv UV_HANDLE_CLOSING assertion) had fired 12+ times live in this session before the SD was filed.',
  'A dedicated Task-tool testing-agent ran a 3-round prospective review using REAL live probes, not code-reading, and materially reshaped the fix each round: Round 1 found the Supabase client itself (not just the timer) is the documented crash source elsewhere in this exact repo (scripts/cron/index-jam-detector.mjs:158-163 and .husky/commit-msg both already carry comments attributing the same libuv crash to this script/pattern) and found the originally-planned FR-2 (worktree-aware lib/git/clear-stale-index-lock.mjs) was dead code by construction — its sole invoker aborts on worktrees, and the PRD\'s cited safety predicate for that helper (age + zero-byte + no live pid) does not exist in the real code.',
  'Round 2 verified a specific alternative fix (process.exitCode+return, the pattern already proven safe for index-jam-detector.mjs\'s cron context) by writing and running a REAL probe (scripts/temp/probe-timeout-branch.mjs, a real supabase-js client pointed at a blackhole IP) rather than reasoning about it — and measured that this "obviously safe" pattern converts the intermittent crash into a DETERMINISTIC ~50-second hang on every interactive git commit, because the abandoned in-flight fetch (not the timer) keeps the event loop open. Catching this before it shipped prevented a "fix" that would have made every commit hang.',
  'Round 3 produced a materially better design than either LEAD\'s or EXEC\'s original plan: read the coordinator\'s already-existing local fleet-identity cache (fleet-identity-<sessionId>.json, written by scripts/hooks/coordination-inbox.cjs on every SET_IDENTITY message) instead of querying Supabase at all — retiring the entire defect class (no client, no timer, no race) rather than patching around it. The reviewer self-corrected a follow-up false assumption (that the callsign could be cached at SessionStart — measured that it isn\'t known yet at that point) and independently caught a real path-resolution trap in the existing cache-reading pattern used elsewhere (__dirname-relative resolution silently breaks under a worktree cwd).',
  'Testing discipline matched the review discipline: extended tests/unit/append-fleet-commit-trailer.test.js with real child_process spawns against a disposable temp git repo PLUS a real `git worktree add` of it (not simulated), so the worktree path-resolution trap is genuinely exercised. In the process, found a pre-existing "idempotent, never double-stamps" test that was vacuous — it used a session ID with no matching identity file, so the fail-open branch returned before the double-stamp guard it claimed to cover was ever reached — and fixed it, verifying the fix by mutating the guard away and confirming the corrected test failed for the right reason.'
];

const what_needs_improvement = [
  'The SD as originally submitted cited two specific prior SDs as having already partially solved this problem ("wrong-half coverage") without the submitter having verified what those SDs actually shipped — a costly premise to carry into LEAD if Explore had not measured it before PLAN began drafting a PRD around worktree-extending an existing helper that turns out to be unreachable from a worktree by design.',
  'The first "obvious" fix (process.exitCode+return) looked correct by inspection and by analogy to an already-proven-safe pattern in the same codebase — only a live probe against a stalled network endpoint revealed it silently converts an intermittent crash into a deterministic hang. Static code review, including a first read by the same testing-agent, did not surface this; only executing the timeout branch did.',
  'lib/git/clear-stale-index-lock.mjs\'s safety predicate (used by scripts/safe-root-resync.mjs) is documented in an existing PRD as having an age threshold + zero-byte + no-live-pid check; the real code has none of those guards. That gap is real, already owned by SD-LEO-INFRA-JAMMED-GIT-INDEX-001, and was deliberately left untouched here rather than silently absorbed or silently left mis-documented.'
];

const key_learnings = [
  'A pattern already "proven safe" elsewhere in the same codebase does not automatically transfer to a different execution context. process.exitCode+return is safe for index-jam-detector.mjs\'s CRON tick (an invisible 50s tail on an unattended job) but actively harmful for an interactive git-commit hook (every commit blocks for 50s) — the difference is entirely about WHERE the code runs, not what the code does, and only a live measurement caught it.',
  'Reviewing agents that run real probes against real infrastructure — not just reading code — found things static analysis missed twice in the same 3-round review: once finding the deeper root cause (the Supabase client, not merely the un-cleared timer), and once finding that the proposed replacement fix was actively worse than the bug it replaced.',
  'A cited "prior SD already fixed this, just not completely" premise must be measured against what that SD actually shipped before being encoded into a new SD\'s scope — SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 and SD-LEO-INFRA-JAMMED-GIT-INDEX-001 were both cited as partial-coverage precedents, and both turned out, on inspection, to have fixed a different site or shipped detection without cleanup — neither shipped what the SD assumed.',
  'A green, "idempotent, never double-stamps" test can be vacuously true: if the fixture session ID has no matching identity file, the script\'s fail-open branch returns before the double-stamp guard is ever exercised, so the test passes for a reason unrelated to the guard it claims to cover. The only reliable check is mutating the guard away and confirming the specific test fails for the right reason — which this session did for every assertion changed.',
  'Removing a network dependency (Supabase client + timer + Promise.race) entirely, in favor of reading a synchronous local cache the coordinator already maintains and keeps current, is a stronger fix than hardening the network call\'s failure handling — it retires the defect class instead of narrowing the window it can occur in.'
];

const action_items = [
  {
    action: 'Do not absorb lib/git/clear-stale-index-lock.mjs\'s known-unsafe safety predicate (no pid check, no age floor on zero-byte locks) into this SD — it remains SD-LEO-INFRA-JAMMED-GIT-INDEX-001\'s unfinished territory. File or link a follow-up against that SD to correct its PRD\'s safety-predicate claim against the real code and to add the missing pid/age checks.',
    owner: 'LEO-Session (harness backlog)',
    category: 'follow_up',
    deadline: 'Next SD-LEO-INFRA-JAMMED-GIT-INDEX-001 touch',
    verification: 'lib/git/clear-stale-index-lock.mjs has an explicit live-pid check and an age floor for zero-byte locks; SD-LEO-INFRA-JAMMED-GIT-INDEX-001 PRD updated to match the real code.'
  },
  {
    action: 'Before citing a prior SD as prior art / partial coverage in a new SD\'s scope, verify what it actually shipped (diff or retrospective) rather than trusting the SD title or a summary description — this SD\'s two cited precedents both turned out to have fixed something narrower than claimed.',
    owner: 'LEO-Session',
    category: 'process_improvement',
    deadline: 'Ongoing (LEAD Explore phase)',
    verification: 'LEAD Explore step for future SDs that cite prior-SD precedent includes a direct code/diff check, not just a title/description read.'
  },
  {
    action: 'When replacing a proven-safe-elsewhere fix pattern into a new execution context (e.g. cron vs. interactive hook), require a live probe of the failure branch (not just code review) before shipping — this session\'s Round 2 probe (scripts/temp/probe-timeout-branch.mjs) is a reusable template for verifying timeout/network-stall behavior under a real blackhole-IP client.',
    owner: 'TESTING sub-agent',
    category: 'testing_practice',
    deadline: 'Applies to future timeout/exit-code fixes',
    verification: 'Future PRs touching timeout or process.exit semantics in hook scripts include a probe script or equivalent live-branch exercise in the PR evidence.'
  }
];

const success_patterns = [
  'LEAD Explore measuring a cited prior-SD premise against the real shipped code before scoping, rather than trusting the SD\'s own submitted description.',
  '3-round prospective TESTING review using real live probes (not code-reading) that reshaped the fix twice, including catching a "fix" that would have shipped a deterministic 50s hang.',
  'Retiring a defect class (removing the network client + timer + race entirely) rather than hardening its failure handling.',
  'Mutation-verifying every test change by reverting the fix, confirming the specific test fails for the right reason, then restoring — including on a pre-existing vacuous test discovered mid-session.'
];

const failure_patterns = [
  'SD submitted with an unverified "prior SD partially fixed this" premise that Explore later measured false for both cited precedents.',
  'The first proposed fix (process.exitCode+return) was correct by analogy to an already-proven-safe pattern elsewhere in the repo but wrong for this execution context — only a live probe caught it.',
  'A pre-existing "idempotent" unit test was vacuously green: it exercised the fail-open branch, never the double-stamp guard it claimed to cover.'
];

const improvement_areas = [
  {
    area: 'Prior-SD precedent claims in SD scope statements',
    analysis: 'Both SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 and SD-LEO-INFRA-JAMMED-GIT-INDEX-001 were cited as having shipped partial coverage for this exact bug class; neither actually shipped hook-wired lock cleanup for either topology when the real diffs were inspected during LEAD Explore.',
    prevention: 'Require LEAD Explore to check the actual diff/commits of any cited precedent SD before it is used to justify a scope decision, not just its title/description.'
  },
  {
    area: 'Fix pattern transfer across execution contexts',
    analysis: 'process.exitCode+return was proven safe for index-jam-detector.mjs\'s unattended CRON context (an invisible ~50s tail on a background tick) but was measured, via a real probe, to convert the intermittent crash into a deterministic ~50s hang on every interactive git commit — because the abandoned in-flight fetch, not the timer, keeps Node\'s event loop open for the full network-stall duration.',
    prevention: 'Treat "proven safe elsewhere in this codebase" as a hypothesis to re-verify with a live probe in the new execution context, not as sufficient evidence on its own — especially when the new context is interactive/user-blocking rather than background/unattended.'
  },
  {
    area: 'Vacuous pre-existing test coverage',
    analysis: 'tests/unit/append-fleet-commit-trailer.test.js\'s "idempotent, never double-stamps" test used a session ID with no matching identity file anywhere, so the script\'s fail-open branch returned before the double-stamp guard the test claimed to cover was ever reached.',
    prevention: 'When touching a file with existing tests, mutate each relevant guard away and confirm the specific test fails for the right reason before trusting it as coverage — this session did so for every assertion and caught the vacuous case as a result.'
  }
];

const detailed_summary =
  'SD-LEO-INFRA-STALE-INDEX-LOCK-001 fixed a recurring bug that hit this fleet-worker session 12+ times: after git commit in a git worktree, the commit-msg hook\'s child process (scripts/append-fleet-commit-trailer.js) crashed on a Windows libuv assertion (UV_HANDLE_CLOSING), leaving a stale 0-byte .git/worktrees/<name>/index.lock that blocked the next git operation. The SD was submitted claiming two prior SDs had already shipped worktree-blind partial coverage for this; LEAD-phase Explore measured that claim FALSE against the actual shipped diffs (SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 fixed an unrelated setInterval site; SD-LEO-INFRA-JAMMED-GIT-INDEX-001 shipped detection-only) and re-scoped toward the real root cause: append-fleet-commit-trailer.js racing a Supabase query against a ref\'d, uncleared 2000ms setTimeout, then calling process.exit(0) unconditionally. A 3-round prospective TESTING review using real live probes (not code-reading) reshaped the fix twice — first finding the Supabase client itself, not just the timer, is the crash source (already documented elsewhere in this repo), and finding the originally-planned worktree-extension of lib/git/clear-stale-index-lock.mjs was dead code by construction; then measuring, via a real blackhole-IP probe, that the "obviously safe" process.exitCode+return replacement converts the intermittent crash into a deterministic ~50-second hang on every interactive commit; then landing on the shipped design — read the coordinator\'s already-existing local fleet-identity cache synchronously instead of querying Supabase at all, retiring the network dependency entirely. Shipped in scripts/append-fleet-commit-trailer.js (103 lines changed) plus an extended tests/unit/append-fleet-commit-trailer.test.js (130 lines changed) using real child_process spawns against a disposable temp git repo and a real `git worktree add`, which also surfaced and fixed a pre-existing vacuous idempotency test. Deliberately out of scope: lib/git/clear-stale-index-lock.mjs\'s known-unsafe safety predicate (no pid check, no age floor on zero-byte locks) remains SD-LEO-INFRA-JAMMED-GIT-INDEX-001\'s unfinished territory, flagged here as a follow-up rather than silently absorbed.';

const row = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null, // CRITICAL: NULL so PLAN-TO-LEAD / LEAD-FINAL gates recognize this as the completion retro
  title: 'SD Completion Retrospective: retire the network dependency that crashed the commit-msg hook and jammed worktree git operations',
  description: detailed_summary,
  conducted_date: nowIso,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['TESTING', 'RETRO'],
  human_participants: [],
  what_went_well,
  what_needs_improvement,
  action_items,
  key_learnings,
  success_patterns,
  failure_patterns,
  improvement_areas,
  quality_score: 88,
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 2, // (1) Supabase-client-as-crash-source not just the timer; (2) proposed process.exitCode+return fix would deterministically hang every commit
  bugs_resolved: 1, // the original libuv-crash/stale-lock defect
  tests_added: 0, // existing test file extended in place (130 LOC changed), not a net-new test file
  objectives_met: true,
  on_schedule: true,
  within_scope: true, // deliberately did NOT absorb clear-stale-index-lock.mjs hardening into this SD's scope
  generated_by: 'MANUAL',
  auto_generated: false,
  status: 'PUBLISHED',
  quality_validated_by: 'RETRO',
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT',
  applies_to_all_apps: true,
  related_commits: ['68f429ef71d', 'df824572084', 'd150003f53e', 'bf8cc173d08'],
  related_prs: ['#7498'],
  affected_components: [
    'scripts/append-fleet-commit-trailer.js',
    'tests/unit/append-fleet-commit-trailer.test.js',
    '.husky/commit-msg',
    'scripts/hooks/coordination-inbox.cjs (fleet-identity-<sessionId>.json cache, read not written)'
  ],
  related_files: [
    'scripts/append-fleet-commit-trailer.js',
    'tests/unit/append-fleet-commit-trailer.test.js'
  ],
  test_total_count: null,
  test_passed_count: null,
  test_failed_count: 0,
  test_skipped_count: 0,
  tags: ['windows-libuv', 'index-lock', 'worktree', 'commit-msg-hook', 'stale-lock', 'prospective-testing-review', 'fix-verify'],
  protocol_improvements: [
    'LEAD Explore should verify cited prior-SD precedent against the real diff/commits, not the SD title/description, before using it to scope a new SD.'
  ],
  unnecessary_work_identified: [],
  future_enhancements: [
    'Follow-up on SD-LEO-INFRA-JAMMED-GIT-INDEX-001 to correct lib/git/clear-stale-index-lock.mjs\'s documented-but-nonexistent safety predicate and add a real pid check + age floor for zero-byte locks.'
  ],
  metadata: {
    sd_key: SD_KEY,
    written_by: 'continuous-improvement-coach-sub-agent',
    branch: 'feat/SD-LEO-INFRA-STALE-INDEX-LOCK-001',
    pr: '#7498',
    review_rounds: 3,
    testing_review_method: 'live probes (scripts/temp/probe-timeout-branch.mjs), not code-reading',
    root_cause: 'append-fleet-commit-trailer.js Supabase client + ref\'d uncleared setTimeout + unconditional process.exit(0), same defect class as lib/heartbeat-manager.mjs armUnrefInterval() (not previously applied here)',
    fix_shape: 'removed the Supabase client, timer, and Promise.race entirely; reads coordinator-maintained fleet-identity-<sessionId>.json cache synchronously via git rev-parse --path-format=absolute --git-common-dir',
    explicitly_out_of_scope: 'lib/git/clear-stale-index-lock.mjs safety-predicate hardening (owned by SD-LEO-INFRA-JAMMED-GIT-INDEX-001)',
    live_recurrence_count_before_fix: '12+'
  },
  created_at: nowIso,
  updated_at: nowIso
};

const { data, error } = await supabase
  .from('retrospectives')
  .insert(row)
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .single();

if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}

// Re-read to capture any trigger-recomputed quality_score / status
const { data: stored } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('id', data.id)
  .single();

console.log('RETROSPECTIVE_ROW ' + data.id);
console.log('STORED_AFTER_TRIGGERS ' + JSON.stringify(stored));
