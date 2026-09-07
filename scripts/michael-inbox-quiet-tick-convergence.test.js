// SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001 FR-1 + FR-2: michael-inbox.cjs's drainInbox() and
// michael-quiet-tick.mjs's inbox-nudge counter must agree -- both now key on read_at, and a
// genuine drain must converge the nudge to zero. PRD test_scenario 3.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { drainInbox } = require('./michael-inbox.cjs');
import { runQuietTick } from './michael-quiet-tick.mjs';

const MISSING = { count: null, error: { code: '42P01', message: 'relation does not exist' } };

/** A shared in-memory session_coordination table both drainInbox and runQuietTick query. */
function sharedFixture(rows) {
  const table = rows.map((r) => ({ ...r }));
  return {
    table,
    from(name) {
      let filterIds = null;
      let filterReadAtNull = false;
      let updatePatch = null;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        in(col, vals) { if (col === 'id') filterIds = vals; return q; },
        is(col) { if (col === 'read_at') filterReadAtNull = true; return q; },
        update(patch) { updatePatch = patch; return q; },
        limit() {
          if (name !== 'session_coordination') return Promise.resolve(MISSING);
          const matched = table.filter((r) => (filterReadAtNull ? r.read_at == null : true));
          return Promise.resolve({ data: matched, error: null });
        },
        then(res) {
          if (name !== 'session_coordination') return Promise.resolve(MISSING).then(res);
          if (updatePatch) {
            const targets = table.filter((r) => filterIds?.includes(r.id) && (!filterReadAtNull || r.read_at == null));
            targets.forEach((r) => Object.assign(r, updatePatch));
            return Promise.resolve({ data: targets, error: null }).then(res);
          }
          const matched = table.filter((r) => (filterReadAtNull ? r.read_at == null : true));
          return Promise.resolve({ count: matched.length, error: null }).then(res);
        },
      };
      return q;
    },
  };
}

describe('drainInbox + runQuietTick convergence (read_at is the single shared column)', () => {
  it('inbox nudge count drops to 0 after a real drain over the same fixture', async () => {
    const sb = sharedFixture([
      { id: 'r1', target_session: 'sess-m', payload: { kind: 'michael_handoff', body: 'x' }, created_at: new Date().toISOString(), read_at: null },
      { id: 'r2', target_session: 'sess-m', payload: { kind: 'michael_handoff', body: 'y' }, created_at: new Date().toISOString(), read_at: null },
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const before = await runQuietTick({ sb, now: new Date('2026-09-06T09:00:00.000Z'), env: { CLAUDE_SESSION_ID: 'sess-m' } });
    expect(before.inbox).toBe(2);

    await drainInbox(sb, 'sess-m', { quiet: true });

    const after = await runQuietTick({ sb, now: new Date('2026-09-06T09:00:00.000Z'), env: { CLAUDE_SESSION_ID: 'sess-m' } });
    expect(after.inbox).toBe(0);
  });
});
