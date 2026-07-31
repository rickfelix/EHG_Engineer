/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-5 — the prior-phase feed for detectStuckWorker.
 *
 * The detector always had the phase-unchanged guard and runDetectors always threaded priorPhases;
 * no production caller ever supplied the data. Alpha-3 emitted ~40 heartbeats over 19 hours with
 * its phase frozen while every gauge read healthy — liveness was instrumented, progress was not.
 *
 * These tests pin the SEMANTICS, which are easy to invert: the detector SKIPS a claim whose prior
 * phase differs from its current one.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildPriorPhases } = require('../../lib/coordinator/prior-phases.cjs');
const { detectStuckWorker } = require('../../lib/coordinator/detectors.cjs');

describe('buildPriorPhases', () => {
  it('a claim that MOVED maps to its earlier phase, so the detector skips it', () => {
    const claims = [{ sd_key: 'SD-A', sd_id: 'u1', current_phase: 'EXEC' }];
    const handoffs = [{ sd_id: 'u1', from_phase: 'PLAN', created_at: '2026-07-31T10:00:00Z' }];
    expect(buildPriorPhases(claims, handoffs)['SD-A']).toBe('PLAN');
  });

  it('a claim that did NOT move maps to its CURRENT phase — the alive-but-not-moving case', () => {
    const claims = [{ sd_key: 'SD-B', sd_id: 'u2', current_phase: 'EXEC' }];
    expect(buildPriorPhases(claims, [])['SD-B']).toBe('EXEC');
  });

  it('uses the EARLIEST transition in the window, not the latest', () => {
    // Two hops inside one window: the phase at window START is the first from_phase.
    const claims = [{ sd_key: 'SD-C', sd_id: 'u3', current_phase: 'EXEC' }];
    const handoffs = [
      { sd_id: 'u3', from_phase: 'PLAN', created_at: '2026-07-31T11:00:00Z' },
      { sd_id: 'u3', from_phase: 'LEAD', created_at: '2026-07-31T09:00:00Z' },
    ];
    expect(buildPriorPhases(claims, handoffs)['SD-C']).toBe('LEAD');
  });

  it('NEVER omits a claim — omission would silently disable the guard for it', () => {
    // `sd_key in priorPhases` is what gates the check, so a missing key falls back to pure
    // staleness, i.e. the exact pre-FR-5 behaviour.
    const claims = [
      { sd_key: 'SD-D', sd_id: 'u4', current_phase: 'EXEC' },
      { sd_key: 'SD-E', sd_id: 'u5', current_phase: null },
    ];
    const map = buildPriorPhases(claims, []);
    expect('SD-D' in map).toBe(true);
    expect('SD-E' in map).toBe(true);
  });

  it('is TOTAL on junk input', () => {
    expect(buildPriorPhases(null, null)).toEqual({});
    expect(buildPriorPhases([{ no_key: 1 }], [{ no_sd_id: 1 }])).toEqual({});
  });
});

describe('coupling — the feed actually changes detectStuckWorker verdicts', () => {
  const NOW = Date.parse('2026-07-31T12:00:00Z');
  const stale = new Date(NOW - 5 * 60 * 60 * 1000).toISOString(); // 5h idle
  const claims = [{ sd_key: 'SD-A', sd_id: 'u1', session_id: 's1', current_phase: 'EXEC', heartbeat_at: stale, sd_updated_at: stale }];

  it('WITHOUT the feed, a frozen claim is flagged on staleness alone (pre-FR-5 behaviour)', () => {
    const r = detectStuckWorker({ claims, now: NOW, thresholdMs: 60 * 60 * 1000 });
    expect(r.matched).toBe(true);
  });

  it('WITH the feed, a claim that MOVED is no longer flagged', () => {
    const priorPhases = buildPriorPhases(claims, [{ sd_id: 'u1', from_phase: 'PLAN', created_at: '2026-07-31T11:30:00Z' }]);
    const r = detectStuckWorker({ claims, now: NOW, thresholdMs: 60 * 60 * 1000, priorPhases });
    expect(r.matched).toBe(false);
  });

  it('WITH the feed, a claim that did NOT move is still flagged — this is the Alpha-3 shape', () => {
    const priorPhases = buildPriorPhases(claims, []);
    const r = detectStuckWorker({ claims, now: NOW, thresholdMs: 60 * 60 * 1000, priorPhases });
    expect(r.matched).toBe(true);
  });
});
