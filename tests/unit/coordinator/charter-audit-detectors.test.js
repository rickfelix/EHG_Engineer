/**
 * SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001 — pure charter-audit detector tests.
 * Pins: fail-loud foundational query; authoritative liveness (heartbeat|armed-silence|PID); DUTY-3 idle+work
 * with pending-assignment suppression; completed-dep NO-false-block (unknown dep -> ANOMALY); backlog-rank
 * staleness; QUIET-TICK committed-action; and the durable STANDARD_LOOPS entry.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyLiveness, detectIdleWithWork, detectDependencyHealth, detectWorktreePool,
  detectBacklogRankStaleness, detectQuietTickUnverified, foundationalQueryError, summarizeViolations,
  extractDepKey, resolveWorktreeCount, computeDispatchBelt, detectCrossRepoStarvation,
  detectAutoRefillBacklog, detectInProgressOrphans, detectUnstampedModel,
} from '../../../lib/coordinator/charter-audit-detectors.mjs';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';

const NOW = 1_750_000_000_000;
const TERMINAL = new Set(['completed', 'cancelled', 'archived', 'deferred']);
const ago = (ms) => new Date(NOW - ms).toISOString();
const withinArmed = (until, now) => { const d = until ? new Date(until).getTime() - now : -1; return d > 0 && d <= 30 * 60 * 1000; };

describe('foundationalQueryError — fail-loud (FR-4)', () => {
  it('returns a QUERY_ERROR marker on a real error (never silent)', () => {
    const m = foundationalQueryError({ message: 'column x does not exist' }, 'strategic_directives_v2');
    expect(m).toContain('QUERY_ERROR');
    expect(m).toContain('strategic_directives_v2');
    expect(m).toContain('column x does not exist');
  });
  it('returns null when there is no error', () => {
    expect(foundationalQueryError(null, 'claude_sessions')).toBeNull();
  });
});

describe('classifyLiveness — authoritative liveness (FR-2)', () => {
  const ctx = { nowMs: NOW, staleThresholdMs: 5 * 60 * 1000, isWithinArmedSilence: withinArmed, isPidAlive: (s) => s.session_id === 'pid-alive' };
  it('fresh heartbeat -> alive (heartbeat)', () => {
    expect(classifyLiveness({ heartbeat_at: ago(60_000) }, ctx)).toEqual({ alive: true, reason: 'heartbeat' });
  });
  it('stale heartbeat but in-window armed-silence -> alive (armed_silence) — long-EXEC worker not idle/dead', () => {
    const r = classifyLiveness({ heartbeat_at: ago(20 * 60_000), expected_silence_until: ago(-10 * 60_000) }, ctx);
    expect(r).toEqual({ alive: true, reason: 'armed_silence' });
  });
  it('stale heartbeat + no silence but a live PID -> alive (pid)', () => {
    const r = classifyLiveness({ heartbeat_at: ago(20 * 60_000), session_id: 'pid-alive' }, ctx);
    expect(r).toEqual({ alive: true, reason: 'pid' });
  });
  it('stale heartbeat + no signal -> NOT alive', () => {
    expect(classifyLiveness({ heartbeat_at: ago(20 * 60_000), session_id: 'dead' }, ctx).alive).toBe(false);
  });
  it('a RELEASED session with a FRESH heartbeat -> NOT alive (lifecycle status is authoritative-dead first)', () => {
    const r = classifyLiveness({ status: 'released', heartbeat_at: ago(31_000), session_id: 'released-but-fresh' }, ctx);
    expect(r).toEqual({ alive: false, reason: 'lifecycle_terminated' });
  });
});

describe('resolveWorktreeCount — fail-loud on git silent-failure (FR-3/FR-4)', () => {
  it('git=0 while the filesystem shows worktree dirs -> -1 (git failed; fail-loud, never silent 0)', () => {
    expect(resolveWorktreeCount({ gitCount: 0, fsDirCount: 5 })).toBe(-1);
  });
  it('git matches the fs -> the git count; genuinely-empty -> 0', () => {
    expect(resolveWorktreeCount({ gitCount: 7, fsDirCount: 7 })).toBe(7);
    expect(resolveWorktreeCount({ gitCount: 0, fsDirCount: 0 })).toBe(0);
  });
});

describe('computeDispatchBelt — canonical dispatch-eligibility (FR-3/FR-5)', () => {
  const classify = (s) => (s.sd_type === 'orchestrator' ? 'orchestrator_parent' : (s.metadata && s.metadata.requires_human_action ? 'human_action_required' : null));
  it('an orchestrator PARENT is excluded from unclaimed + claimable (never recommended for dispatch)', () => {
    const sds = [
      { sd_key: 'SD-PARENT-001', sd_type: 'orchestrator', claiming_session_id: null, parent_sd_id: null, dependencies: [] },
      { sd_key: 'SD-LEAF-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: null, dependencies: [] },
    ];
    const r = computeDispatchBelt({ sds, statusByKey: {}, terminalSet: TERMINAL, classifyIneligibility: classify });
    expect(r.unclaimed.map((s) => s.sd_key)).toEqual(['SD-LEAF-001']);
    expect(r.claimable.map((s) => s.sd_key)).toEqual(['SD-LEAF-001']);
  });
  it('a human-action SD is excluded; a child (parent_sd_id) is excluded; a claimed SD is excluded', () => {
    const sds = [
      { sd_key: 'SD-HUMAN-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: null, metadata: { requires_human_action: true }, dependencies: [] },
      { sd_key: 'SD-CHILD-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: 'SD-PARENT-001', dependencies: [] },
      { sd_key: 'SD-CLAIMED-001', sd_type: 'infrastructure', claiming_session_id: 'sess', parent_sd_id: null, dependencies: [] },
    ];
    expect(computeDispatchBelt({ sds, statusByKey: {}, terminalSet: TERMINAL, classifyIneligibility: classify }).unclaimed).toHaveLength(0);
  });
  it('claimable requires all real deps terminal (a non-terminal SD-key dep -> not claimable)', () => {
    const sds = [{ sd_key: 'SD-X-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: null, dependencies: ['SD-DEP-001'] }];
    expect(computeDispatchBelt({ sds, statusByKey: { 'SD-DEP-001': 'in_progress' }, terminalSet: TERMINAL, classifyIneligibility: classify }).claimable).toHaveLength(0);
    expect(computeDispatchBelt({ sds, statusByKey: { 'SD-DEP-001': 'completed' }, terminalSet: TERMINAL, classifyIneligibility: classify }).claimable).toHaveLength(1);
  });
  it('an in-flight (started, current_phase past LEAD) unclaimed SD is excluded from claimable but stays in unclaimed (DUTY-6 belt parity: backlog-rank skips isStartedSd, so the audit must not count it rank-stale)', () => {
    const sds = [
      { sd_key: 'SD-ORPHAN-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: null, current_phase: 'PLAN_PRD', dependencies: [] },
      { sd_key: 'SD-FRESH-001', sd_type: 'infrastructure', claiming_session_id: null, parent_sd_id: null, current_phase: 'LEAD', dependencies: [] },
    ];
    const r = computeDispatchBelt({ sds, statusByKey: {}, terminalSet: TERMINAL, classifyIneligibility: classify });
    expect(r.unclaimed.map((s) => s.sd_key).sort()).toEqual(['SD-FRESH-001', 'SD-ORPHAN-001']); // both are unclaimed leaves
    expect(r.claimable.map((s) => s.sd_key)).toEqual(['SD-FRESH-001']);                          // in-flight orphan NOT fresh-rankable
  });
});

describe('extractDepKey — object-sentinel parity (FR-5)', () => {
  it('a structured {sd_key:"none"} / {sd_id:"N/A"} sentinel -> null (object branch must not bypass the SD-key rule)', () => {
    expect(extractDepKey({ sd_key: 'none' })).toBeNull();
    expect(extractDepKey({ sd_id: 'N/A' })).toBeNull();
    expect(extractDepKey({ sd_key: 'SD-REAL-001' })).toBe('SD-REAL-001');
  });
});

describe('detectIdleWithWork — DUTY-3 + pending-assignment suppression (FR-3/FR-5)', () => {
  it('idle live worker + unclaimed work -> violation', () => {
    const r = detectIdleWithWork({ liveSessions: [{ session_id: 'w1', sd_key: null, worktree_path: '/repo/.worktrees/SD-X' }], unclaimedCount: 2 });
    expect(r.violation).toBe(true);
    expect(r.remediation).toMatch(/assign/i);
  });
  it('a worker with a pending WORK_ASSIGNMENT is NOT re-flagged (no duplicate-assignment spray)', () => {
    const r = detectIdleWithWork({ liveSessions: [{ session_id: 'w1', sd_key: null }], unclaimedCount: 2, pendingAssignmentSessionIds: new Set(['w1']) });
    expect(r.violation).toBe(false);
  });
  it('no unclaimed work -> no violation', () => {
    expect(detectIdleWithWork({ liveSessions: [{ session_id: 'w1', sd_key: null }], unclaimedCount: 0 }).violation).toBe(false);
  });

  // SD-LEO-INFRA-CHARTER-DUTY3-PARKED-WORKER-FLAG-001: parked workers (between /loop ticks) are NOT
  // idle-while-unclaimed — they self-claim on next wake and the coordinator cannot remediate them.
  it('a PARKED worker (loop_state=awaiting_tick) is NOT flagged (parked != idle)', () => {
    const r = detectIdleWithWork({ liveSessions: [{ session_id: 'w1', sd_key: null, loop_state: 'awaiting_tick' }], unclaimedCount: 2 });
    expect(r.violation).toBe(false);
    expect(r.idleCount).toBe(0);
  });
  it('a worker inside an armed expected_silence_until window is NOT flagged', () => {
    const nowMs = 1_000_000;
    const isWithinArmedSilence = (until, now) => !!until && new Date(until).getTime() > now;
    const r = detectIdleWithWork({
      liveSessions: [{ session_id: 'w1', sd_key: null, expected_silence_until: new Date(nowMs + 600_000).toISOString() }],
      unclaimedCount: 2, nowMs, isWithinArmedSilence,
    });
    expect(r.violation).toBe(false);
  });
  it('a genuinely-active idle worker (loop_state active, no silence) IS still flagged', () => {
    const nowMs = 1_000_000;
    const isWithinArmedSilence = (until, now) => !!until && new Date(until).getTime() > now;
    const r = detectIdleWithWork({
      liveSessions: [{ session_id: 'w1', sd_key: null, loop_state: 'active', expected_silence_until: null, worktree_path: '/repo/.worktrees/SD-X' }],
      unclaimedCount: 2, nowMs, isWithinArmedSilence,
    });
    expect(r.violation).toBe(true);
    expect(r.detail).toMatch(/parked/);
  });

  // SD-REFILL-00N8J6HV: a never-claimed registration ghost (source:'startup', loop_state:'unknown',
  // fresh heartbeat) has sd_key=null but has never participated — it must NOT be flagged as idle-with-work
  // (the recurring DUTY-3 false positive). everParticipated requires a claim/worktree/completed-counter.
  it('a never-claimed startup ghost (loop_state=unknown, no worktree/claim) is NOT flagged', () => {
    const r = detectIdleWithWork({
      liveSessions: [{ session_id: '0462ea61', sd_key: null, loop_state: 'unknown', expected_silence_until: null, worktree_path: null, claimed_at: null }],
      unclaimedCount: 2, nowMs: 1_000_000,
    });
    expect(r.violation).toBe(false);
    expect(r.idleCount).toBe(0);
  });
  it('a just-finished idle worker (everParticipated via worktree_path, not parked) IS still flagged', () => {
    const r = detectIdleWithWork({
      liveSessions: [{ session_id: 'w-finished', sd_key: null, loop_state: 'active', expected_silence_until: null, worktree_path: '/repo/.worktrees/SD-X', claimed_at: null }],
      unclaimedCount: 2, nowMs: 1_000_000,
    });
    expect(r.violation).toBe(true);
  });
  it('a worker that has completed SDs (continuous_sds_completed>0) but released its claim IS flagged', () => {
    const r = detectIdleWithWork({
      liveSessions: [{ session_id: 'w-veteran', sd_key: null, loop_state: 'active', worktree_path: null, claimed_at: null, continuous_sds_completed: 3 }],
      unclaimedCount: 1, nowMs: 1_000_000,
    });
    expect(r.violation).toBe(true);
  });
});

describe('extractDepKey — SD-key vs free-text prose (FR-5 dep-resolver correctness)', () => {
  it('object {sd_key}/{sd_id} -> the key', () => {
    expect(extractDepKey({ sd_key: 'SD-A-001' })).toBe('SD-A-001');
    expect(extractDepKey({ sd_id: 'SD-B-002' })).toBe('SD-B-002');
  });
  it('bare SD-key string + SD-key-with-prose -> the leading SD-key', () => {
    expect(extractDepKey('SD-LEO-INFRA-X-001')).toBe('SD-LEO-INFRA-X-001');
    expect(extractDepKey('SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001 (parent; child B)')).toBe('SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001');
  });
  it('pure prose / "none" / null -> null (NOT a dependency edge)', () => {
    expect(extractDepKey('the coordinator cron framework + standing loop set')).toBeNull();
    expect(extractDepKey('none')).toBeNull();
    expect(extractDepKey(null)).toBeNull();
  });
});

describe('detectDependencyHealth — completed-dep NO-false-block (FR-5)', () => {
  it('a prose dependency is NOT a dep edge (no false ANOMALY, no false BLOCK)', () => {
    const sds = [{ sd_key: 'C', dependencies: ['the coordinator cron framework', 'SD-DEP-001 (the real one)'] }];
    const r = detectDependencyHealth({ sds, statusByKey: { 'SD-DEP-001': 'completed' }, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.anomalies).toHaveLength(0); // prose ignored, the real dep is completed
    expect(r.blocked).toBe(0);
    expect(r.ready).toBe(1);
  });

  it('a child whose dep is COMPLETED is dep-satisfied, NOT blocked', () => {
    const sds = [{ sd_key: 'SD-C-001', dependencies: ['SD-DEP1-001'] }];
    const r = detectDependencyHealth({ sds, statusByKey: { 'SD-DEP1-001': 'completed' }, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.blocked).toBe(0);
    expect(r.ready).toBe(1);
  });
  it('an UNKNOWN/missing dep key is a dep-resolver ANOMALY, NOT silently counted blocked', () => {
    const sds = [{ sd_key: 'SD-C-001', dependencies: ['SD-MISSING-001'] }];
    const r = detectDependencyHealth({ sds, statusByKey: {}, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.blocked).toBe(0);
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0]).toEqual({ sd: 'SD-C-001', unknownDeps: ['SD-MISSING-001'] });
    expect(r.violation).toBe(true);
  });
  it('a known non-terminal dep is genuinely BLOCKED', () => {
    const sds = [{ sd_key: 'SD-C-001', dependencies: ['SD-DEP1-001'] }];
    const r = detectDependencyHealth({ sds, statusByKey: { 'SD-DEP1-001': 'in_progress' }, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.blocked).toBe(1);
  });

  // QF-20260627-273: a co_author_pending interim hold (sentinel dep) is a legitimate hold (BLOCKED,
  // matching claim-eligibility.draftDepsSatisfied), NOT a dep-resolver ANOMALY/violation.
  it('a co_author_pending hold sentinel is BLOCKED, not an ANOMALY/violation', () => {
    const sentinel = 'SD-CO-AUTHOR-CONVERGENCE-PENDING interim hold (coordinator) — REMOVE on co_author convergence';
    const sds = [{ sd_key: 'SD-C-001', dependencies: [sentinel] }];
    const r = detectDependencyHealth({ sds, statusByKey: {}, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.blocked).toBe(1);
    expect(r.anomalies).toHaveLength(0);
    expect(r.violation).toBe(false);
  });
  it('a co_author hold alongside a genuinely-missing real dep still flags the real dep ANOMALY', () => {
    const sentinel = 'SD-CO-AUTHOR-CONVERGENCE-PENDING interim hold';
    const sds = [{ sd_key: 'SD-C-001', dependencies: [sentinel, 'SD-MISSING-001'] }];
    const r = detectDependencyHealth({ sds, statusByKey: {}, terminalSet: TERMINAL, nowMs: NOW });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].unknownDeps).toEqual(['SD-MISSING-001']); // hold excluded, real-missing flagged
    expect(r.violation).toBe(true);
  });
});

describe('detectWorktreePool — DUTY-1 fail-loud (FR-3)', () => {
  it('count -1 (git error) -> violation (fail-loud, not silent 0)', () => {
    const r = detectWorktreePool({ count: -1, max: 20 });
    expect(r.violation).toBe(true);
    expect(r.detail).toMatch(/UNAVAILABLE/);
  });
  it('near cap -> violation; below -> clean; saturated -> SATURATED', () => {
    expect(detectWorktreePool({ count: 18, max: 20, threshold: 0.85 }).violation).toBe(true);
    expect(detectWorktreePool({ count: 7, max: 20, threshold: 0.85 }).violation).toBe(false);
    expect(detectWorktreePool({ count: 20, max: 20 }).detail).toMatch(/SATURATED/);
  });
});

describe('detectBacklogRankStaleness — DUTY-6 (FR-3)', () => {
  it('claimable SDs with absent or stale dispatch_rank_at -> violation', () => {
    const claimableSds = [
      { sd_key: 'A', metadata: {} },                                    // absent
      { sd_key: 'B', metadata: { dispatch_rank_at: ago(2 * 3600_000) } }, // 2h > 1h TTL
    ];
    const r = detectBacklogRankStaleness({ claimableSds, nowMs: NOW, ttlMs: 3600_000 });
    expect(r.violation).toBe(true);
    expect(r.staleCount).toBe(2);
  });
  it('all freshly ranked -> no violation', () => {
    const claimableSds = [{ sd_key: 'A', metadata: { dispatch_rank_at: ago(10 * 60_000) } }];
    expect(detectBacklogRankStaleness({ claimableSds, nowMs: NOW, ttlMs: 3600_000 }).violation).toBe(false);
  });
});

describe('detectQuietTickUnverified — committed-action verification (FR-3)', () => {
  it('prior committed_actions + latest 0 prior_action_outcomes -> violation', () => {
    const reviews = [
      { metadata: { prior_action_outcomes: [] } },                 // latest
      { metadata: { committed_actions: ['fix X', 'file Y'] } },    // prior
    ];
    expect(detectQuietTickUnverified({ coordinatorReviews: reviews }).violation).toBe(true);
  });
  it('latest has prior_action_outcomes -> verified (no violation)', () => {
    const reviews = [
      { metadata: { prior_action_outcomes: ['verified X'] } },
      { metadata: { committed_actions: ['fix X'] } },
    ];
    expect(detectQuietTickUnverified({ coordinatorReviews: reviews }).violation).toBe(false);
  });
  it('fewer than 2 reviews -> no violation', () => {
    expect(detectQuietTickUnverified({ coordinatorReviews: [{ metadata: {} }] }).violation).toBe(false);
  });
});

describe('summarizeViolations', () => {
  it('collects only violations with their remediations', () => {
    const s = summarizeViolations([{ violation: true, detail: 'd1', remediation: 'r1' }, { violation: false, detail: 'd2' }]);
    expect(s.count).toBe(1);
    expect(s.violations[0]).toEqual({ detail: 'd1', remediation: 'r1' });
  });
});

describe('STANDARD_LOOPS — durable schedule (FR-6)', () => {
  it('contains the charter-audit loop with a remediate-then-verify prompt', () => {
    const loop = STANDARD_LOOPS.find((l) => l.key === 'charter-audit');
    expect(loop).toBeTruthy();
    expect(loop.script).toBe('coordinator-charter-audit.mjs');
    expect(loop.prompt).toMatch(/RE-RUN/i);
    expect(loop.prompt).toMatch(/CHARTER_AUDIT_VIOLATIONS=0/);
  });
});

describe('detectCrossRepoStarvation (SD-FDBK-INFRA-FLEET-SELF-CLAIM-001)', () => {
  const ehgSd = (over = {}) => ({ sd_key: 'SD-EHG-COCKPIT-VENTPERF-BUILD-001', target_application: 'ehg', priority: 'high', created_at: ago(30 * 60 * 1000), ...over });

  it('flags a cross-repo SD that NO live worker checkout can build (the starvation case)', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [ehgSd()], liveSessionApps: ['EHG_Engineer'], nowMs: NOW });
    expect(r.violation).toBe(true);
    expect(r.starvingCount).toBe(1);
    expect(r.starving[0].sd_key).toBe('SD-EHG-COCKPIT-VENTPERF-BUILD-001');
    expect(r.remediation).toMatch(/explicitly dispatch/i);
    expect(r.remediation).toMatch(/SD-EHG-COCKPIT-VENTPERF-BUILD-001/);
  });

  it('does NOT flag when a live worker checkout CAN build it (an ehg-checkout worker is live)', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [ehgSd()], liveSessionApps: ['EHG_Engineer', 'ehg'], nowMs: NOW });
    expect(r.violation).toBe(false);
    expect(r.starvingCount).toBe(0);
  });

  it('does NOT flag a repo-agnostic SD (no target_application — executable anywhere)', () => {
    const sd = { sd_key: 'SD-LEO-INFRA-X-001', priority: 'high', created_at: ago(30 * 60 * 1000) };
    const r = detectCrossRepoStarvation({ claimableSds: [sd], liveSessionApps: ['EHG_Engineer'], nowMs: NOW });
    expect(r.violation).toBe(false);
  });

  it('does NOT flag a too-young cross-repo SD (still inside a brief window)', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [ehgSd({ created_at: ago(60 * 1000) })], liveSessionApps: ['EHG_Engineer'], nowMs: NOW, minAgeMs: 12 * 60 * 1000 });
    expect(r.violation).toBe(false);
  });

  it('uses metadata.dispatch_rank_at for age when present (belt-arrival time)', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [ehgSd({ created_at: ago(1000), metadata: { dispatch_rank_at: ago(30 * 60 * 1000) } })], liveSessionApps: ['EHG_Engineer'], nowMs: NOW });
    expect(r.violation).toBe(true);
  });

  it('GUARD: with zero live worker apps it never flags (no-fleet != cross-repo starvation)', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [ehgSd()], liveSessionApps: [], nowMs: NOW });
    expect(r.violation).toBe(false);
    expect(r.detail).toMatch(/no live worker apps/i);
  });

  it('empty claimable belt -> no violation', () => {
    const r = detectCrossRepoStarvation({ claimableSds: [], liveSessionApps: ['EHG_Engineer'], nowMs: NOW });
    expect(r.violation).toBe(false);
  });
});

describe('detectAutoRefillBacklog (SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E)', () => {
  it('promotable candidates + auto-refill NOT live -> advisory violation with remediation', () => {
    const r = detectAutoRefillBacklog({ promotableCount: 17, autoRefillLive: false });
    expect(r.violation).toBe(true);
    expect(r.promotableCount).toBe(17);
    expect(r.detail).toMatch(/17 staged/);
    expect(r.remediation).toMatch(/sourcing:refill-verify/);
  });

  it('no promotable candidates -> no advisory (conservative)', () => {
    const r = detectAutoRefillBacklog({ promotableCount: 0, autoRefillLive: false });
    expect(r.violation).toBe(false);
    expect(r.remediation).toBeNull();
    expect(r.detail).toMatch(/no promotable/);
  });

  it('auto-refill LIVE suppresses the advisory even with candidates (cron drains them)', () => {
    const r = detectAutoRefillBacklog({ promotableCount: 50, autoRefillLive: true });
    expect(r.violation).toBe(false);
    expect(r.detail).toMatch(/auto-refill live/);
  });

  it('respects a custom threshold (below -> no advisory)', () => {
    expect(detectAutoRefillBacklog({ promotableCount: 3, threshold: 10 }).violation).toBe(false);
    expect(detectAutoRefillBacklog({ promotableCount: 10, threshold: 10 }).violation).toBe(true);
  });

  it('is total-safe on odd input (NaN/negative/undefined -> 0, no advisory)', () => {
    expect(detectAutoRefillBacklog({ promotableCount: NaN }).promotableCount).toBe(0);
    expect(detectAutoRefillBacklog({ promotableCount: -5 }).violation).toBe(false);
    expect(detectAutoRefillBacklog().violation).toBe(false);
    expect(detectAutoRefillBacklog({ promotableCount: 2.9 }).promotableCount).toBe(2); // floored
  });
});

describe('detectInProgressOrphans — DUTY-3b in_progress+unclaimed orphan (SD-REFILL-00R7REXL)', () => {
  const OLD = ago(30 * 60 * 1000); // older than the 10min default min-age
  const orphanSd = (over = {}) => ({ sd_key: 'SD-ORPHAN-001', status: 'in_progress', claiming_session_id: null, current_phase: 'PLAN_PRD', updated_at: OLD, ...over });

  it('flags an in_progress + UNCLAIMED SD with no live worker (the false-all-clear case)', () => {
    const r = detectInProgressOrphans({ sds: [orphanSd()], liveSessions: [], nowMs: NOW });
    expect(r.violation).toBe(true);
    expect(r.orphanCount).toBe(1);
    expect(r.samples[0]).toEqual({ sd_key: 'SD-ORPHAN-001', phase: 'PLAN_PRD' });
    expect(r.remediation).toMatch(/recover/i);
  });

  it('does NOT flag when a live session still holds the sd_key (transient hard-cap claim release — c1df435f)', () => {
    const r = detectInProgressOrphans({ sds: [orphanSd()], liveSessions: [{ session_id: 'live-1', sd_key: 'SD-ORPHAN-001' }], nowMs: NOW });
    expect(r.violation).toBe(false);
    expect(r.orphanCount).toBe(0);
  });

  it('does NOT flag a CLAIMED in_progress SD (DUTY-8 domain, not orphan)', () => {
    const r = detectInProgressOrphans({ sds: [orphanSd({ claiming_session_id: 'sess-x' })], liveSessions: [], nowMs: NOW });
    expect(r.violation).toBe(false);
  });

  it('does NOT flag a draft / completed / non-in_progress SD', () => {
    const sds = [orphanSd({ status: 'draft' }), orphanSd({ sd_key: 'SD-X', status: 'completed' })];
    expect(detectInProgressOrphans({ sds, liveSessions: [], nowMs: NOW }).violation).toBe(false);
  });

  it('excludes orchestrator parents / fixtures / human-action via classifyIneligibility', () => {
    const r = detectInProgressOrphans({ sds: [orphanSd()], liveSessions: [], nowMs: NOW, classifyIneligibility: () => 'orchestrator_parent' });
    expect(r.violation).toBe(false);
  });

  it('age-gates: a just-released claim (updated_at fresher than minAgeMs) is NOT yet an orphan', () => {
    const r = detectInProgressOrphans({ sds: [orphanSd({ updated_at: ago(60 * 1000) })], liveSessions: [], nowMs: NOW });
    expect(r.violation).toBe(false);
  });

  it('is total / fail-open on odd input', () => {
    expect(detectInProgressOrphans().violation).toBe(false);
    expect(detectInProgressOrphans({ sds: null, liveSessions: null }).violation).toBe(false);
    expect(detectInProgressOrphans({ sds: [orphanSd()], liveSessions: [] }).violation).toBe(true); // nowMs undefined → age guard skipped, still flags
  });
});

describe('detectUnstampedModel (QF-20260720-497) — model-stamp gauge fail-loud', () => {
  const participating = (over = {}) => ({ session_id: 's', claimed_at: ago(1000), metadata: {}, ...over });
  it('flags a live participating worker with no worker_self_report model (not silent unknown)', () => {
    const r = detectUnstampedModel({ liveSessions: [participating({ session_id: 'w1', metadata: { model: 'fable' /* no effort_source */ } })] });
    expect(r.violation).toBe(true);
    expect(r.unstampedCount).toBe(1);
    expect(r.unstampedSessions).toContain('w1');
    expect(r.remediation).toMatch(/worker-checkin/);
  });
  it('does NOT flag a worker that self-reports (effort_source=worker_self_report + model)', () => {
    const r = detectUnstampedModel({ liveSessions: [participating({ metadata: { model: 'sonnet', effort_source: 'worker_self_report' } })] });
    expect(r.violation).toBe(false);
    expect(r.unstampedCount).toBe(0);
    expect(r.participatingCount).toBe(1);
  });
  it('does NOT flag a fresh startup ghost that has not yet participated', () => {
    const r = detectUnstampedModel({ liveSessions: [{ session_id: 'ghost', metadata: {} /* no claim/worktree/completed */ }] });
    expect(r.violation).toBe(false);
    expect(r.participatingCount).toBe(0);
  });
  it('empty / missing input → no violation (conservative)', () => {
    expect(detectUnstampedModel().violation).toBe(false);
    expect(detectUnstampedModel({ liveSessions: [] }).violation).toBe(false);
  });
});
