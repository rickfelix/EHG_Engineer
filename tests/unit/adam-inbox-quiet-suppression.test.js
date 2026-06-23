/**
 * SD-REFILL-00YJS6VB — Adam inbox-monitor no-op tick suppression.
 *
 * The recurring inbox-monitor tick (every 15 min) ran `adam-advisory.cjs inbox` and printed a
 * "(no unread...)" line every fire even when the lane was empty — narration churn during
 * quiescent / chairman-attached work. The --quiet flag (used only by the recurring tick)
 * makes drainInbox SILENT on a fully-empty lane while preserving the confirmation line for
 * manual use; orphaned-row WARNINGs (real unread deliveries) are never suppressed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainInbox } = require('../../scripts/adam-advisory.cjs');

// Minimal chainable supabase mock: from().select().eq().is().order().limit() -> {data, error}
function makeSupabase(rows) {
  const q = {
    select: () => q, eq: () => q, is: () => q, order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => q };
}

describe('Adam inbox --quiet no-op suppression (SD-REFILL-00YJS6VB)', () => {
  let logSpy, warnSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

  it('quiet: empty lane prints NOTHING (silent no-op tick)', async () => {
    await drainInbox(makeSupabase([]), 'adam-sid', { quiet: true });
    const noUnread = logSpy.mock.calls.flat().some((a) => String(a).includes('no unread'));
    expect(noUnread).toBe(false);
  });

  it('non-quiet (manual): empty lane prints the confirmation line', async () => {
    await drainInbox(makeSupabase([]), 'adam-sid', { quiet: false });
    const noUnread = logSpy.mock.calls.flat().some((a) => String(a).includes('no unread'));
    expect(noUnread).toBe(true);
  });

  it('default (no opts) behaves like non-quiet — backward compatible', async () => {
    await drainInbox(makeSupabase([]), 'adam-sid');
    const noUnread = logSpy.mock.calls.flat().some((a) => String(a).includes('no unread'));
    expect(noUnread).toBe(true);
  });
});
