/**
 * Unit tests — SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001
 * detectDeployGap flags a RUNNING session whose start time (created_at) predates the latest merge
 * to its role's code paths by more than the grace window. PURE — mergesByRole injected, no git/DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { detectDeployGap, sessionRole, DEFAULT_DEPLOY_GAP_MS } = require('../../lib/coordinator/detectors.cjs');

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-06-08T00:00:00Z');
const coord = (created_at) => ({ session_id: 's-coord', created_at, metadata: { is_coordinator: 'true' } });
const worker = (created_at) => ({ session_id: 's-work', created_at, metadata: {} });

describe('sessionRole', () => {
  it('reads is_coordinator from metadata', () => {
    expect(sessionRole({ metadata: { is_coordinator: 'true' } })).toBe('coordinator');
    expect(sessionRole({ metadata: {} })).toBe('worker');
    expect(sessionRole({})).toBe('worker');
  });
});

describe('detectDeployGap', () => {
  it('flags a coordinator session whose code predates the latest coordinator merge by > the window', () => {
    const startIso = new Date(T0).toISOString();
    const r = detectDeployGap(
      { sessions: [coord(startIso)], mergesByRole: { coordinator: T0 + 5 * HOUR, worker: T0 } },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('sessions_executing_old_code');
    expect(r.evidence.gapped_count).toBe(1);
    expect(r.evidence.samples[0].role).toBe('coordinator');
    expect(r.evidence.max_gap_ms).toBe(5 * HOUR);
  });

  it('does NOT flag a session started AFTER the latest merge (fresh)', () => {
    const startIso = new Date(T0 + 6 * HOUR).toISOString();
    const r = detectDeployGap(
      { sessions: [coord(startIso)], mergesByRole: { coordinator: T0 + 5 * HOUR } },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(false);
  });

  it('does NOT flag when the gap is within the grace window', () => {
    const startIso = new Date(T0).toISOString();
    const r = detectDeployGap(
      { sessions: [coord(startIso)], mergesByRole: { coordinator: T0 + 2 * HOUR } },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(false);
  });

  it('is role-scoped: a worker merge does not flag a coordinator session', () => {
    const startIso = new Date(T0).toISOString();
    const r = detectDeployGap(
      { sessions: [coord(startIso)], mergesByRole: { coordinator: T0, worker: T0 + 10 * HOUR } },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(false); // coordinator merge == start, only worker advanced
  });

  it('fail-open: skips a session with no created_at', () => {
    const r = detectDeployGap(
      { sessions: [coord(null), { session_id: 'x', metadata: {} }], mergesByRole: { coordinator: T0 + 9 * HOUR, worker: T0 + 9 * HOUR } },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(false);
  });

  it('fail-open: skips a role whose latest-merge time is unknown (0)', () => {
    const startIso = new Date(T0).toISOString();
    const r = detectDeployGap(
      { sessions: [worker(startIso)], mergesByRole: { coordinator: T0 + 9 * HOUR } /* worker missing */ },
      { maxGapMs: 4 * HOUR }
    );
    expect(r.matched).toBe(false);
  });

  it('caps samples at 10 and defaults the threshold', () => {
    const startIso = new Date(T0).toISOString();
    const sessions = Array.from({ length: 15 }, (_, i) => ({ session_id: 'w' + i, created_at: startIso, metadata: {} }));
    const r = detectDeployGap({ sessions, mergesByRole: { worker: T0 + 9 * HOUR } }); // no opts → default threshold
    expect(r.matched).toBe(true);
    expect(r.evidence.gapped_count).toBe(10);
    expect(r.evidence.threshold_ms).toBe(DEFAULT_DEPLOY_GAP_MS);
  });
});
