/**
 * Unit tests for the inert-worker-revival surfacing feature.
 * SD-LEO-INFRA-SURFACE-INERT-WORKER-001
 *
 * Pure detector over injected fixtures + mocked-supabase writer (fail-open + dedup).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectInertWorkerRevival,
  DEFAULT_INERT_WORKER_AGE_MS,
} from '../../../lib/coordinator/detectors.cjs';
import {
  inertWorkerDetectorEnabled,
  inertWorkerThresholdMs,
  FLEET_WORKER_STARTUP_PROMPT,
  emitInertWorkerAlert,
  runInertWorkerSurfacing,
} from '../../../lib/coordinator/coordination-events.cjs';

const NOW = 1_750_000_000_000;
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const THRESH = DEFAULT_INERT_WORKER_AGE_MS;

describe('detectInertWorkerRevival', () => {
  it('matches an aged, pending, unfulfilled request', () => {
    const requests = [{ id: '1', requested_callsign: 'Echo', status: 'pending', requested_at: minsAgo(500), fulfilled_at: null }];
    const r = detectInertWorkerRevival({ requests, now: NOW, thresholdMs: THRESH });
    expect(r.matched).toBe(true);
    expect(r.evidence.aged_count).toBe(1);
    expect(r.evidence.samples[0].callsign).toBe('Echo');
  });
  it('counts expired-but-still-pending rows (status never transitions when inert)', () => {
    const requests = [{ id: '1', requested_callsign: 'Alpha', status: 'pending', requested_at: minsAgo(12000), fulfilled_at: null, expires_at: minsAgo(11940) }];
    expect(detectInertWorkerRevival({ requests, now: NOW, thresholdMs: THRESH }).matched).toBe(true);
  });
  it('does not match fresh / fulfilled / non-pending / empty', () => {
    expect(detectInertWorkerRevival({ requests: [{ id: '1', status: 'pending', requested_at: minsAgo(10), fulfilled_at: null }], now: NOW, thresholdMs: THRESH }).matched).toBe(false);
    expect(detectInertWorkerRevival({ requests: [{ id: '2', status: 'pending', requested_at: minsAgo(500), fulfilled_at: minsAgo(1) }], now: NOW, thresholdMs: THRESH }).matched).toBe(false);
    expect(detectInertWorkerRevival({ requests: [{ id: '3', status: 'cancelled', requested_at: minsAgo(500), fulfilled_at: null }], now: NOW, thresholdMs: THRESH }).matched).toBe(false);
    expect(detectInertWorkerRevival({ requests: [], now: NOW, thresholdMs: THRESH }).matched).toBe(false);
  });
  it('threshold boundary: at-threshold no fire, one ms past fires', () => {
    const at = [{ id: '1', status: 'pending', requested_at: new Date(NOW - THRESH).toISOString(), fulfilled_at: null }];
    const past = [{ id: '1', status: 'pending', requested_at: new Date(NOW - THRESH - 1).toISOString(), fulfilled_at: null }];
    expect(detectInertWorkerRevival({ requests: at, now: NOW, thresholdMs: THRESH }).matched).toBe(false);
    expect(detectInertWorkerRevival({ requests: past, now: NOW, thresholdMs: THRESH }).matched).toBe(true);
  });
});

describe('inertWorkerDetectorEnabled / threshold / prompt', () => {
  it('is OFF by default and ON when flag set', () => {
    expect(inertWorkerDetectorEnabled({})).toBe(false);
    expect(inertWorkerDetectorEnabled({ SURFACE_INERT_WORKER_V1: 'false' })).toBe(false);
    expect(inertWorkerDetectorEnabled({ SURFACE_INERT_WORKER_V1: 'true' })).toBe(true);
  });
  it('reads INERT_WORKER_AGE_MIN (default 360)', () => {
    expect(inertWorkerThresholdMs({})).toBe(360 * 60_000);
    expect(inertWorkerThresholdMs({ INERT_WORKER_AGE_MIN: '10' })).toBe(10 * 60_000);
  });
  it('prompt constant carries the /loop wake instruction', () => {
    expect(FLEET_WORKER_STARTUP_PROMPT).toContain('/loop');
    expect(FLEET_WORKER_STARTUP_PROMPT).toContain('sd-start');
  });
});

function mockSupabase({ dupes = [], insertError = null, throwOn = null }) {
  return {
    from() {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, gt() { return this; },
        limit() {
          if (throwOn === 'select') throw new Error('boom-select');
          return Promise.resolve({ data: dupes, error: null });
        },
        insert() {
          if (throwOn === 'insert') throw new Error('boom-insert');
          return { select() { return { single() { return Promise.resolve({ data: insertError ? null : { id: 'new-1' }, error: insertError }); } }; } };
        },
      };
    },
  };
}

describe('emitInertWorkerAlert (dedup + fail-open)', () => {
  it('inserts one alert when no live dupe exists', async () => {
    const res = await emitInertWorkerAlert(mockSupabase({ dupes: [] }), { aged_count: 3 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBeUndefined(); expect(res.id).toBe('new-1');
  });
  it('skips insert when an unacknowledged, unexpired alert already exists', async () => {
    const res = await emitInertWorkerAlert(mockSupabase({ dupes: [{ id: 'old-1' }] }), { aged_count: 3 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBe(true); expect(res.id).toBe('old-1');
  });
  it('fail-open on insert error', async () => {
    const res = await emitInertWorkerAlert(mockSupabase({ dupes: [], insertError: { message: 'db down' } }), { aged_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false); expect(res.error).toBe('db down');
  });
  it('fail-open when the select throws', async () => {
    const res = await emitInertWorkerAlert(mockSupabase({ throwOn: 'select' }), { aged_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false);
  });
});

describe('runInertWorkerSurfacing', () => {
  it('returns null with ZERO I/O when flag is OFF', async () => {
    const sb = { from: vi.fn(() => { throw new Error('should not be called'); }) };
    const res = await runInertWorkerSurfacing(sb, { env: {} });
    expect(res).toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });
});
