/**
 * QF-20260704-491 — read-solomon-directives.cjs safety net.
 *
 * Root cause: solomon-advisory.cjs's drainInbox classifies rows by payload.kind, so an
 * out-of-allowlist kind (e.g. Adam-sent kind=adam_advisory) that gets read_at-stamped by ANY
 * poll (not just drainInbox) vanishes from the orphan-warn path (itself scoped to unread rows)
 * and stays invisible until acknowledged_at is stamped. peekStaleReadUnacked resurfaces exactly
 * that read-but-unacked-and-stale tier, regardless of kind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseThresholdMin, peekStaleReadUnacked, DEFAULT_THRESHOLD_MIN } = require('../../scripts/read-solomon-directives.cjs');

// Minimal chainable supabase mock capturing the filter chain so tests can assert the built query,
// while still returning caller-supplied rows (mirrors adam-inbox-window-sweep.test.js's convention).
function makeSupabase(rows) {
  const calls = {};
  const q = {
    select: (v) => { calls.select = v; return q; },
    eq: (col, val) => { calls.eq = [col, val]; return q; },
    not: (col, op, val) => { calls.not = [col, op, val]; return q; },
    is: (col, val) => { calls.is = [col, val]; return q; },
    lte: (col, val) => { calls.lte = [col, val]; return q; },
    order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => q, calls };
}

describe('parseThresholdMin', () => {
  it('defaults to 60min when --threshold-min is absent', () => {
    expect(parseThresholdMin([])).toBe(DEFAULT_THRESHOLD_MIN);
  });
  it('parses an explicit override', () => {
    expect(parseThresholdMin(['--threshold-min', '120'])).toBe(120);
  });
  it('falls back to the default on a malformed value (fail-open)', () => {
    expect(parseThresholdMin(['--threshold-min', 'garbage'])).toBe(DEFAULT_THRESHOLD_MIN);
  });
});

describe('peekStaleReadUnacked (QF-20260704-491)', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('surfaces a read-unacked 2h-old row regardless of kind (repro: kind=adam_advisory)', async () => {
    const rows = [{
      id: 'row-1', message_type: 'INFO', subject: null, sender_type: 'adam',
      payload: { kind: 'adam_advisory', body: 'buried consult reply' },
      created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      read_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      acknowledged_at: null,
    }];
    const surfaced = await peekStaleReadUnacked(makeSupabase(rows), 'solomon-sid', { thresholdMin: 60 });
    expect(surfaced).toHaveLength(1);
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain('buried consult reply');
    expect(out).toContain('adam_advisory');
    expect(out).toContain('READ-unacked');
  });

  it('queries acknowledged_at IS NULL server-side, so an acked row is excluded before it ever surfaces', async () => {
    const sb = makeSupabase([]); // an acked row would never be returned by the real query
    const surfaced = await peekStaleReadUnacked(sb, 'solomon-sid', { thresholdMin: 60 });
    expect(sb.calls.is).toEqual(['acknowledged_at', null]);
    expect(sb.calls.not).toEqual(['read_at', 'is', null]);
    expect(surfaced).toEqual([]);
  });

  it('empty result prints a confirmation line', async () => {
    await peekStaleReadUnacked(makeSupabase([]), 'solomon-sid');
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain('no stale read-but-unacked rows');
  });
});
