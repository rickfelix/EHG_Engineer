/**
 * Unit tests for the notification-wait surfacing feature (QF-20260905-346, Part 2).
 *
 * Pure detector over injected fixtures + mocked-supabase writer (fail-open + dedup).
 * Mirrors tests/unit/coordinator/completion-boundary-exit.test.js's structure/mock conventions.
 */
import { describe, it, expect, vi } from 'vitest';
import { detectNotificationWait, DEFAULT_STALLED_LOOP_FRESH_MS } from '../../../lib/coordinator/detectors.cjs';
import {
  notificationWaitDetectorEnabled,
  notificationWaitThresholdMs,
  emitNotificationWaitAlert,
  runNotificationWaitSurfacing,
} from '../../../lib/coordinator/coordination-events.cjs';

const NOW = 1_750_000_000_000;

describe('detectNotificationWait (pure)', () => {
  it('flags a wait older than the threshold', () => {
    const res = detectNotificationWait({
      waits: [{ session_id: 'seat-a', created_at: new Date(NOW - DEFAULT_STALLED_LOOP_FRESH_MS - 1000).toISOString() }],
      now: NOW,
    });
    expect(res.matched).toBe(true);
    expect(res.evidence.waiting_count).toBe(1);
    expect(res.evidence.samples[0].session_id).toBe('seat-a');
  });

  it('does not flag a fresh wait within the threshold', () => {
    const res = detectNotificationWait({
      waits: [{ session_id: 'seat-a', created_at: new Date(NOW - 60_000).toISOString() }],
      now: NOW,
    });
    expect(res.matched).toBe(false);
  });

  it('defaults thresholdMs to DEFAULT_STALLED_LOOP_FRESH_MS (reuses the existing quiet-tick table, no new constant)', () => {
    expect(DEFAULT_STALLED_LOOP_FRESH_MS).toBe(10 * 60 * 1000);
    const justUnder = detectNotificationWait({
      waits: [{ session_id: 'seat-a', created_at: new Date(NOW - DEFAULT_STALLED_LOOP_FRESH_MS + 1000).toISOString() }],
      now: NOW,
    });
    expect(justUnder.matched).toBe(false);
  });

  it('is null-tolerant on empty/missing input', () => {
    expect(detectNotificationWait({}).matched).toBe(false);
    expect(detectNotificationWait({ waits: [] }).matched).toBe(false);
  });
});

describe('notificationWaitDetectorEnabled', () => {
  it('is OFF by default and ON when flag set', () => {
    expect(notificationWaitDetectorEnabled({})).toBe(false);
    expect(notificationWaitDetectorEnabled({ SURFACE_NOTIFICATION_WAIT_V1: 'false' })).toBe(false);
    expect(notificationWaitDetectorEnabled({ SURFACE_NOTIFICATION_WAIT_V1: 'true' })).toBe(true);
  });
});

describe('notificationWaitThresholdMs', () => {
  it('defaults to DEFAULT_STALLED_LOOP_FRESH_MS when unset', () => {
    expect(notificationWaitThresholdMs({})).toBe(DEFAULT_STALLED_LOOP_FRESH_MS);
  });
  it('is env-tunable via NOTIFICATION_WAIT_AGE_MIN', () => {
    expect(notificationWaitThresholdMs({ NOTIFICATION_WAIT_AGE_MIN: '5' })).toBe(5 * 60 * 1000);
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

describe('emitNotificationWaitAlert (dedup + fail-open)', () => {
  it('inserts one alert when no live dupe exists', async () => {
    const res = await emitNotificationWaitAlert(mockSupabase({ dupes: [] }), { waiting_count: 1 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBeUndefined(); expect(res.id).toBe('new-1');
  });
  it('skips insert when an unacknowledged, unexpired alert already exists', async () => {
    const res = await emitNotificationWaitAlert(mockSupabase({ dupes: [{ id: 'old-1' }] }), { waiting_count: 1 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBe(true); expect(res.id).toBe('old-1');
  });
  it('fail-open on insert error', async () => {
    const res = await emitNotificationWaitAlert(mockSupabase({ dupes: [], insertError: { message: 'db down' } }), { waiting_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false); expect(res.error).toBe('db down');
  });
  it('fail-open when the select throws', async () => {
    const res = await emitNotificationWaitAlert(mockSupabase({ throwOn: 'select' }), { waiting_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false);
  });
});

describe('runNotificationWaitSurfacing', () => {
  it('returns null with ZERO I/O when flag is OFF (observe-only default)', async () => {
    const sb = { from: vi.fn(() => { throw new Error('should not be called'); }) };
    const res = await runNotificationWaitSurfacing(sb, { env: {} });
    expect(res).toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });
});
