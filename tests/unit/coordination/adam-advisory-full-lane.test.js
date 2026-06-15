// SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-4/FR-5) — drainReplies full-lane reader.
// Hermetic: stubs the supabase query/update chain. Proves the reader queries the FULL reply lane
// (coordinator_reply OR any payload.reply_to) and consumes every surfaced row exactly once.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainReplies } = require('../../../scripts/adam-advisory.cjs');

function stub(rows) {
  const captured = { orArg: null, updatedIds: null };
  const selectChain = {
    select() { return selectChain; },
    eq() { return selectChain; },
    or(expr) { captured.orArg = expr; return selectChain; },
    is() { return selectChain; },
    order() { return selectChain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  const updateChain = {
    update() { return updateChain; },
    in(_col, ids) { captured.updatedIds = ids; return updateChain; },
    is() { return Promise.resolve({ error: null }); },
  };
  const supabase = {
    from() {
      // First call in drainReplies is the SELECT; the second is the UPDATE. Distinguish by
      // returning a proxy that supports both shapes (select* and update*).
      return new Proxy({}, {
        get(_t, prop) {
          if (prop in selectChain) return selectChain[prop];
          if (prop in updateChain) return updateChain[prop];
          return undefined;
        },
      });
    },
  };
  return { supabase, captured };
}

describe('drainReplies (FR-4 full-lane)', () => {
  it('queries coordinator_reply OR any payload.reply_to, and consumes every surfaced row once', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rows = [
      { id: 'r1', payload: { kind: 'coordinator_reply', reply_to: 'corr-1', body: 'classic reply' }, created_at: new Date().toISOString() },
      { id: 'r2', payload: { kind: 'chairman_directive', reply_to: 'corr-2', body: 'reply under a different kind' }, created_at: new Date().toISOString() },
    ];
    const { supabase, captured } = stub(rows);
    await drainReplies(supabase, 'adam-session');
    expect(captured.orArg).toBe('payload->>kind.eq.coordinator_reply,payload->>reply_to.not.is.null');
    expect(captured.updatedIds).toEqual(['r1', 'r2']); // both surfaced rows consumed
    logSpy.mockRestore();
  });

  it('reports cleanly when there are no unread directed replies', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { supabase, captured } = stub([]);
    await drainReplies(supabase, 'adam-session');
    expect(captured.updatedIds).toBeNull(); // nothing consumed
    expect(logSpy).toHaveBeenCalledWith('(no unread directed replies)');
    logSpy.mockRestore();
  });
});
