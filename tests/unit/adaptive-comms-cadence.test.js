/**
 * SD-LEO-INFRA-ADAPTIVE-COMMS-CADENCE-SHARED-PROTOCOL-001 — the shared adaptive-cadence helper.
 * Pattern mirrors tests/unit/auto-signal-threshold.test.js: pure decision function tests plus
 * signal-gathering tests against a stub supabase client.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  computeAdaptiveCadence,
  getCommsActivitySignals,
  DEFAULT_TIGHT_MS,
  DEFAULT_BASELINE_MS,
  DEFAULT_CAP_MS,
} = require('../../lib/coordinator/adaptive-comms-cadence.cjs');

const NOW = 1_000_000_000_000;

describe('computeAdaptiveCadence (FR-1)', () => {
  it('returns baseline when there is no active signal', () => {
    const r = computeAdaptiveCadence({ nowMs: NOW });
    expect(r.tight).toBe(false);
    expect(r.intervalMs).toBe(DEFAULT_BASELINE_MS);
    expect(r.reason).toBe('no_active_thread');
  });

  it('returns tight when a sent reply is pending', () => {
    const r = computeAdaptiveCadence({ sentPendingReply: true, threadOpenedAtMs: NOW - 60000, nowMs: NOW });
    expect(r.tight).toBe(true);
    expect(r.intervalMs).toBe(DEFAULT_TIGHT_MS);
    expect(r.reason).toBe('sent_pending_reply');
  });

  it('returns tight when a received message is unactioned', () => {
    const r = computeAdaptiveCadence({ receivedUnactioned: true, threadOpenedAtMs: NOW - 60000, nowMs: NOW });
    expect(r.tight).toBe(true);
    expect(r.reason).toBe('received_unactioned');
  });

  it('returns tight on recent bidirectional activity within the recency window', () => {
    const r = computeAdaptiveCadence({ lastActivityMs: NOW - 60000, nowMs: NOW });
    expect(r.tight).toBe(true);
    expect(r.reason).toBe('recent_activity');
  });

  it('does NOT tighten on activity outside the recency window', () => {
    const r = computeAdaptiveCadence({ lastActivityMs: NOW - 600000, nowMs: NOW }); // 10min ago, default window 5min
    expect(r.tight).toBe(false);
  });

  it('CAP: falls back to baseline once the thread has been open longer than capMs, even with an active signal', () => {
    const r = computeAdaptiveCadence({
      sentPendingReply: true,
      threadOpenedAtMs: NOW - (DEFAULT_CAP_MS + 1000),
      nowMs: NOW,
    });
    expect(r.tight).toBe(false);
    expect(r.intervalMs).toBe(DEFAULT_BASELINE_MS);
    expect(r.reason).toBe('cap_exceeded');
  });

  it('CAP: stays tight just under the cap boundary', () => {
    const r = computeAdaptiveCadence({
      sentPendingReply: true,
      threadOpenedAtMs: NOW - (DEFAULT_CAP_MS - 1000),
      nowMs: NOW,
    });
    expect(r.tight).toBe(true);
  });

  it('respects opts overrides', () => {
    const r = computeAdaptiveCadence({
      sentPendingReply: true,
      threadOpenedAtMs: NOW,
      nowMs: NOW,
      opts: { tightIntervalMs: 5000, baselineIntervalMs: 60000, capMs: 100000 },
    });
    expect(r.intervalMs).toBe(5000);
  });

  it('is pure: identical inputs always produce identical output', () => {
    const input = { sentPendingReply: true, threadOpenedAtMs: NOW - 1000, nowMs: NOW };
    expect(computeAdaptiveCadence(input)).toEqual(computeAdaptiveCadence(input));
  });
});

// ---- getCommsActivitySignals (FR-2) --------------------------------------
function stubSupabase({ sentRows = [], receivedRows = [], sentError = null, receivedError = null } = {}) {
  return {
    from(table) {
      const api = {
        _filters: {},
        select() { return api; },
        eq() { return api; },
        is() { return api; },
        gte() { return api; },
        order() { return api; },
        limit() {
          // Distinguish sent vs received query by which filter chain was used — simplify by
          // returning based on presence of receivedRows/sentRows via a marker set on `from`.
          return api;
        },
        then(resolve) {
          if (api._kind === 'received') return resolve({ data: receivedRows, error: receivedError });
          return resolve({ data: sentRows, error: sentError });
        },
      };
      // Mark the query kind based on call order isn't reliable with this stub shape, so instead
      // key off table name + a per-call flag set by the FIRST distinguishing method call.
      api.is = (...args) => { api._kind = 'received'; return api; };
      return api;
    },
  };
}

describe('getCommsActivitySignals (FR-2)', () => {
  it('detects a sent reply-pending thread with no reply yet', async () => {
    const sb = stubSupabase({
      sentRows: [{ id: 'msg-1', created_at: new Date(NOW - 30000).toISOString(), payload: { reply_requested: true } }],
      receivedRows: [],
    });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.sentPendingReply).toBe(true);
  });

  it('does NOT flag a sent message that already has a reply (repliedToIds)', async () => {
    const sb = stubSupabase({
      sentRows: [
        { id: 'msg-1', created_at: new Date(NOW - 30000).toISOString(), payload: { reply_requested: true } },
        { id: 'msg-2', created_at: new Date(NOW - 10000).toISOString(), payload: { reply_to: 'msg-1' } },
      ],
      receivedRows: [],
    });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.sentPendingReply).toBe(false);
  });

  it('detects a received unactioned message within the recent window', async () => {
    const sb = stubSupabase({
      sentRows: [],
      receivedRows: [{ id: 'msg-3', created_at: new Date(NOW - 20000).toISOString() }],
    });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.receivedUnactioned).toBe(true);
  });

  it('fail-open: resolves to no-signal on a query error, never throws', async () => {
    const sb = stubSupabase({ sentError: { message: 'boom' } });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.sentPendingReply).toBe(false);
    expect(r.receivedUnactioned).toBe(false);
    const cadence = computeAdaptiveCadence({ ...r, nowMs: NOW });
    expect(cadence.tight).toBe(false);
  });

  it('fail-open: resolves to no-signal on a thrown exception, never throws', async () => {
    const sb = { from() { throw new Error('boom'); } };
    await expect(getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW })).resolves.toMatchObject({
      sentPendingReply: false,
      receivedUnactioned: false,
    });
  });

  it('returns no-signal defaults for missing supabase/sessionId (never throws)', async () => {
    await expect(getCommsActivitySignals(null, 'sess-1')).resolves.toMatchObject({ sentPendingReply: false });
    await expect(getCommsActivitySignals({}, null)).resolves.toMatchObject({ sentPendingReply: false });
  });
});

describe('QF-20260703-642: self-signal loop regression', () => {
  it('a bare unprompted sent row (no reply_requested, no reply_to) is NOT counted as activity', async () => {
    // Simulates the fleet-worker loop's per-tick "wakeup-armed" telemetry: a routine outbound
    // row with no reply-intent markers at all.
    const sb = stubSupabase({
      sentRows: [{ id: 'msg-1', created_at: new Date(NOW - 30000).toISOString(), payload: { signal_type: 'feedback', body: 'wakeup-armed' } }],
      receivedRows: [],
    });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.lastActivityMs).toBeUndefined();
    expect(r.threadOpenedAtMs).toBeUndefined();
    const cadence = computeAdaptiveCadence({ ...r, nowMs: NOW });
    expect(cadence.tight).toBe(false);
    expect(cadence.reason).toBe('no_active_thread');
  });

  it('a sent row that IS a reply/continuation (payload.reply_to set) still counts as activity', async () => {
    const sb = stubSupabase({
      sentRows: [{ id: 'msg-2', created_at: new Date(NOW - 30000).toISOString(), payload: { reply_to: 'some-inbound-id' } }],
      receivedRows: [],
    });
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW });
    expect(r.lastActivityMs).toBe(NOW - 30000);
    expect(r.threadOpenedAtMs).toBe(NOW - 30000);
    const cadence = computeAdaptiveCadence({ ...r, nowMs: NOW });
    expect(cadence.tight).toBe(true);
    expect(cadence.reason).toBe('recent_activity');
  });

  it('the 30-min cap now fires for a recent_activity thread anchored via receivedUnactioned', async () => {
    const sb = stubSupabase({
      sentRows: [],
      receivedRows: [{ id: 'msg-3', created_at: new Date(NOW - (DEFAULT_CAP_MS + 1000)).toISOString() }],
    });
    // receivedRows must be within the recent-activity window for receivedUnactioned to be true;
    // simulate a still-open old thread by re-checking with a window wide enough to see it.
    const r = await getCommsActivitySignals(sb, 'sess-1', { nowMs: NOW, recentActivityWindowMs: DEFAULT_CAP_MS + 60000 });
    expect(r.threadOpenedAtMs).toBe(NOW - (DEFAULT_CAP_MS + 1000));
    const cadence = computeAdaptiveCadence({ ...r, nowMs: NOW });
    expect(cadence.tight).toBe(false);
    expect(cadence.reason).toBe('cap_exceeded');
  });
});
