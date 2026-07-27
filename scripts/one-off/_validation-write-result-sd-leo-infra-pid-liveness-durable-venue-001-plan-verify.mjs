#!/usr/bin/env node
// One-off: record VALIDATION sub-agent adversarial PRD-vs-implementation review for
// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (PLAN verification phase, pre PLAN-TO-LEAD).
//
// Requirement-by-requirement adjudication of the diff (origin/main...HEAD) against
// PRD-SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001, with live-DB and live-CI verification of
// the most consequential claims (FR-2a withdrawal soundness, FR-2d migration-apply state,
// FR-3b scheduled-task health).
//
// Writes via the canonical path: storeSubAgentResults (lib/sub-agent-executor/results-storage.js)
// with metadata built by applySubAgentRepoVerdict (lib/sub-agents/resolve-repo.js) per
// CLAUDE.md prologue #11 -- no hand-rolled repo_path/local_path columns.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = 'SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const frFindings = [
  {
    requirement: 'FR-1 (C2 resolver)',
    verdict: 'MET',
    detail:
      'lib/fleet/resolve-cc-pid.cjs is a single shared module; grep confirms it is the ONLY ' +
      'definition of resolveCcPidFromTerminalId in the tree -- scripts/stale-session-sweep.cjs ' +
      're-exports it (module.exports.resolveCcPidFromTerminalId = ... from the shared module, ' +
      'stale-session-sweep.cjs:536-544) and lib/fleet/session-liveness.cjs consumes it directly ' +
      '(session-liveness.cjs:22,120-121). fleet-dashboard.cjs additionally migrated its OWN ' +
      'shadow hasPidAlive (the last-segment terminal_id split that could never match a bare UUID) ' +
      'to delegate to the shared session-liveness.cjs hasPidAlive -- beyond what the AC literally ' +
      'required, closing PRD TS-8s second shadow ladder too. Row-count evidence for "not 0-of-N" ' +
      'is documented with specific counts in-file (resolve-cc-pid-shared.test.js: "9 rows examined, ' +
      '6 resolved"; stale-session-sweep.cjs comment + runtime console line: "examined 12 == 12, 3 ' +
      'NULL-terminal_id rows, all 3 resolvable via session_id marker") and the sweeps own runtime ' +
      'log line states it on every run ("[sweep] PID venue OK ... Examined N row(s); M resolved to ' +
      'a live PID"). NULL terminal_id: hasPidAlive/resolveCcPidFromTerminalId deliberately does NOT ' +
      'early-return on missing terminal_id (session-liveness.cjs:114-118) and returns null (never ' +
      'true/false-as-death) when neither terminal_id nor session_id resolves. ' +
      'periodic-liveness-watcher.mjs:85 consumer: exercised by tests/unit/periodic-liveness-watcher.test.js ' +
      'and tests/unit/fleet/watcher-evaluates-every-seat.test.js, both GREEN. ' +
      'Caveat (minor): the "materially non-zero fraction against the LIVE population" row counts are ' +
      'asserted only in hermetic tests citing a historical measurement in comments, not re-verified ' +
      'against the live DB on every CI run the way FR-2d and FR-2c are -- weaker evidentiary form ' +
      'than its siblings, but not a functional gap.',
  },
  {
    requirement: 'FR-2a (amend the one-directional contract)',
    verdict: 'NOT MET -- BY EXPLICIT WITHDRAWAL, AND THE HEADLINE DEFECT IS ONLY PARTIALLY CLOSED AS A RESULT',
    detail:
      'WITHDRAWN at commit 6c1eeb9c16d. lib/fleet/session-liveness.cjs:140 still reads ' +
      '`if (session.is_alive === true) return { alive: true, reason: "raw_is_alive" }` UNCONDITIONALLY ' +
      '-- confirmed by direct read of the shipped file, not inference. Foxtrots stated rationale ' +
      '(is_alive is NOT sticky -- stale-session-sweep.cjs:2467-2489 atomically clears it on release; ' +
      'the documented failure mode actually runs the OTHER direction -- claim-validity-gate.js:220-224/' +
      '266-270 record a live heartbeating worker transiently reading is_alive=false, causing claim/' +
      'release thrash) is FACTUALLY CORRECT as far as it goes -- I independently verified ' +
      'stale-session-sweep.cjs sets is_alive:false only inside its own release path (line ~2477), ' +
      'gated on its own independent classification (raw heartbeat_age_seconds + hasPidAlive + ' +
      'pidUnverifiable, status===DEAD), which is a SEPARATE ladder from isSessionAlive() (this is the ' +
      'PRDs own TS-8 "shadow liveness ladder", left deliberately unconsolidated). ' +
      'END-TO-END TRACE OF THE ACTUAL DEFECT MECHANISM: (1) FR-2b stops the tick from adopting its ' +
      'own pid, so heartbeat_at/process_alive_at STOP being refreshed once the real parent is ' +
      'confirmed dead -- this is real and load-bearing, verified live via TS-3c (a spawned tick ' +
      'proven RED pre-fix, hanging the full 6s test timeout, GREEN post-fix). (2) Once heartbeat_at ' +
      'goes stale, stale-session-sweep.cjs (given FR-1s resolver + FR-3s durable PID-capable venue) ' +
      'can independently classify the row DEAD once heartbeat_age_seconds crosses its own ' +
      'VERY_STALE_SECONDS threshold (~15min CLI / 30min Desktop per in-file comment) AND the PID ' +
      'resolves to a genuinely-dead process AND the venue is PID-capable -- at which point the sweep ' +
      'directly UPDATEs is_alive:false in the SAME statement that releases the claim. (3) ONLY AFTER ' +
      'that external write lands does isSessionAlive() stop short-circuiting to alive:true. ' +
      'CONCLUSION: isSessionAlive() -- "the liveness SSOT consumed fleet-wide" per this PRDs own ' +
      'integration_operationalization.consumers list, gating lib/fleet/claim-release-guard.cjs, ' +
      'lib/worktree-reaper/live-claim-guard.js and scripts/worktree-reaper.mjs (PRD TS-7) -- CANNOT, ' +
      'BY ITSELF, EVER PRODUCE alive:false FOR A SESSION WHOSE RAW is_alive COLUMN IS TRUE. The only ' +
      'thing that can ever flip that verdict is the external sweep write, which is bounded by the ' +
      'sweeps OWN staleness threshold (now reachable, thanks to FR-2b, but still ~15-30min, not ' +
      'instant) and depends on the sweep actually running on a PID-capable venue at that moment. This ' +
      'is a real, bounded improvement over "forever" (the originally measured 21+ minutes and ' +
      'counting) but it is NOT the mechanism FR-2a specified, and none of TS-7s three named ' +
      '"destructive consumers" are tested anywhere in this diff to confirm they eventually release/reap ' +
      'a genuinely-dead, is_alive-stuck-true session -- the ONLY test touching claim-release-guard.cjs ' +
      'in this diff (tests/unit/fleet/liveness-abstention-is-not-death.test.js:83-94) proves the OPPOSITE ' +
      'property (HOLD on an unresolvable PID), not the release path. Separately: stale-session-sweep.cjs ' +
      'does its OWN direct release (sd_key=null/is_alive=false) independent of claim-release-guard.cjs, ' +
      'so the OPERATIONAL outcome (a dead session eventually loses its claim) is plausible even though ' +
      'the SSOT itself never asserts death -- but that is an architecture the PRD did not describe and ' +
      'the acceptance test does not prove.',
  },
  {
    requirement: 'FR-2b (adopt-own-pid guard)',
    verdict: 'MET',
    detail:
      'scripts/session-tick.cjs: `if (candidate === process.pid) return 0;` added inside ' +
      'rediscoverParentPid (commit 364570c83d6), correctly scoped BEFORE the existing adopt logic. ' +
      'tests/unit/session-tick-spawn-observe.test.mjs TS-3c: spawns a REAL tick process against a ' +
      'mock PostgREST, seeds the row with the ticks own pid (replicating the exact first-tick-POST ' +
      'condition that creates the bug), kills the fake parent, and asserts the tick EXITS. Commit ' +
      'message states this was PROVEN RED pre-fix (hung the full 6s timeout waiting for an exit that ' +
      'never came) -- I re-ran the file live: `node --test tests/unit/session-tick-spawn-observe.test.mjs` ' +
      '-> 8/8 pass including TS-2 (legitimate parent-pid rotation still adopts, unaffected) and TS-3c ' +
      '(self-relatch refused) simultaneously, proving the false-life/false-death seam holds both ' +
      'directions at once, exactly as TS-2 required.',
  },
  {
    requirement: 'FR-2c (recalibrate TICK_FRESH_MS)',
    verdict: 'MET -- legitimate finding, not a dodge',
    detail:
      'Value unchanged at 90s, but the AC only requires the value be DERIVED from measured cadence ' +
      'with the measurement CITED and that no healthy seat classify dead under it -- both hold. The ' +
      'PRDs premise (18-interval sample, "bimodal 60.01/90.02s") was re-measured with 168 intervals ' +
      '(tests/fixtures/tick-cadence-2026-07-27.json, captured by differencing DB process_alive_at ' +
      'VALUES rather than external poll timestamps, which eliminates the aliasing that produced the ' +
      'original bimodal reading): unimodal at ~30.0s, 0/168 exceed 90s or even 180s. ' +
      'tests/unit/fleet/tick-fresh-window-derivation.test.js replays the ACTUAL captured fixture ' +
      'against the shipped TICK_FRESH_MS constant on every run (not just a comment) and additionally ' +
      'pins the OTHER edge -- that the window is still tight enough to mean something now that the ' +
      'veto amendment was withdrawn (a rung that never goes stale is not a liveness signal; false-LIFE ' +
      'is now the risk this rung carries, not false-death). Ran live: all assertions pass.',
  },
  {
    requirement: 'FR-2d (v_active_sessions +4 columns)',
    verdict: 'NOT MET -- LIVE, CONFIRMED, AND CURRENTLY BREAKING THIS SDs OWN CI',
    detail:
      'Migration database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql is ' +
      'committed but UNAPPLIED (chairman-gated: classifyMigration -> tier 2 CREATE OR REPLACE VIEW, ' +
      'isDelegatableForApply=false). I queried the LIVE v_active_sessions view directly: it has 36 ' +
      'columns and NONE of process_alive_at / updated_at / expected_silence_until / pid_validated_at ' +
      'are present. This is not merely "unapplied but harmless" -- I ran the SDs OWN added test, ' +
      'tests/unit/fleet/view-backed-liveness-parity.test.js, against the live DB: it FAILS (1 of 9 ' +
      'sub-tests red) with the exact expected signature ("view row missing process_alive_at" etc. for ' +
      'every one of ~14 live rows). I then confirmed this is not a local-only artifact: the SDs own ' +
      'PR CI check "Run Unit Tier (quarantine-aware)" is currently FAIL, and the failed jobs log shows ' +
      '`tests/unit/fleet/view-backed-liveness-parity.test.js (9 tests | 1 failed)` plus ' +
      '`"new_failure_count": 1` from the quarantine-aware audit (i.e. flagged as a genuinely NEW, ' +
      'non-quarantined failure). This SD cannot be called green while its own PRs required CI check is ' +
      'red for a defect this SDs own test was written to catch.',
  },
  {
    requirement: 'FR-3a (GHA sweep abstains when PID-blind)',
    verdict: 'MET',
    detail:
      'lib/fleet/pid-venue.cjs pidVenueCapability() answers ONLY "is the marker dir present here", ' +
      'deliberately does not sniff CI env vars (documented reasoning: a dev host with the dir removed ' +
      'is just as blind as a runner). stale-session-sweep.cjs: pidUnverifiable computed once per sweep ' +
      '(not per-row), inserted into the status ladder BEFORE the isVeryStale/exceedsDesktopCap branch ' +
      'that would otherwise assign DEAD (verified by direct code read, lines ~2047-2057), so a ' +
      'PID-blind row can never reach status===DEAD; isStale is independently ANDed with ' +
      '!pidUnverifiable. The sweep explicitly logs the abstention (pidBlindNotice) or the row count ' +
      'either way -- never a silent "all clear". tests/unit/fleet/pid-blind-venue-abstains.test.js: ' +
      'GREEN.',
  },
  {
    requirement: 'FR-3b (host-local durable scheduler)',
    verdict: 'MET, with one live discrepancy against the handoff prompts own claim',
    detail:
      'Both host-local Windows Scheduled Tasks are registered on this host: "EHG LEO Liveness Watcher ' +
      '(PID classes)" (30min) and "EHG LEO Stale-Session Sweep (host-local, PID-capable)" (5min); I ' +
      'queried both directly via schtasks. AT THE TIME I FIRST CHECKED, the watcher showed Last ' +
      'Result=0 but the SWEEP task showed Last Result=1 (a genuine failure), contradicting the "both ' +
      'ran with Last Result 0" claim handed to me. I manually re-triggered the sweep task and it ' +
      'completed with Last Result=0 on retry, and running the underlying script directly ' +
      '(node scripts/stale-session-sweep.cjs) also exits 0 -- so the mechanism works and the single ' +
      'observed non-zero result looks transient (concurrent-run overlap is plausible: ' +
      '"Stop If Still Running: Disabled" on a 5-minute cadence), but I could not root-cause the one bad ' +
      'run and it should not be asserted as clean without caveat. SEPARATELY, and more importantly for ' +
      'scope: both wrapper .cmd files `cd /d` into the MAIN repo checkout ' +
      '(C:\\Users\\rickf\\...\\EHG_Engineer), which is on `main` and does NOT yet contain this SDs code ' +
      '(no lib/fleet/resolve-cc-pid.cjs there) -- so the registered durable venue is currently running ' +
      'PRE-FIX code and will only run the FR-1/FR-2b/FR-3 logic once this branch merges to main. That ' +
      'is expected/by-design for a host-local scheduler pointed at a stable checkout, not a defect in ' +
      'this diff, but it means FR-3b\'s durability property is proven only for the SCHEDULING ' +
      'mechanism, not yet for this SD\'s logic running under it. The "startup arm" task (ONLOGON/' +
      'ONSTART) is NOT registered -- documented in-code as a known, honest degradation (elevation ' +
      'required, not available on this host); the cadence task\'s own StartWhenAvailable=true covers ' +
      'the reboot case instead, and --verify mode explicitly states what IS proven (persisted, ' +
      'repeating, enabled, on-disk) vs NOT proven (no actual reboot was performed) -- ran --verify live ' +
      'and confirmed this honest self-report matches reality.',
  },
  {
    requirement: 'FR-3c (sweeper evaluates every seat, states row count)',
    verdict: 'MET',
    detail:
      'scripts/periodic-liveness-watcher.mjs resolveRoleSession: the prior `.limit(1).maybeSingle()` ' +
      '(which examined only the single freshest-heartbeat row per class -- and, since a self-relatched ' +
      'immortal tick sorts first by heartbeat_at DESC, preferentially examined the FORGED row) is ' +
      'removed; every matching seat is now evaluated, dead seats are named (deadSeatIds) rather than ' +
      'silently absorbed into a class-level OK, and the examined/alive counts are stated on every ' +
      'return path including the OK path. stale-session-sweep.cjs already states "Examined N row(s); M ' +
      'resolved" on every run (FR-3a code). tests/unit/fleet/watcher-evaluates-every-seat.test.js: ' +
      'GREEN.',
  },
  {
    requirement: 'FR-4 (parent binding acceptance, negative control)',
    verdict: 'PARTIAL -- proves the wrong layer',
    detail:
      'tests/unit/fleet/pid-liveness-parent-acceptance.test.js DOES bind C1 (greps for the guard ' +
      'string), C2 (resolves real spawned-and-killed pids via markerDir in both directions), and C3 ' +
      '(pidVenueCapability abstains on an absent dir) -- all correctly. BUT the "one run, both ' +
      'verdicts" binding assertion (line 112-116) only calls hasPidAlive() directly for both the live ' +
      'and dead seat -- NOT isSessionAlive(), the actual SSOT gating claim-release-guard.cjs / ' +
      'worktree-reaper.mjs / live-claim-guard.js that the PRD names as the fix target. The ONE place ' +
      'this file calls isSessionAlive() (line 155-163, "the full read-time ladder agrees") tests ONLY ' +
      'the ALIVE half, and does so by explicitly setting `is_alive: false` on the fixture -- which is ' +
      'the PARKED-WORKER upgrade scenario the ORIGINAL SSOT was built to protect, not the actual bug ' +
      'shape (is_alive STUCK TRUE). There is no isSessionAlive() call anywhere in this diffs tests with ' +
      'is_alive:true that returns alive:false -- and per the FR-2a trace above, there cannot be one, ' +
      'by construction. So "the row reads DEAD" (PRD AC wording) is proven only for a sub-component ' +
      '(hasPidAlive), not for the consumer-facing verdict the PRD explicitly named. The negative ' +
      'control requirement ("no assertion references stale_reason/stale_at/released_reason") IS met, ' +
      'self-enforced via a source grep in the same file.',
  },
];

const topLevelAC = [
  {
    ac: '1. A seat killed with no agent session running reads DEAD, live seat reads ALIVE, same run',
    verdict: 'NOT MET at the SSOT level (see FR-4)',
    detail: 'True only for the isolated hasPidAlive() component; not demonstrated for isSessionAlive() or for the actual claim-release/worktree-reap consumers.',
  },
  {
    ac: '2. Tick no longer self-relatches, proven by live spawn-and-kill',
    verdict: 'MET',
    detail: 'TS-3c, re-run live, 8/8 pass.',
  },
  {
    ac: '3. PID leg resolves real pids (not 100% inert), row count stated',
    verdict: 'MET',
    detail: 'Documented counts (12/12 examined, 3 NULL all resolvable) + runtime sweep log line.',
  },
  {
    ac: '4. Parked workers whose parent pid rotates still read ALIVE',
    verdict: 'MET',
    detail: 'TS-2 unchanged and green alongside TS-3c in the same run.',
  },
  {
    ac: '5. One-directional contract amendment documented in-file with 5 prior builds named',
    verdict: 'NOT MET (by decision)',
    detail: 'No amendment exists to document -- FR-2a was withdrawn. The "5 prior builds" framing survives only in comments about TICK_FRESH_MS and the withdrawn-guard test, not as an amendment record (there is nothing to amend).',
  },
  {
    ac: '6. Sweeper evaluates every seat, states row count',
    verdict: 'MET',
    detail: 'FR-3c, both stale-session-sweep.cjs and periodic-liveness-watcher.mjs.',
  },
];

const criticalIssues = [
  {
    severity: 'CRITICAL',
    issue:
      'FR-2d live-parity test (tests/unit/fleet/view-backed-liveness-parity.test.js) is RED against ' +
      'the live DB because the migration is committed but unapplied, and this is independently ' +
      'confirmed on the SDs own PR: "Run Unit Tier (quarantine-aware)" CI check is FAIL, with the ' +
      'quarantine-aware audit flagging it as a NEW (non-quarantined) failure.',
    recommendation:
      'Either get the migration applied (chairman-gated apply) before PLAN-TO-LEAD, or make the ' +
      'live-parity test explicitly skip/xfail until the migration is confirmed applied (e.g. probe the ' +
      'view for one of the four columns and skip with a clear message rather than failing red) so the ' +
      'SDs own required CI check is not red for a known, tracked, gated condition.',
  },
  {
    severity: 'HIGH',
    issue:
      'FR-4s parent acceptance test proves "one run, both verdicts" only at the hasPidAlive() ' +
      'component level, never through isSessionAlive() (the actual SSOT) or through any of the three ' +
      'named destructive consumers (claim-release-guard.cjs, worktree-reaper.mjs, live-claim-guard.js). ' +
      'Given FR-2a was withdrawn, isSessionAlive() can never itself assert death for an is_alive=true ' +
      'row by construction -- the actual repair path is stale-session-sweep.cjs\'s own independent ' +
      'release, which is untested end-to-end anywhere in this diff.',
    recommendation:
      'Add an integration-level test that seeds a claude_sessions-shaped row with is_alive=true, a ' +
      'stale heartbeat, and a genuinely-dead resolvable pid, runs the ACTUAL sweep classification ' +
      'logic (not just its helper functions) against it, and asserts the row is released with ' +
      'is_alive flipped to false -- closing the gap between "components are individually correct" and ' +
      '"the pipeline delivers the promised end-to-end outcome".',
  },
];

const warnings = [
  {
    severity: 'MEDIUM',
    issue:
      'The host-local "EHG LEO Stale-Session Sweep (host-local, PID-capable)" scheduled task showed ' +
      'Last Result=1 on first observation (contradicting the "both ran with Last Result 0" claim ' +
      'handed to this reviewer); a manual re-trigger succeeded (Result=0) and the script runs clean ' +
      'standalone, so this looks transient, but the root cause of the one bad run was not identified.',
    recommendation: 'Add basic logging/redirection to the .cmd wrappers (currently silent) so a future non-zero Last Result is diagnosable without a manual re-trigger.',
  },
  {
    severity: 'LOW',
    issue:
      'Both registered scheduled-task wrappers `cd /d` into the main EHG_Engineer checkout, which is ' +
      'still on pre-SD main -- the durable venue is real and running, but is currently exercising ' +
      'OLD sweep/watcher logic until this branch merges.',
    recommendation: 'Expected/by-design; no action needed beyond noting it resolves itself at merge.',
  },
];

const summary =
  'Adjudicated PRD-SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 requirement-by-requirement against ' +
  'the implementation diff (origin/main...HEAD) with live verification (DB queries, CI check status, ' +
  'live test runs, live scheduled-task queries), not document review alone. RESULT: FR-1, FR-2b, ' +
  'FR-2c, FR-3a, FR-3b, FR-3c are MET with live evidence. FR-2a was explicitly withdrawn (documented, ' +
  'reasoned decision, not an oversight) and, traced end-to-end, leaves isSessionAlive() structurally ' +
  'unable to ever assert death for an is_alive=true row -- the actual repair path is an independent, ' +
  'untested-end-to-end sweep release, bounded by the sweep\'s own staleness window rather than by the ' +
  'SSOT. FR-4\'s "one run, both verdicts" binding test proves this only at the hasPidAlive() ' +
  'sub-component level, not through the SSOT or any of the three named destructive consumers. FR-2d ' +
  'is confirmed NOT MET live: the migration is unapplied, the SD\'s own added parity test is RED ' +
  'against the live DB, and this is independently corroborated by a currently-FAILING required CI ' +
  'check ("Run Unit Tier (quarantine-aware)") on this SD\'s own PR, flagged by the quarantine-aware ' +
  'audit as a genuinely new failure. Overall verdict: FAIL -- the SD\'s own CI is red for a tracked ' +
  'reason, and the parent acceptance test does not bind the SSOT layer the PRD named as the fix ' +
  'target.';

const results = {
  verdict: 'FAIL',
  confidence: 78,
  critical_issues: criticalIssues,
  warnings,
  recommendations: [
    'Fix or explicitly gate tests/unit/fleet/view-backed-liveness-parity.test.js so the SDs required CI check is not red before PLAN-TO-LEAD.',
    'Add an end-to-end sweep-classification test proving a genuinely-dead, is_alive=true session is eventually released/reaped -- the current test suite proves only isolated components.',
    'Confirm the sweep host-local task\'s one observed Last Result=1 is transient (overlap) rather than a latent bug, given the disabled "Stop If Still Running" setting on a 5-minute cadence.',
  ],
  detailed_analysis: { fr_findings: frFindings, top_level_acceptance_criteria: topLevelAC, summary },
  metadata: {
    review_type: 'manual_adversarial_prd_vs_implementation_review',
    reviewed_files: [
      'lib/fleet/session-liveness.cjs',
      'lib/fleet/resolve-cc-pid.cjs',
      'lib/fleet/pid-venue.cjs',
      'scripts/session-tick.cjs',
      'scripts/stale-session-sweep.cjs',
      'scripts/periodic-liveness-watcher.mjs',
      'scripts/fleet-dashboard.cjs',
      'scripts/setup-liveness-watcher-task.mjs',
      'database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql',
      'tests/unit/fleet/pid-liveness-parent-acceptance.test.js',
      'tests/unit/fleet/tick-fresh-window-derivation.test.js',
      'tests/unit/fleet/liveness-abstention-is-not-death.test.js',
      'tests/unit/fleet/view-backed-liveness-parity.test.js',
      'tests/unit/fleet/resolve-cc-pid-shared.test.js',
      'tests/unit/fleet/pid-blind-venue-abstains.test.js',
      'tests/unit/fleet/watcher-evaluates-every-seat.test.js',
      'tests/unit/session-tick-spawn-observe.test.mjs',
    ],
    diff_base: 'origin/main...HEAD',
    live_checks_performed: [
      'queried live v_active_sessions columns directly -- confirmed 4 FR-2d columns absent',
      'ran vitest against the full fleet test dir live -- 70 pass / 1 fail (view-backed-liveness-parity)',
      'ran tests/unit/session-tick-spawn-observe.test.mjs live -- 8/8 pass (TS-2 + TS-3c coexist)',
      'ran node scripts/stale-session-sweep.cjs directly -- exit 0',
      'queried gh pr checks for this branch -- "Run Unit Tier (quarantine-aware)" = fail',
      'pulled the failed CI job log -- confirmed view-backed-liveness-parity.test.js is the new failure (new_failure_count: 1)',
      'queried both registered Windows Scheduled Tasks via schtasks -- watcher Last Result 0, sweep Last Result 1 on first check, 0 on manual re-trigger',
      'ran scripts/setup-liveness-watcher-task.mjs --verify live -- matches its own honest proven/not-proven disclosure',
    ],
  },
};

async function main() {
  const { data: sdRow } = await supabase
    .from('strategic_directives_v2')
    .select('target_application, current_phase')
    .eq('sd_key', SD_ID)
    .maybeSingle();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: sdRow?.target_application || 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst' },
    results,
    { phase: 'PLAN_VERIFICATION' }
  );

  console.log('\nSTORED ROW ID:', stored?.id);
  console.log('metadata.repo_path:', stored?.metadata?.repo_path);
  console.log('metadata.executed_from_cwd:', stored?.metadata?.executed_from_cwd);
  console.log('verdict (mapped):', stored?.verdict, '| original_verdict:', stored?.metadata?.original_verdict);
}

main().catch((err) => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
