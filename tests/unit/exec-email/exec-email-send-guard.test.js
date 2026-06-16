/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-1) — once-per-hour send guard.
 * Activation test (product_requirements_v2.activation_test_id).
 *
 * Proves the chairman never gets a duplicate email and the channel can never wedge:
 *   - skip within the 55-min window; send when elapsed/no-marker
 *   - FAIL-CLOSED on a marker read error (skip) — prefer a missed hour over a duplicate
 *   - ANTI-STUCK: future-dated / unparseable markers are ignored (=> send)
 *   - the marker is written with all NOT-NULL columns (event_type/entity_type/entity_id)
 */
import { describe, it, expect } from 'vitest';
import {
  decideSkip,
  shouldSendNow,
  recordSent,
  GUARD_WINDOW_MS,
  SEND_MARKER_EVENT,
  SEND_MARKER_ENTITY,
  SEND_MARKER_ENTITY_ID,
} from '../../../lib/fleet/exec-email-send-guard.js';

const NOW = 1_700_000_000_000;

describe('decideSkip — pure once-per-hour decision', () => {
  it('skips within the 55-min window; sends when elapsed', () => {
    expect(decideSkip({ lastSentMs: NOW - 10 * 60_000, nowMs: NOW })).toBe(true);   // 10 min ago -> skip
    expect(decideSkip({ lastSentMs: NOW - 54 * 60_000, nowMs: NOW })).toBe(true);   // 54 min -> skip
    expect(decideSkip({ lastSentMs: NOW - 56 * 60_000, nowMs: NOW })).toBe(false);  // 56 min -> send
  });
  it('sends when there is no marker', () => {
    expect(decideSkip({ lastSentMs: null, nowMs: NOW })).toBe(false);
  });
  it('ANTI-STUCK: ignores future-dated and unparseable markers (=> send)', () => {
    expect(decideSkip({ lastSentMs: NOW + 5 * 60_000, nowMs: NOW })).toBe(false); // future -> send
    expect(decideSkip({ lastSentMs: NaN, nowMs: NOW })).toBe(false);              // garbage -> send
  });
});

function dbWithMarker(createdAtIso, { readError = false } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => readError
              ? { data: null, error: { message: 'db down' } }
              : { data: createdAtIso ? [{ created_at: createdAtIso, metadata: { window_end: createdAtIso } }] : [], error: null },
          }),
        }),
      }),
    }),
  };
}

describe('shouldSendNow — IO, fail-closed on read error', () => {
  it('send=true when no marker (reason no_marker)', async () => {
    const r = await shouldSendNow(dbWithMarker(null), { nowMs: NOW });
    expect(r.send).toBe(true);
    expect(r.reason).toBe('no_marker');
  });
  it('send=false (skip) when a marker is 10 min old', async () => {
    const r = await shouldSendNow(dbWithMarker(new Date(NOW - 10 * 60_000).toISOString()), { nowMs: NOW });
    expect(r.send).toBe(false);
    expect(r.reason).toBe('within_window');
    expect(r.windowEnd).toBeTruthy();
  });
  it('send=true when the marker is 90 min old', async () => {
    const r = await shouldSendNow(dbWithMarker(new Date(NOW - 90 * 60_000).toISOString()), { nowMs: NOW });
    expect(r.send).toBe(true);
    expect(r.reason).toBe('window_elapsed');
  });
  it('FAIL-CLOSED: a read error returns send=false (never risk a duplicate)', async () => {
    const r = await shouldSendNow(dbWithMarker(null, { readError: true }), { nowMs: NOW });
    expect(r.send).toBe(false);
    expect(r.reason).toMatch(/marker_read_error/);
  });
});

describe('recordSent — writes all NOT-NULL columns, fail-soft', () => {
  it('inserts a marker with event_type/entity_type/entity_id + created_at + metadata.window_end', async () => {
    let inserted = null;
    const db = { from: () => ({ insert: async (row) => { inserted = row; return { error: null }; } }) };
    const r = await recordSent(db, { sentIso: new Date(NOW).toISOString(), windowStartIso: new Date(NOW - 3600_000).toISOString(), windowEndIso: new Date(NOW).toISOString(), sdCount: 2 });
    expect(r.ok).toBe(true);
    expect(inserted.event_type).toBe(SEND_MARKER_EVENT);
    expect(inserted.entity_type).toBe(SEND_MARKER_ENTITY);
    expect(inserted.entity_id).toBe(SEND_MARKER_ENTITY_ID);
    expect(inserted.created_at).toBe(new Date(NOW).toISOString());
    expect(inserted.metadata.window_end).toBe(new Date(NOW).toISOString());
    expect(inserted.metadata.sd_count).toBe(2);
  });
  it('fail-soft: an insert error never throws', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }) };
    const r = await recordSent(db, {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
});

describe('GUARD_WINDOW_MS', () => {
  it('is ~55 minutes (under the 60-min cadence)', () => {
    expect(GUARD_WINDOW_MS).toBe(55 * 60 * 1000);
  });
});
