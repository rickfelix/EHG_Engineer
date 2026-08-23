// QF-20260822-719 — solomon-register.cjs's retire re-check called isFresh(heartbeatAt, nowMs)
// with only 2 of its 3 required args (freshMs missing, no default), so `nowMs2 - hb <= undefined`
// was false for every value: freshNow was ALWAYS an empty set, and the "a prior that became fresh
// since the decision (a racing restart) is NEVER cleared" protection this file's own header
// comment describes was silently dead code. Identical class already fixed in adam-register.cjs
// (ADVERSARIAL REVIEW, PR #7369) — this mirrors that regression test, adapted for Solomon (which
// has no isStatusFreshEligible-style status layer, so only the missing-arg fix applies here).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { registerSolomon } = require('../../../scripts/solomon-register.cjs');

const NOW = Date.parse('2026-06-15T16:00:00.000Z');

// Stub covering registerSolomon's full flow: the initial claude_sessions row read, the paginated
// fetchAllSolomonsStrict (.select().filter().order().range(from,to)), set_solomon_flag /
// clear_solomon_flag RPCs, and the final readback verification.
function regStub({ selfSessionId = 'self', priors = [] } = {}) {
  const calls = { rpc: [] };
  let currentMeta = null;
  const priorMeta = new Map(priors.map((p) => [p.session_id, { role: 'solomon', ...p.metadata }]));

  function claudeSessionsChain() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      filter() { return chain; }, // fetchAllSolomonsStrict scoping (metadata->>role=solomon)
      order() { return chain; },
      range(from, to) {
        const rows = priors.map((p) => ({ ...p, metadata: priorMeta.get(p.session_id) }));
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      maybeSingle() {
        return Promise.resolve({
          data: { session_id: selfSessionId, metadata: currentMeta },
          error: null,
        });
      },
    };
    return chain;
  }

  const supabase = {
    from() { return claudeSessionsChain(); },
    rpc(fn, args) {
      calls.rpc.push({ fn, args });
      if (fn === 'set_solomon_flag' && args && args.p_session_id === selfSessionId) {
        currentMeta = { role: 'solomon', non_fleet: true, solomon_since: 'test' };
      }
      if (fn === 'clear_solomon_flag' && args && args.p_session_id) {
        const prev = priorMeta.get(args.p_session_id) || {};
        priorMeta.set(args.p_session_id, { ...prev, role: 'solomon_retired', non_fleet: true });
      }
      return Promise.resolve({ error: null });
    },
  };
  return { supabase, calls };
}

describe('registerSolomon retire re-check — racing-restart protection (QF-20260822-719)', () => {
  it('a genuinely STALE prior is still retired (baseline, unaffected by the fix)', async () => {
    const heartbeatAt = new Date(NOW - 999 * 60_000).toISOString(); // far stale at both reads
    const { supabase, calls } = regStub({
      priors: [{ session_id: 'staleprior', heartbeat_at: heartbeatAt, metadata: {} }],
    });
    const r = await registerSolomon(supabase, 'self', { nowMs: NOW, nowMs2: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire' });
    expect(r.retired).toEqual(['staleprior']);
    expect(calls.rpc.map((c) => c.fn)).toEqual(expect.arrayContaining(['clear_solomon_flag', 'set_solomon_flag']));
  });

  // THE FIX: before restoring the missing SOLOMON_FRESH_MS arg, isFresh() always returned false
  // here, so this scenario was indistinguishable from the baseline above — a racing restart could
  // be wrongly cleared. nowMs2 < nowMs simulates "this row looks fresher from the second read's
  // vantage point" (stale at the initial decision, fresh by the time of the retire re-check).
  it('a prior that raced back to fresh between decision and retire re-check is SKIPPED, not cleared', async () => {
    const heartbeatAt = new Date(NOW - 15 * 60_000).toISOString(); // 15min before NOW: stale at decision (nowMs=NOW)
    const nowMs2 = NOW - 10 * 60_000; // only 5min after heartbeatAt: fresh as of the re-check
    const { supabase, calls } = regStub({
      priors: [{ session_id: 'racingRestart', heartbeat_at: heartbeatAt, metadata: {} }],
    });
    const r = await registerSolomon(supabase, 'self', { nowMs: NOW, nowMs2 });
    expect(r).toMatchObject({ ok: true, action: 'tagged' }); // NOT tagged_after_retire
    expect(r.retired).toEqual([]);
    expect(calls.rpc.map((c) => c.fn)).not.toContain('clear_solomon_flag');
  });
});
