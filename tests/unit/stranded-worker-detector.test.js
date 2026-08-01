/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-C FR-3 — detectStrandedWorker.
 *
 * A GUARD FAILS CLOSED; A DETECTOR FAILS QUIET. The sibling SDs in this family closed
 * three guards fail-closed, and carrying that reflex here is the expensive mistake:
 * detectProgressStall's own suite has eleven violation:false assertions and zero
 * worktree_path references, so reading an ABSENT path as "missing, therefore stranded"
 * would make all eleven start firing. The absent-path case is therefore tested FIRST and
 * proven load-bearing by deleting the guard.
 */
import { describe, it, expect } from 'vitest';
import { detectStrandedWorker } from '../../lib/coordinator/charter-audit-detectors.mjs';

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const fresh = (minsAgo = 1) => new Date(NOW - minsAgo * 60_000).toISOString();

/** Injected probe. Never a raw fs call — a bare fs check would bypass every fixture here. */
const probeFrom = (map) => (p) => {
  const calls = probeFrom.calls;
  if (calls) calls.push(p);
  return map[p] ?? { exists: true, isWorktreeRoot: true };
};

describe('detectStrandedWorker — fires on strandings', () => {
  it('a MISSING worktree on a live, heartbeating claim is a finding', () => {
    const r = detectStrandedWorker({
      liveSessions: [{ session_id: 's1', sd_key: 'SD-A', worktree_path: '/wt/gone', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: probeFrom({ '/wt/gone': { exists: false, isWorktreeRoot: false } }),
    });
    expect(r.violation).toBe(true);
    expect(r.strandedCount).toBe(1);
    expect(r.samples[0]).toMatchObject({ sd_key: 'SD-A', kind: 'missing' });
    expect(r.remediation).toBeTruthy();
  });

  it('a directory that EXISTS but is not a worktree root is a DISTINCT finding', () => {
    const r = detectStrandedWorker({
      liveSessions: [{ session_id: 's2', sd_key: 'SD-B', worktree_path: '/wt/plain', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: probeFrom({ '/wt/plain': { exists: true, isWorktreeRoot: false } }),
    });
    expect(r.violation).toBe(true);
    expect(r.samples[0].kind).toBe('not_a_worktree');
    // Distinguishable from the missing case — the two need different remediation.
    expect(r.samples[0].kind).not.toBe('missing');
  });

  it('a HEALTHY worktree on a live claim is not a finding', () => {
    const r = detectStrandedWorker({
      liveSessions: [{ session_id: 's3', sd_key: 'SD-C', worktree_path: '/wt/ok', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: probeFrom({ '/wt/ok': { exists: true, isWorktreeRoot: true } }),
    });
    expect(r.violation).toBe(false);
    expect(r.strandedCount).toBe(0);
  });

  it('the green heartbeat is the whole point — a stranded worker is ALIVE, not stale', () => {
    const sessions = [{ session_id: 's4', sd_key: 'SD-D', worktree_path: '/wt/gone', heartbeat_at: fresh(1) }];
    const probe = probeFrom({ '/wt/gone': { exists: false, isWorktreeRoot: false } });
    expect(detectStrandedWorker({ liveSessions: sessions, nowMs: NOW, probeWorktree: probe }).violation).toBe(true);
    // A worker that stopped heartbeating is a different class (dead/reaped), not stranded.
    const stale = [{ ...sessions[0], heartbeat_at: fresh(60) }];
    expect(detectStrandedWorker({ liveSessions: stale, nowMs: NOW, probeWorktree: probe }).violation).toBe(false);
  });
});

describe('detectStrandedWorker — stays QUIET on unmeasured data', () => {
  it('NO worktree_path produces NO finding, and the probe is never even called', () => {
    const calls = [];
    probeFrom.calls = calls;
    const r = detectStrandedWorker({
      liveSessions: [
        { session_id: 's5', sd_key: 'SD-E', heartbeat_at: fresh() },            // field absent
        { session_id: 's6', sd_key: 'SD-F', worktree_path: '', heartbeat_at: fresh() },   // empty
        { session_id: 's7', sd_key: 'SD-G', worktree_path: '   ', heartbeat_at: fresh() }, // whitespace
      ],
      nowMs: NOW,
      probeWorktree: probeFrom({}),
    });
    probeFrom.calls = null;
    expect(r.violation).toBe(false);
    expect(r.strandedCount).toBe(0);
    // "No finding" must be distinguishable from "never ran" — assert the probe was skipped
    // deliberately rather than the detector having quietly done nothing at all.
    expect(calls).toHaveLength(0);
  });

  it('the probe IS called when a path is present — so quietness above is a decision, not inaction', () => {
    const calls = [];
    probeFrom.calls = calls;
    detectStrandedWorker({
      liveSessions: [{ session_id: 's8', sd_key: 'SD-H', worktree_path: '/wt/ok', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: probeFrom({ '/wt/ok': { exists: true, isWorktreeRoot: true } }),
    });
    probeFrom.calls = null;
    expect(calls).toEqual(['/wt/ok']);
  });

  it('a session with no claim is not this detector class', () => {
    const r = detectStrandedWorker({
      liveSessions: [{ session_id: 's9', worktree_path: '/wt/gone', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: probeFrom({ '/wt/gone': { exists: false, isWorktreeRoot: false } }),
    });
    expect(r.violation).toBe(false);
  });

  it('fails OPEN, never closed, when it cannot evaluate at all', () => {
    // No probe injected, malformed sessions, no clock — a detector that cannot measure
    // reports nothing. It must never manufacture a violation out of missing inputs.
    expect(detectStrandedWorker({}).violation).toBe(false);
    expect(detectStrandedWorker({ liveSessions: null, nowMs: NOW, probeWorktree: () => ({}) }).violation).toBe(false);
    expect(detectStrandedWorker({ liveSessions: [], nowMs: NaN, probeWorktree: () => ({}) }).violation).toBe(false);
    // A THROWING probe is unmeasured, not stranded.
    const thrower = () => { throw new Error('probe exploded'); };
    expect(detectStrandedWorker({
      liveSessions: [{ session_id: 'sA', sd_key: 'SD-I', worktree_path: '/wt/x', heartbeat_at: fresh() }],
      nowMs: NOW,
      probeWorktree: thrower,
    }).violation).toBe(false);
  });

  it('an armed-silence worker is parked, not stranded', () => {
    const r = detectStrandedWorker({
      liveSessions: [{ session_id: 'sB', sd_key: 'SD-J', worktree_path: '/wt/gone', heartbeat_at: fresh(), expected_silence_until: 'later' }],
      nowMs: NOW,
      isWithinArmedSilence: () => true,
      probeWorktree: probeFrom({ '/wt/gone': { exists: false, isWorktreeRoot: false } }),
    });
    expect(r.violation).toBe(false);
  });
});
