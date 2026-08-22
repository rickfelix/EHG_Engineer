#!/usr/bin/env node
// Insert the PRD for SD-LEO-INFRA-FLEET-DOWN-ALERT-001 directly (PLAN phase, inline-mode PRD
// generation per CLAUDE_PLAN.md -- add-prd-to-database.js printed the generation prompt + ran
// DESIGN/DATABASE/RISK sub-agents; this script is Claude Code generating and inserting the PRD
// JSON per that schema).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'c7b9020f-d7ee-4b27-b395-272c69f0a1a1';
const SD_KEY = 'SD-LEO-INFRA-FLEET-DOWN-ALERT-001';
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary = `Fleet-down alarm pages ~166-181min after a real freeze (proven live) from a 120min+45min compound threshold, and never groups by host. Recalibrates the shared freeze cut and ships per-host checkFleetDeadMan verdicts, without regressing the already-correct last_tool_at signal.`;

if (executive_summary.length < 100 || executive_summary.length > 300) {
  console.error(`executive_summary length ${executive_summary.length} out of [100,300] range`);
  process.exit(1);
}

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Recalibrate the SHARED FREEZE_CUT_MINUTES constant (lib/fleet/genuine-worker.mjs:59-62) from measured false-positive data, closing the ~166-181min real page latency.',
    description: 'FREEZE_CUT_MINUTES defaults to 120min (FLEET_FREEZE_CUT_MINUTES unset in every workflow/env). It is read at 3 sites: scripts/fleet-worker-pulse.mjs (pager), lib/governance/drive-state/axes/fleet-health.cjs, and scripts/fleet-dashboard.cjs. Recalibrating must change the SHARED constant (or its env override), not fork a pager-only threshold -- otherwise the same seat reads STUCK to the pager but HEALTHY to the drive-axis/dashboard. Corroborate the LEAD-phase n=33 false-positive sample (15min=57.6% FP, 30min=36.4% FP, 45min=3.0% FP, >=90min=0% FP) with a larger EXEC-phase sample before locking a specific value; classifySeat already refuses an uncalibrated default by design (lib/fleet/stuck-seat-predicate.cjs:96-101) -- respect that discipline.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'FLEET_FREEZE_CUT_MINUTES (or the FREEZE_CUT_MINUTES fallback) is set to a value chosen from a measured false-positive sample of at least n=50, documented in the PR description with the sample source',
      'The SAME constant value is observed by all 3 read sites (pager, drive-health axis, dashboard) -- verified by a test asserting no divergent hardcoded override exists at any of the 3 sites',
      'The regression-latency test (FR-3) demonstrates the new value pages materially faster than the current ~166-181min baseline for the real 19:20-19:29Z freeze shape',
    ],
  },
  {
    id: 'FR-2',
    requirement: 'Add hostname GROUP BY specifically to checkFleetDeadMan (scripts/fleet-down-alert.mjs:381-433), filtered to exclude ephemeral runnervm* GitHub Actions hosts, test-fixture hosts, and NULL hostnames.',
    description: 'The Solomon BINDING constraint (SD-LEO-INFRA-FLEET-DEAD-MAN-001 metadata.design_notes[2]) literally names "the dead-man predicate", not the separate freeze/pager chain -- checkFleetDeadMan is the predicate it describes ("a fleet-wide newest-last_tool_at goes blind the day a second host exists"), and its Leg A currently checks heartbeat presence with zero host dimension. Live measurement: 12 distinct hostnames across 13,110 claude_sessions rows; only 1 (Legion-Laptop) has live population; 4 are ephemeral runnervm* Actions hosts (a new one per cron run); 5 are test fixtures; 81 rows are NULL-hostname. Without filtering, naive grouping creates 11 permanently-"down" ghost groups that would page every ~15min tick unbounded.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'checkFleetDeadMan groups its Leg A (heartbeat) and Leg B (completions) evaluation by hostname, excluding rows matching /^runnervm/i, known test-fixture hostnames, and NULL hostname',
      'A live-data-informed unit test seeds all 3 excluded categories alongside a real host and asserts zero alarm groups form for the excluded categories',
      'A 2-host fixture (one all-stale, one healthy) produces a down-verdict only for the stale host; the healthy host is neither masked-by nor falsely-flagging',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Fix recordFleetDeadManVerdict\'s edge-trigger dedup (scripts/fleet-down-alert.mjs:348-376) to scope its READ by host, matching a host-scoped WRITE.',
    description: 'recordFleetDeadManVerdict currently reads the single most-recent system_events row globally via .limit(1) with no host filter (line 350-355), while writing a global-only payload. Once FR-2 adds a host dimension to the write, an unscoped read would let hosts scramble each other\'s edge-trigger dedup state -- e.g. Host A transitioning dead->alive could be read as the "prior state" for Host B\'s own transition check, causing missed or duplicate pages. Both the read query and the write payload must carry and filter on the same host key.',
    priority: 'HIGH',
    acceptance_criteria: [
      'The read query for the prior verdict includes .eq(\'payload->>host\', host) (or equivalent), matching the host written',
      'A dedicated 2-host test proves Host A transitioning does not affect Host B\'s own transitioned flag on the same run',
      'The existing single-host/global test suite for recordFleetDeadManVerdict continues to pass unmodified when host is omitted (backward compatible default)',
    ],
  },
  {
    id: 'FR-4',
    requirement: 'Verify and, if needed, fix fetchPulseSessions\' shared .limit(60) (scripts/fleet-worker-pulse.mjs:44) so a quiet-dead host cannot be silently truncated out of the pager chain\'s result set by a noisy live host.',
    description: 'fetchPulseSessions applies ONE .limit(60) across ALL hosts combined. Once any per-host reasoning touches this query (directly, or indirectly via FR-1\'s threshold work sharing the same session population), a host with zero recent activity could have its rows pushed out of the top-60 by a busy host\'s rows, making it invisible to the pager chain entirely -- the exact class of outage this SD exists to catch.',
    priority: 'HIGH',
    acceptance_criteria: [
      'Live session-count measurement is taken (SELECT count(*) FROM claude_sessions WHERE heartbeat_at > now() - interval matching the pulse window) to determine whether 60 is currently safe',
      'If measurement shows real risk, the query is corrected to either raise the limit well above the measured concurrent-session ceiling or become host-aware (per-host fetch) instead of one global LIMIT',
      `A regression test seeds 61+ rows across 2 hosts (one host's rows deliberately made numerous) and asserts the quiet host's row still appears in the result set`,
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Design and implement explicit suppression/ordering between the new per-host checkFleetDeadMan arm and the 2 existing global arms (checkWorkerFleetDown, checkDeadCoordinator) so today\'s single-live-host reality does not triple-page for one outage.',
    description: 'Today only Legion-Laptop has live population, so "host down" (per-host arm) and "fleet down" (global arms) are the SAME event. Without explicit coordination, this SD would ship 3 independently-firing pagers for what is currently always one outage. checkWorkerFleetDown and checkDeadCoordinator are NOT modified by this SD (out of scope); the coordination must live in how checkFleetDeadMan\'s host-scoped verdict interacts with the send/dedup decision, not in changing the other 2 arms.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'A documented, tested rule states which arm pages and which is suppressed (or both page with distinguishable messages) when a single-host outage trips more than one arm simultaneously',
      'runAlertArms\' existing isolation (scripts/fleet-down-alert.mjs:455-486, each arm independently caught/reported) is preserved -- the coordination is a decision INSIDE checkFleetDeadMan\'s own send logic, not a change to the arm-isolation harness',
      'A test simulating today\'s single-host-down state confirms the actual number of chairman SMS sends matches the documented rule (not 3 independent pages)',
    ],
  },
  {
    id: 'FR-6',
    requirement: 'Document checkFleetDeadMan\'s and the freeze/pager chain\'s complementary, non-overlapping roles directly in code comments, so a future SD does not read them as redundant.',
    description: 'checkFleetDeadMan is a heartbeat-writer/host-death signal (rows persist -- 13,110 of them; a frozen-but-heartbeating seat keeps this arm reading alive). The freeze/pager chain (checkWorkerFleetDown via liveFleetWorkers/classifySeat) is the row-present-but-clock-frozen signal. Neither "total row absence" framing from this SD\'s own earlier LEAD-phase draft was correct (validation-agent finding F4) -- rows never vanish; distinguish by WHAT each arm actually reads (heartbeat presence vs. last_tool_at freshness), not by row existence.',
    priority: 'LOW',
    acceptance_criteria: [
      'A docblock comment above checkFleetDeadMan and above checkWorkerFleetDown/liveFleetWorkers states the corrected division of labor (heartbeat-writer-death vs. clock-frozen-while-present), cross-referencing each other by function name',
      'Existing checkFleetDeadMan tests remain green, unmodified in assertions (only comments change for this FR)',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'FREEZE_CUT_MINUTES remains a single, shared constant read identically by all 3 known call sites (fleet-worker-pulse.mjs, drive-state/axes/fleet-health.cjs, fleet-dashboard.cjs). A pager-only fork requires explicit written justification in the PR description, not a silent divergence.',
    rationale: 'validation-agent (826bb1f9) confirmed a 3-site shared constant; forking it would let the same seat disagree across instruments, reproducing the exact class of drift this codebase\'s memory system already flags (INSTRUMENTS THAT LIE).',
  },
  {
    id: 'TR-2',
    requirement: 'classifySeat\'s cutPointMinutes stays a REQUIRED function parameter with no in-code default (lib/fleet/stuck-seat-predicate.cjs unchanged). The new calibration value is supplied via FLEET_FREEZE_CUT_MINUTES / the FREEZE_CUT_MINUTES fallback constant, never hardcoded as a new default inside classifySeat itself.',
    rationale: 'The existing "no uncalibrated default" refusal (stuck-seat-predicate.cjs:96-101) is a deliberate design discipline against exactly the mistake this SD\'s original false premise almost repeated -- preserve it.',
  },
  {
    id: 'TR-3',
    requirement: 'Host exclusion for GROUP BY hostname uses a pattern match for ephemeral Actions runners (/^runnervm/i) plus an explicit denylist for known test-fixture hostnames and a NULL check -- not a hardcoded allowlist of "real" hostnames, which would need updating every time a new legitimate host (e.g. the cloud pilot P2 host) comes online.',
    rationale: 'Live measurement: 12 distinct hostnames, only 1 live in production today; an allowlist approach would need manual updating for the cloud pilot this SD is explicitly meant to future-proof for (per the Solomon constraint\'s own "cloud pilot P2 precondition" framing).',
  },
  {
    id: 'TR-4',
    requirement: 'recordFleetDeadManVerdict\'s host-scoped mode must scope BOTH the read (.eq on the payload host field) and the write (payload includes host) -- a write-only host field is strictly worse than no host field at all, since it looks host-aware while still reading global state.',
    rationale: 'Explore sub-agent (9f22f3c4) and validation-agent independently confirmed the current .limit(1) read has zero host filter; adding host only to the write is the specific failure mode a partial fix would introduce.',
  },
  {
    id: 'TR-5',
    requirement: 'fetchPulseSessions\' LIMIT behavior is resolved via a LIVE measurement of concurrent claude_sessions rows within the pulse window before choosing a fix, not assumed safe or assumed broken.',
    rationale: 'The .limit(60) shared-cap risk is real but its actual severity depends on current concurrency, which changes as the fleet scales -- measure before mitigating (mirrors the "CAP≠POP" gotcha: a capped fetch grouped in memory only ever measures the cap).',
  },
];

const system_architecture = {
  overview: 'This SD modifies two existing files (lib/fleet/genuine-worker.mjs for the shared threshold constant; scripts/fleet-down-alert.mjs for checkFleetDeadMan\'s host-awareness and recordFleetDeadManVerdict\'s host-scoped dedup) plus one query in scripts/fleet-worker-pulse.mjs (fetchPulseSessions\' LIMIT). No new files, no new tables, no new cron jobs -- this is a recalibration and extension of an already-shipped 3-arm alert system (checkWorkerFleetDown, checkDeadCoordinator, checkFleetDeadMan) running in scripts/fleet-down-alert.mjs via fleet-down-alert-cron.yml.',
  components: [
    { name: 'FREEZE_CUT_MINUTES (recalibrated)', responsibility: 'Shared staleness threshold read by classifySeat\'s callers across 3 sites; determines how long a seat can go silent before being classified STUCK', technology: 'Node.js constant + env override (lib/fleet/genuine-worker.mjs)' },
    { name: 'checkFleetDeadMan (host-aware)', responsibility: 'Groups its zero-heartbeat / zero-completions verdict by hostname, filtered to real hosts only, writing per-host system_events rows', technology: 'Node.js (scripts/fleet-down-alert.mjs), Supabase (claude_sessions, strategic_directives_v2, system_events)' },
    { name: 'recordFleetDeadManVerdict (host-scoped dedup)', responsibility: 'Reads/writes the prior edge-trigger state scoped by host so hosts cannot clobber each other\'s alarm-transition detection', technology: 'Supabase system_events table' },
    { name: 'fetchPulseSessions (limit-corrected)', responsibility: 'Supplies the session population used to compute fleet_worker_pulse.active_count; corrected so a global cap cannot mask a quiet-dead host', technology: 'Node.js (scripts/fleet-worker-pulse.mjs), Supabase claude_sessions' },
  ],
  data_flow: 'A GitHub Actions cron (fleet-down-alert-cron.yml, ~15min) invokes scripts/fleet-down-alert.mjs main(), which runs 3 isolated arms via runAlertArms(). checkFleetDeadMan queries claude_sessions (heartbeat_at, hostname) and strategic_directives_v2 (completion_date) grouped by hostname, compares each host\'s verdict against its own last-recorded system_events row (recordFleetDeadManVerdict, now host-scoped), and on an alive->dead transition for any host calls sendChairmanSMS. Separately, scripts/fleet-worker-pulse.mjs runs on its own cadence, computing fleet_worker_pulse.active_count from claude_sessions via liveFleetWorkers/classifySeat (using the recalibrated FREEZE_CUT_MINUTES), which checkWorkerFleetDown consumes for its own, unmodified-by-this-SD alerting path.',
  integration_points: [
    'claude_sessions (hostname, heartbeat_at, last_tool_at, loop_state columns)',
    'strategic_directives_v2 (completion_date, status=completed)',
    'system_events (fleet_dead_man_verdict event_type, now host-scoped)',
    'sendChairmanSMS (lib/comms/adam-outbound/chairman-sms-gate/index.js) -- unmodified interface, called with the same message shape plus a host-qualified body',
    'lib/governance/drive-state/axes/fleet-health.cjs and scripts/fleet-dashboard.cjs -- read the SAME recalibrated FREEZE_CUT_MINUTES, must not diverge',
  ],
};

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Replay the real 19:20-19:29Z 5-seat freeze shape (synthetic fixture: last_tool_at frozen/stale, loop_state=active, heartbeat_at fresh) against the actual liveFleetWorkers -> active_count -> evaluateFleetDownAlert chain, comparing OLD vs NEW threshold',
    test_type: 'unit',
    given: 'A synthetic session-row fixture matching the incident narrative (5 named seats, last_tool_at frozen across two samples, loop_state=active, heartbeat_at advancing every ~30s) and the OLD (120min+3x15min) and NEW recalibrated threshold configs',
    when: 'The chain is run against the fixture under each threshold config',
    then: 'The OLD threshold reproduces the measured ~166-181min first-page latency; the NEW threshold pages materially faster on the identical fixture',
  },
  {
    id: 'TS-2',
    scenario: 'A healthy fixture (fresh last_tool_at, fresh heartbeat_at, normal completions) never trips the alarm under the new recalibrated threshold',
    test_type: 'unit',
    given: 'All session rows have last_tool_at and heartbeat_at within the last few minutes',
    when: 'The chain is evaluated',
    then: 'No alarm fires (negative control, guards against the recalibration over-tightening into false positives)',
  },
  {
    id: 'TS-3',
    scenario: 'A 2-host fixture, one host all-stale and one host healthy, produces a per-host down-verdict only for the stale host',
    test_type: 'unit',
    given: 'Two distinct hostnames in the session fixture, one with all-stale last_tool_at / zero recent heartbeats, one fully healthy',
    when: 'checkFleetDeadMan evaluates the fixture',
    then: 'A down verdict is recorded for the stale host only; the healthy host is not falsely flagged and does not mask the stale host\'s verdict',
  },
  {
    id: 'TS-4',
    scenario: 'Ephemeral runnervm*, test-fixture, and NULL hostname rows never form a persistent alarm group',
    test_type: 'unit',
    given: 'Session rows seeded with hostnames matching runnervm*, known test-fixture names, and NULL, alongside one real host',
    when: 'checkFleetDeadMan groups by hostname',
    then: 'Zero alarm groups form for the excluded categories; only the real host is evaluated',
  },
  {
    id: 'TS-5',
    scenario: 'Per-host edge-trigger dedup: Host A transitioning dead->alive does not affect Host B\'s own transitioned flag on the same run',
    test_type: 'unit',
    given: 'Two hosts, both previously recorded as dead in system_events; Host A\'s current sweep shows it recovered (alive), Host B\'s sweep shows it is still dead',
    when: 'recordFleetDeadManVerdict runs for both hosts in the same tick',
    then: 'Host A is recorded transitioned=true (dead->alive, suppressing any stale re-page); Host B is recorded transitioned=false (still dead, already alerted) -- neither host\'s read is contaminated by the other\'s row',
  },
  {
    id: 'TS-6',
    scenario: 'A quiet-dead host is not truncated out of fetchPulseSessions\' result by a noisy live host once the shared LIMIT is exercised at realistic scale',
    test_type: 'integration',
    given: '61+ synthetic session rows across 2 hosts, with one host contributing the bulk of rows (noisy) and the other host contributing exactly 1 stale row (quiet-dead)',
    when: 'fetchPulseSessions runs with the corrected limit/host-awareness',
    then: 'The quiet-dead host\'s row is present in the result set and is not silently dropped',
  },
  {
    id: 'TS-7',
    scenario: 'A system_events write/read failure during the host-scoped verdict recording fails OPEN (treats it as a transition) rather than silently swallowing a real per-host outage',
    test_type: 'unit',
    given: 'A Supabase client double that returns an error on the system_events read for one host',
    when: 'recordFleetDeadManVerdict is called for that host',
    then: 'The function returns transitioned:true (fail-open, matching the existing global-mode behavior) and logs the failure loudly, never silently suppressing a page for that host',
  },
];

const acceptance_criteria = [
  'A synthetic replay of the real 19:20-19:29Z 5-seat freeze shape demonstrably pages faster under the recalibrated threshold than the current shipped ~166-181min chain, verified against the actual liveFleetWorkers -> active_count -> evaluateFleetDownAlert chain (not the unrelated checkFleetDeadMan arm)',
  'Per-host system_events verdict rows are visible off-host, correctly scoped on both read and write, with a dedicated test proving two hosts cannot clobber each other\'s edge-trigger dedup state',
  'Ephemeral (runnervm*), test-fixture, and NULL hostnames never form a persistent alarm group (unit test with live-measured hostname categories)',
  'fetchPulseSessions\' shared .limit(60) is verified safe (via live measurement) or corrected so a quiet-dead host cannot be truncated out by a noisy live host',
  'An explicit, tested suppression/ordering rule exists between the new per-host arm and the 2 existing global arms, preventing unbounded triple-paging for today\'s single-host reality',
  'checkFleetDeadMan\'s and the freeze/pager chain\'s complementary roles are documented in code comments with the corrected framing (heartbeat-writer-death vs. clock-frozen-while-present)',
  'FREEZE_CUT_MINUTES remains identical across all 3 read sites (pager, drive-health axis, dashboard) -- no silent divergence introduced',
];

const risks = [
  {
    risk: 'A tightened FLEET_FREEZE_CUT_MINUTES introduces false-positive pages for seats doing legitimate long-running work (slow npm install, long test suite)',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'Corroborate the LEAD-phase n=33 false-positive sample with a larger EXEC-phase sample (target n>=50) before locking a threshold value; respect classifySeat\'s existing no-uncalibrated-default discipline',
    rollback_plan: 'Revert FLEET_FREEZE_CUT_MINUTES to unset (falls back to the pre-SD 120min default) via a single env var change -- no code rollback required since the constant itself is unchanged in shape, only its configured value',
  },
  {
    risk: 'Naive GROUP BY hostname pages on every tick for ephemeral GitHub-Actions runner hosts or test fixtures that are correctly, permanently absent',
    probability: 'HIGH',
    impact: 'HIGH',
    mitigation: 'Exclude runnervm*, test-fixture hostnames, and NULL hostnames at the query -- confirmed via live measurement: 12 distinct hostnames total, only 1 (Legion-Laptop) has live production population',
    rollback_plan: 'Disable the hostname filter/grouping via a feature flag that falls back to checkFleetDeadMan\'s pre-SD global-only behavior; the filter logic is additive and isolated to one function',
  },
  {
    risk: 'Adding a host dimension to the existing edge-trigger dedup without correcting its single-global-row limit(1) READ scrambles per-host alarm state across hosts',
    probability: 'HIGH',
    impact: 'MEDIUM',
    mitigation: 'Scope the READ by host (.eq on the payload host field) to match the WRITE, verified by a dedicated multi-host dedup test (TS-5)',
    rollback_plan: 'Revert recordFleetDeadManVerdict to its pre-SD global-only read/write (a single function, easily reverted in isolation)',
  },
  {
    risk: 'fetchPulseSessions\' shared .limit(60) could silently truncate a quiet-dead host\'s rows out of the result set once per-host reasoning is introduced elsewhere in the system',
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation: 'Measure live concurrent session counts before choosing between raising the limit or making the query host-aware; verified by TS-6 at realistic scale',
    rollback_plan: 'Revert the limit/query change to its pre-SD value; this is a single-line change in fetchPulseSessions, trivially revertible',
  },
  {
    risk: 'Once a per-host arm exists alongside the 2 existing global arms, today\'s single-live-host reality makes "host down" and "fleet down" the same event, and unspecified suppression/ordering causes triple-paging by default',
    probability: 'HIGH',
    impact: 'MEDIUM',
    mitigation: 'Design and test an explicit suppression rule (FR-5) rather than shipping 3 independently-firing pagers for what is currently always the same outage',
    rollback_plan: 'Disable the new per-host arm\'s SMS-send path (keep verdict-writing only) via the existing DRY-run flag pattern already used elsewhere in fleet-down-alert.mjs, while the suppression rule is revisited',
  },
];

const implementation_approach = {
  phases: [
    {
      phase: 'Phase 1: Threshold recalibration',
      description: 'Measure a larger false-positive sample (n>=50) of legitimate parked/long-running silence, choose and document a recalibrated FREEZE_CUT_MINUTES value, verify it reads identically at all 3 call sites',
      deliverables: ['Documented calibration sample and chosen threshold value', 'Confirmation test that all 3 call sites observe the same value'],
    },
    {
      phase: 'Phase 2: Per-host checkFleetDeadMan',
      description: 'Add hostname grouping with the runnervm*/test-fixture/NULL exclusion filter to checkFleetDeadMan, fix recordFleetDeadManVerdict\'s read/write host scoping, verify/fix fetchPulseSessions\' shared limit, design the cross-arm suppression rule',
      deliverables: ['Host-aware checkFleetDeadMan with filtered grouping', 'Host-scoped recordFleetDeadManVerdict', 'fetchPulseSessions limit verification/fix', 'Documented suppression rule between arms'],
    },
    {
      phase: 'Phase 3: Regression-latency proof + documentation',
      description: 'Build the synthetic 19:20-19:29Z replay fixture, extend the existing fleet-down-pager-freeze-reachability.test.js projecting-fake pattern, prove old-vs-new latency, add the corrected checkFleetDeadMan/freeze-chain division-of-labor comments',
      deliverables: ['Regression-latency test (TS-1/TS-2)', 'Full test suite (TS-1 through TS-7)', 'Corrected docblock comments'],
    },
  ],
  technical_decisions: [
    'Recalibrate the SHARED FREEZE_CUT_MINUTES constant rather than forking a pager-only threshold, to avoid the same seat disagreeing across 3 consuming instruments',
    'Target checkFleetDeadMan (not the separate freeze/pager chain) for GROUP-BY-HOST, since the Solomon binding constraint literally names "the dead-man predicate"',
    'Ship the cause-classifier as an injectable seam with a best-effort default, not a fully-engineered off-host reachability system -- no reusable off-host reachability module exists yet in this codebase',
    'Do NOT re-implement last_tool_at vs heartbeat signal selection -- SD-LEO-INFRA-FLEET-DOWN-PAGER-001 already shipped that correctly; re-keying it would be a pure regression',
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'Chairman (via SMS page)', interaction: 'Receives a fleet-down-alert SMS through sendChairmanSMS when checkFleetDeadMan or another arm trips', frequency: 'Only on an alive->dead transition (edge-triggered), not every tick' },
    { name: 'Coordinator / Adam (via system_events query)', interaction: 'Reads fleet_dead_man_verdict rows in system_events to audit alarm history and per-host state', frequency: 'On-demand during incident review or routine health checks' },
    { name: 'fleet-dashboard.cjs and drive-state fleet-health axis', interaction: 'Read the same FREEZE_CUT_MINUTES constant to classify seat health for display/scoring purposes, independent of the alert pager itself', frequency: 'Every dashboard render / drive-score computation' },
  ],
  dependencies: [
    { name: 'fleet-down-alert-cron.yml (GitHub Actions, ~15min cadence)', type: 'upstream', contract: 'Invokes scripts/fleet-down-alert.mjs main() on schedule', failure_mode: 'A missed/failed cron run delays detection by one cycle; unrelated to this SD\'s scope (existing infra)' },
    { name: 'sendChairmanSMS (lib/comms/adam-outbound/chairman-sms-gate/index.js)', type: 'downstream', contract: 'Called with the same {type, body, kind, dedupeKey} message shape, unmodified interface', failure_mode: 'Existing fail-safe behavior preserved (ET-default zone resolution, no throw on send failure)' },
    { name: 'claude_sessions / strategic_directives_v2 / system_events (Supabase)', type: 'downstream', contract: 'Read/write via the existing Supabase client patterns already used in fleet-down-alert.mjs', failure_mode: 'Query failures are caught and logged, existing fail-open discipline (TS-7) preserved and extended to host-scoped paths' },
  ],
  data_contracts: [
    { contract_name: 'system_events.payload for fleet_dead_man_verdict', schema: 'Existing {state, reason, transitioned} shape gains an additive "host" key -- backward compatible, existing consumers reading state/reason/transitioned are unaffected', validation: 'Insert-time only (no CHECK constraint on payload JSONB); correctness enforced by the new host-scoped read/write tests', versioning: 'Additive field, no migration needed' },
  ],
  runtime_config: {
    environment_variables: ['FLEET_FREEZE_CUT_MINUTES (existing, value recalibrated by this SD)'],
    feature_flags: ['Optional: a host-grouping enable flag if a staged rollout is preferred over a direct cutover (implementation detail, decided in EXEC)'],
    deployment_considerations: 'No new deployment steps -- this is a direct code change to an already-scheduled GitHub Actions cron script; no migration, no new service, no new schedule',
  },
  observability_rollout: {
    monitoring: ['system_events rows with event_type=fleet_dead_man_verdict, watching for the new host key populated correctly post-deploy', 'fleet-down-alert-cron.yml run logs for the new per-host log lines'],
    alerts: ['A per-host down transition triggers the existing sendChairmanSMS path (now host-qualified)'],
    rollout_strategy: 'Direct deploy via normal PR merge -- this is a cron script, not a phased frontend rollout',
    rollback_trigger: 'Unexpected page volume increase (more than 1 page per genuine single-host outage) or a confirmed false-positive spike after threshold recalibration',
    rollback_procedure: 'Revert the merge commit (single PR, isolated to 2-3 files) or, for the threshold specifically, revert the FLEET_FREEZE_CUT_MINUTES env value alone without a code rollback',
  },
};

const exploration_summary = {
  files_read: [
    'scripts/fleet-down-alert.mjs',
    'lib/fleet/genuine-worker.mjs',
    'lib/fleet/stuck-seat-predicate.cjs',
    'scripts/fleet-worker-pulse.mjs',
    'lib/fleet/freeze-detector.cjs',
    'tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js',
    'tests/unit/fleet-down-alert.test.js',
    'lib/governance/drive-state/axes/fleet-health.cjs',
  ],
  patterns_identified: [
    'Shared-constant discipline: FREEZE_CUT_MINUTES is read identically by 3 sites; forking it for one consumer would reintroduce the class of cross-instrument disagreement this codebase\'s own memory system flags',
    'Projecting-fake test pattern: fleet-down-pager-freeze-reachability.test.js\'s fake actually applies select(cols) column projection, so a new column must flow through the same exported constant or production silently drops it while tests stay green',
    'Host-cardinality filtering necessity: live measurement showed 12 distinct hostnames with only 1 live -- any GROUP BY hostname design must filter before grouping, not after',
    'Fail-open dedup discipline: recordFleetDeadManVerdict already fails open (transitioned:true) on read/write errors; host-scoping must preserve this, not introduce a new fail-closed path',
  ],
  key_decisions: [
    'Target checkFleetDeadMan (not the separate freeze/pager chain) for GROUP-BY-HOST, per the Solomon constraint\'s literal text naming "the dead-man predicate"',
    'Recalibrate the shared FREEZE_CUT_MINUTES constant rather than introducing a pager-specific override',
    'Do not re-implement last_tool_at vs heartbeat signal selection -- already correctly shipped by a predecessor SD; re-keying would be a regression',
    'Ship the cause-classifier (host-dead vs session-limit-frozen) as an injectable seam only, since no off-host reachability module exists yet to build on',
  ],
  exploration_date: '2026-08-21',
};

async function main() {
  const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();
  if (existing) {
    console.error(`PRD ${PRD_ID} already exists -- refusing to blindly overwrite. Inspect first.`);
    process.exit(1);
  }

  const row = {
    id: PRD_ID,
    sd_id: SD_ID,
    directive_id: SD_KEY,
    title: 'Fleet-down alert v2: close the ~3h freeze-detection latency gap + ship the missed GROUP-BY-HOST binding constraint',
    status: 'approved',
    category: 'infrastructure',
    priority: 'high',
    executive_summary,
    functional_requirements,
    technical_requirements,
    system_architecture,
    test_scenarios,
    acceptance_criteria,
    risks,
    implementation_approach,
    integration_operationalization,
    exploration_summary,
    metadata: {
      lead_evidence: {
        testing_agent: '71955e26-f9e8-4e17-a7eb-dde8b6878d79',
        explore_agent: '9f22f3c4-007c-43c9-bb6a-87dfd37b6497',
        validation_agent: '826bb1f9-c25b-4931-a94f-804ff34ea45f',
      },
      design_analysis: { verdict: 'CONDITIONAL_PASS', confidence: 60, note: 'infrastructure SD, no UI validation applicable; HIGH-severity repo-probe warning is a known artifact of the non-UI probe path' },
      database_analysis: { verdict: 'PASS', confidence: 100, note: 'No migrations needed -- this SD makes no schema changes' },
      risk_analysis: { verdict: 'PASS', confidence: 85, overall_risk_score: 2.67, note: 'The sub-agent\'s generic "Data Migration: HIGH" sub-score is a keyword-match false-positive (constraint/trigger/view text mentions in scope prose describing EXISTING code, not a planned migration) -- DATABASE sub-agent authoritatively confirmed zero migrations needed' },
    },
  };

  const { data, error } = await supabase.from('product_requirements_v2').insert(row).select('id, sd_id, status').single();
  if (error) { console.error('INSERT FAILED:', error.message); process.exit(1); }
  console.log('PRD inserted:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
