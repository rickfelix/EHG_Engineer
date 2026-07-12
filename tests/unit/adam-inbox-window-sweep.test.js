/**
 * QF-20260703-946 — Adam inbox `--sweep [--window 24h]` window sweep.
 *
 * CLAUDE_ADAM.md FULL-INBOX SWEEP mandate: the known auto-ack bug (QF-20260610-623) stamps
 * read_at/acknowledged_at on rows Adam never actually processed, so the normal drainInbox
 * read_at-IS-NULL filter can hide a re-targeted backlog. windowSweep lists ALL directed rows
 * in the window regardless of read/ack stamps, with those stamps shown, plus an unacked count.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { windowSweep, parseSweepWindowMs, DEFAULT_SWEEP_WINDOW_MS } = require('../../scripts/adam-advisory.cjs');

// Minimal chainable supabase mock: from().select().eq().gte().order().limit() -> {data, error}
function makeSupabase(rows) {
  const q = {
    select: () => q, eq: () => q, gte: () => q, order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => q };
}

describe('parseSweepWindowMs', () => {
  it('defaults to 24h when --window is absent', () => {
    expect(parseSweepWindowMs([])).toBe(DEFAULT_SWEEP_WINDOW_MS);
  });
  it('parses hours/minutes/days', () => {
    expect(parseSweepWindowMs(['--sweep', '--window', '2h'])).toBe(2 * 3_600_000);
    expect(parseSweepWindowMs(['--window', '30m'])).toBe(30 * 60_000);
    expect(parseSweepWindowMs(['--window', '3d'])).toBe(3 * 86_400_000);
  });
  it('falls back to the default on a malformed value (fail-open)', () => {
    expect(parseSweepWindowMs(['--window', 'garbage'])).toBe(DEFAULT_SWEEP_WINDOW_MS);
  });
});

describe('Adam inbox window sweep (QF-20260703-946)', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('lists a read-stamped-but-unacked row that a read_at filter would hide', async () => {
    const rows = [{
      id: 'row-1', message_type: 'INFO', subject: null,
      payload: { kind: 'coordinator_directive', body: 'stranded directive' },
      created_at: new Date().toISOString(),
      read_at: new Date().toISOString(), // already read-stamped by the auto-ack bug
      acknowledged_at: null,
    }];
    await windowSweep(makeSupabase(rows), 'adam-sid', { windowMs: 3_600_000 });
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain('stranded directive');
    expect(out).toContain('UNACKED');
    expect(out).toContain('1 unacked');
  });

  // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-2 (instance 4, coordinator-verified
  // 2026-07-12): a coordinator_request row with an 858-char body in the COLUMN (not payload.body)
  // previously printed as if empty -- this line never checked the body column at all. Migrated
  // to readCanonicalBody(); this pins the fallback path against a real body-only-in-column row.
  it('instance 4: a coordinator_request row with body ONLY in the body column no longer prints as empty', async () => {
    const bodyText = 'x'.repeat(858);
    const rows = [{
      id: 'row-2', message_type: 'INFO', subject: 'coordinator_request subject',
      payload: { kind: 'coordinator_request' }, // no payload.body — the instance-4 shape
      body: bodyText, // real content lives in the column instead
      created_at: new Date().toISOString(),
      read_at: null,
      acknowledged_at: null,
    }];
    await windowSweep(makeSupabase(rows), 'adam-sid', { windowMs: 3_600_000 });
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain(bodyText);
    expect(out).not.toContain('(empty)');
  });

  it('quiet: empty window prints nothing', async () => {
    await windowSweep(makeSupabase([]), 'adam-sid', { quiet: true });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('non-quiet: empty window prints a confirmation line', async () => {
    await windowSweep(makeSupabase([]), 'adam-sid', { quiet: false });
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain('no directed rows');
  });
});
