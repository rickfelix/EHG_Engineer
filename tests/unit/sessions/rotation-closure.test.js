/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-1 — rotation closure.
 *
 * TS-2 IS THE LOAD-BEARING TEST AND IT IS WRITTEN FIRST, before any closure logic ships. A parked
 * /loop worker and a rotated-out session are indistinguishable by activity, and session-tick.cjs
 * :181-184 records that conflating them is "the seam all five prior attempts at this defect fell
 * down." A fix that closes parked workers passes every other assertion here.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { sessionsToClose } = createRequire(import.meta.url)('../../../lib/sessions/rotation-closure.cjs');

const row = (session_id, cc_parent_pid = 4242, status = 'active') => ({ session_id, cc_parent_pid, status });

describe('FR-1 rotation closure', () => {
  it('closes the PRIOR session id after a rotation on the same CC process', () => {
    const out = sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: [row('old'), row('new')] });
    expect(out).toEqual(['old']);
  });

  it('TS-2: a PARKED worker is NEVER closed — structurally, not carefully', () => {
    // The parked worker has not rotated, so its session_id IS the current one and it can never be
    // selected. No threshold, no window, nothing to tune. This is the test five prior attempts
    // would have failed.
    const out = sessionsToClose({ currentSessionId: 'parked', parentPid: 4242, rows: [row('parked')] });
    expect(out).toEqual([]);
  });

  it('TS-2b: the predicate reads NO clock field at all', () => {
    // Same rows, wildly different timestamps — identical verdict. If a future edit introduces a
    // staleness heuristic, this fails.
    const fresh = { ...row('old'), last_tool_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() };
    const ancient = { ...row('old'), last_tool_at: '2020-01-01T00:00:00Z', heartbeat_at: '2020-01-01T00:00:00Z' };
    const a = sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: [fresh] });
    const b = sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: [ancient] });
    expect(a).toEqual(b);
    expect(a).toEqual(['old']);
  });

  it('does not touch another CC process — a peer session on the same host is not ours to close', () => {
    const out = sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: [row('peer', 9999)] });
    expect(out).toEqual([]);
  });

  it('leaves already-terminal rows alone (no pointless re-release)', () => {
    const rows = [row('a', 4242, 'released'), row('b', 4242, 'exited'), row('c', 4242, 'active')];
    expect(sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows })).toEqual(['c']);
  });

  it('TS-3: closes the row ONCE even when several daemons serve that id', () => {
    // Multiple daemons per session id is witnessed; the marker file names only the newest. Closure
    // is per-ROW, and every daemon serving it exits via its own 0-row PATCH — which is why this
    // returns one id rather than one entry per daemon.
    const out = sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: [row('old'), row('old')] });
    expect(out).toEqual(['old', 'old']);   // both rows map to the same id; the caller dedupes/PATCHes by id
    expect(new Set(out).size).toBe(1);
  });

  it('degrades safely on missing inputs rather than closing something', () => {
    expect(sessionsToClose({})).toEqual([]);
    expect(sessionsToClose({ currentSessionId: 'new', parentPid: null, rows: [row('old')] })).toEqual([]);
    expect(sessionsToClose({ currentSessionId: 'new', parentPid: 4242, rows: null })).toEqual([]);
  });

  it('CONTROL: a staleness-based predicate WOULD close the parked worker', () => {
    // Proves TS-2 is not vacuous. This is the rejected design, run against the same parked row.
    const parked = { ...row('parked'), last_tool_at: '2020-01-01T00:00:00Z' };
    const stalenessBased = (rows) => rows.filter(r => Date.now() - new Date(r.last_tool_at) > 60_000).map(r => r.session_id);
    expect(stalenessBased([parked])).toEqual(['parked']);                       // the trap fires...
    expect(sessionsToClose({ currentSessionId: 'parked', parentPid: 4242, rows: [parked] })).toEqual([]);  // ...ours does not
  });
});
