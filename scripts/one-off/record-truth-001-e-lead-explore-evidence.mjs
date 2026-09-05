#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E, LEAD-TO-PLAN phase.
 *
 * Records the release-path census actually performed: every claude_sessions writer that sets
 * status to a terminal/stale value or stamps stale_at, checked for whether it also writes
 * is_alive:false in the same statement (FR-1's binding requirement). The SD's own scope text named
 * 4 classes (STALE_CLEANUP, release-claim, retire, guard retire); this census found ~24 distinct
 * write sites across ~15 files plus 5 Postgres RPC bodies -- materially broader than the scope
 * text's own framing, with exactly ONE correct writer found in the whole repo.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';

const findings = [
  {
    id: 'finding-1-headline-24-writers-1-correct',
    severity: 'HIGH',
    summary: 'Across ~24 distinct write sites (JS .update() calls, one raw REST PATCH, and 5 Postgres RPC function bodies) that set claude_sessions.status to a terminal/stale value or stamp stale_at, exactly ONE also writes is_alive:false in the same statement: scripts/stale-session-sweep.cjs:3241-3260 (the dead-session-eviction writer, reasons SWEEP_PID_DEAD/SWEEP_HARD_CAP_20M). Every other writer -- including the single shared helper releaseClaimBothSurfaces() that most production callers route through -- omits is_alive entirely. is_alive itself is written ONLY by lib/heartbeat-manager.mjs setIsAlive(), which never touches status/stale_at in either direction. Two structurally disjoint writer sets that never coordinate is the root defect shape, not any single buggy call site.',
  },
  {
    id: 'finding-2-shared-primitive-root-cause',
    severity: 'HIGH',
    summary: 'lib/claim/release-claim-both-surfaces.mjs:214-226 releaseClaimBothSurfaces() -- the shared dual-surface release primitive most production callers route through -- sets status:sessionStatus (defaults to \'released\') with no is_alive. Confirmed callers that retire (not merely unclaim) through this path with no override: lib/claim-validity-gate.js:537-542 (Layer-2 dead/foreign-claim auto-release, hit on essentially every claim_sd/handoff acquisition against a foreign claim) and scripts/coordinator-cold-recovery.cjs:112-116. Fixing this ONE helper closes the highest-traffic gap.',
  },
  {
    id: 'finding-3-sweep-10-writers-9-wrong',
    severity: 'HIGH',
    summary: 'scripts/stale-session-sweep.cjs (the autonomous ~5min-cadence fleet sweep) alone contains 10 distinct claude_sessions release/stale writers at lines 1562-1574, 1650-1662, 2799-2802, 3241-3260 (the one correct writer), 3371-3383, 3618-3631, 3657-3670, 3686-3699, 3721-3736, 3754-3770. Writer #9 (3371-3383, SWEEP_CONFLICT_RESOLUTION) is notable: it evicts a claimant judged unfit to hold the seat -- the same judgment call as the correct writer at 3241-3260 -- yet omits is_alive, an internal inconsistency within the same file.',
  },
  {
    id: 'finding-4-session-tick-bypasses-supabase-js',
    severity: 'MEDIUM_HIGH',
    summary: 'scripts/session-tick.cjs:615-646 releaseRowOnExitBestEffort() uses a raw REST fetch() PATCH to claude_sessions on every session-tick daemon graceful exit, bypassing supabase-js .from(\'claude_sessions\') entirely. A census keyed on that call shape alone would silently miss this writer -- likely the highest-frequency trigger of all, since it fires on ordinary session-tick shutdown, not just error/sweep paths. is_alive: N.',
  },
  {
    id: 'finding-5-rpc-bodies-five-functions',
    severity: 'HIGH',
    summary: 'Five Postgres RPC functions read in full from their migration files also write status/stale_at with no is_alive: create_or_replace_session (auto-replace branch, status=released), release_session (status=released), cleanup_stale_sessions (two-phase: stale then released -- the literal STALE_CLEANUP named in scope), report_pid_validation_failure (status=stale, supersedes the 20260509 body with a fresh-heartbeat refusal check but the write itself is unchanged). release_sd and release_sd_by_key set status=idle (unclaim, not retire) and switch_sd_claim never touches these columns -- correctly out of FR-1 scope.',
  },
  {
    id: 'finding-6-mirror-defect-in-heartbeat-manager',
    severity: 'INFO',
    summary: 'lib/heartbeat-manager.mjs:314-329 setIsAlive() is the sole is_alive writer in the repo and never touches status/stale_at. This is the structural mirror of FR-1\'s gap: a graceful stopHeartbeat() (:251) flips is_alive:false while status stays active/idle indefinitely, the inverse of a status-terminal writer leaving is_alive:true. Not in this SD\'s FR-1 scope (FR-1 is specifically "release paths write is_alive:false", i.e. the status-writer side of the mirror), flagged for a possible future follow-up.',
  },
  {
    id: 'finding-7-fr2-fr3-claims-confirmed-exact',
    severity: 'HIGH',
    summary: 'FR-2\'s cited defect (lib/fleet/session-liveness.cjs isSessionAlive():167-175) confirmed exact: line 169 `if (session.is_alive === true) return {alive:true, reason:\'raw_is_alive\'}` fires unconditionally before any status/stale_at check. FR-3\'s cited defect (lib/fleet/best-effort-release.mjs clearAndReopenQf():246-266) confirmed exact: line 254 `.filter(\'status\',\'eq\',\'in_progress\')` means a QF at status=open with a non-null claiming_session_id never matches this UPDATE predicate and the function returns {changed:false} silently -- this is a quick_fixes-table gap, orthogonal to is_alive (different table), correctly scoped as its own FR.',
  },
];

const warnings = [
  'The census found ~24 write sites, materially more than the 4 classes named in the SD scope text (STALE_CLEANUP, release-claim, retire, guard retire) -- FR-1\'s "a census enumerates the writers and each is covered by a test" requirement should use THIS census (or a re-run of the same discovery method) as its basis, not just the 4 named classes, or 20 writers will ship unfixed while FR-4\'s scheduled check still asserts zero.',
  'scripts/session-tick.cjs\'s raw REST PATCH writer will not be caught by a grep/search keyed on `.from(\'claude_sessions\')` -- PLAN should ensure the FR-1 implementation approach and FR-4\'s census-completeness test account for non-supabase-js write paths.',
];

const recommendations = [
  'PLAN should prioritize the highest-traffic writers first if FR-1 is split across multiple commits within one PR: releaseClaimBothSurfaces() (shared primitive, highest call fan-in), scripts/session-tick.cjs (highest frequency, non-standard write shape), then the RPC bodies (require a new migration), then the remaining ~15 lower-frequency JS call sites.',
  'FR-4\'s CI test (the e60956f5 shape: status released, is_alive true, heartbeat 8h old, PID absent) and FR-5\'s backfill should both be written against the corrected reader (FR-2) and the corrected release paths (FR-1) together, not independently, since FR-4\'s exit predicate (zero contradicted rows) can only pass once FR-1\'s writers are actually fixed.',
];

const summary = 'Explore-phase discovery for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: a very-thorough census of every claude_sessions write path that sets a terminal/stale status or stamps stale_at, checked for is_alive:false co-writing. Found ~24 distinct write sites across ~15 JS/CJS files, one raw REST PATCH bypassing supabase-js, and 5 Postgres RPC function bodies -- exactly ONE (scripts/stale-session-sweep.cjs:3241-3260) already writes is_alive:false correctly. Independently re-verified all three of the SD\'s own cited code claims (session-liveness.cjs:167-175, stale-session-sweep.cjs:1324, best-effort-release.mjs:254) as exact. The scope is real and well-grounded but materially broader in raw writer-count than the SD\'s own scope text\'s 4 named classes.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/fleet/session-liveness.cjs',
        'scripts/stale-session-sweep.cjs',
        'lib/fleet/best-effort-release.mjs',
        'lib/claim/release-claim-both-surfaces.mjs',
        'lib/claim-validity-gate.js',
        'scripts/coordinator-cold-recovery.cjs',
        'lib/coordinator/singleton-refresh-sequencer.cjs',
        'scripts/session-tick.cjs',
        'lib/session-manager.mjs',
        'scripts/hooks/session-register.cjs',
        'lib/sessions/rotation-closure.cjs',
        'lib/fleet/spawn-control.js',
        'scripts/cancel-sd.js',
        'scripts/reconcile-seats.mjs',
        'scripts/assert-daemon-census.mjs',
        'lib/heartbeat-manager.mjs',
        'database/migrations/20260509_layer1_claiming_session_id_release_parity.sql',
        'database/migrations/20260904_report_pid_validation_failure_heartbeat_refusal.sql',
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'database/migrations/20260902_release_sd_by_key.sql',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
