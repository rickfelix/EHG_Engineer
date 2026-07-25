/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-2 — stampSpawnCorrelation.
 *
 * These are BEHAVIOURAL tests against an injected fake client. Deliberately NOT source-regex
 * assertions: the sibling session-register-started-at-fix.test.js pins that file by grepping its
 * source, which proves nothing about behaviour and reds on harmless refactors. The reason this
 * file can do better is that FR-2 added the DI seam that made behaviour reachable at all.
 *
 * ENV-INDEPENDENCE (this bit is load-bearing — it cost a red CI run on the previous SD):
 * sessionId is passed EXPLICITLY and no test touches resolveSessionId, so nothing here depends on
 * CLAUDE_SESSION_ID, on stdin, or on the ~/.claude/session-identity marker files that exist on a
 * dev box and not in CI. The unit project deliberately does not load .env and CI is ubuntu with no
 * secrets. Verify with: env -u CLAUDE_SESSION_ID npx vitest run <this file>
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { stampSpawnCorrelation } = require_('../../../scripts/hooks/session-register.cjs');

/**
 * Fake client that RECORDS the filter column, not just its value. The repo's existing fake at
 * reboot-respawn-runner.test.js:102 does `eq: (_col, value) =>` and discards the column, which is
 * why "a revert to pid correlation would fail loudly" does NOT actually hold there. Recording the
 * column is what makes a correlation-key regression detectable.
 */
function fakeClient({ row = undefined, readError = null, writeError = null } = {}) {
  const calls = { reads: [], writes: [], updates: [] };
  const client = {
    calls,
    from(table) {
      const state = { table, op: 'select', filters: [], payload: null };
      const builder = {
        select() { return builder; },
        update(payload) { state.op = 'update'; state.payload = payload; return builder; },
        eq(column, value) { state.filters.push({ column, value }); return builder; },
        async maybeSingle() {
          calls.reads.push({ table, filters: [...state.filters] });
          return readError ? { data: null, error: { message: readError } } : { data: row, error: null };
        },
        then(resolve) {
          calls.updates.push({ table, filters: [...state.filters], payload: state.payload });
          return Promise.resolve(
            writeError ? { data: null, error: { message: writeError } } : { data: [], error: null }
          ).then(resolve);
        },
      };
      return builder;
    },
  };
  return client;
}

const ROW = { session_id: 'sess-1', metadata: { account_profile: 'canary', callsign: 'Canary-1' } };

describe('FR-2 stampSpawnCorrelation — merges, never replaces', () => {
  it('preserves pre-existing metadata written by the session-manager RPC', async () => {
    const sb = fakeClient({ row: ROW });
    const r = await stampSpawnCorrelation(sb, 'sess-1', 'corr-abc');
    expect(r).toEqual({ stamped: true, reason: 'stamped' });

    const write = sb.calls.updates.at(-1);
    // The whole point: the other keys survive. A bare upsert would have dropped them.
    expect(write.payload.metadata).toEqual({
      account_profile: 'canary',
      callsign: 'Canary-1',
      spawn_correlation: 'corr-abc',
    });
  });

  it('scopes the write to session_id — never to pid (pid is OS-recyclable and holds the wrong process)', async () => {
    const sb = fakeClient({ row: ROW });
    await stampSpawnCorrelation(sb, 'sess-1', 'corr-abc');
    const columns = sb.calls.updates.at(-1).filters.map((f) => f.column);
    expect(columns).toContain('session_id');
    expect(columns).not.toContain('pid');
  });

  it('degrades a malformed metadata blob to an empty object rather than throwing', async () => {
    const sb = fakeClient({ row: { session_id: 'sess-1', metadata: 'not-an-object' } });
    const r = await stampSpawnCorrelation(sb, 'sess-1', 'corr-abc');
    expect(r.stamped).toBe(true);
    expect(sb.calls.updates.at(-1).payload.metadata).toEqual({ spawn_correlation: 'corr-abc' });
  });
});

describe('FR-2 stampSpawnCorrelation — fail-soft on every path (SessionStart must never abort)', () => {
  const cases = [
    ['no_supabase', () => stampSpawnCorrelation(null, 'sess-1', 'c')],
    ['no_session_id', () => stampSpawnCorrelation(fakeClient({ row: ROW }), '', 'c')],
    ['no_correlation', () => stampSpawnCorrelation(fakeClient({ row: ROW }), 'sess-1', '')],
    ['read_error', () => stampSpawnCorrelation(fakeClient({ readError: 'boom' }), 'sess-1', 'c')],
    ['row_not_found', () => stampSpawnCorrelation(fakeClient({ row: null }), 'sess-1', 'c')],
    ['write_error', () => stampSpawnCorrelation(fakeClient({ row: ROW, writeError: 'boom' }), 'sess-1', 'c')],
  ];

  for (const [reason, run] of cases) {
    it(`returns {stamped:false, reason:'${reason}'} instead of rejecting`, async () => {
      const r = await run();
      expect(r).toEqual({ stamped: false, reason });
    });
  }

  it('returns threw rather than propagating when the client itself explodes', async () => {
    const exploding = { from() { throw new Error('client exploded'); } };
    await expect(stampSpawnCorrelation(exploding, 'sess-1', 'c')).resolves.toEqual({
      stamped: false, reason: 'threw',
    });
  });

  it('never writes when the read found no row', async () => {
    const sb = fakeClient({ row: null });
    await stampSpawnCorrelation(sb, 'sess-1', 'c');
    expect(sb.calls.updates).toHaveLength(0);
  });
});
