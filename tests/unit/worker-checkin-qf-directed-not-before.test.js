/**
 * QF-20260705-429 (residual of QF-20260705-460): the DIRECTED WORK_ASSIGNMENT claim path in
 * worker-checkin.cjs went straight to tryClaim() for QF- keys with no quick_fixes.not_before
 * check — the SD fitness fetch intentionally misses for QF keys and the claim_sd RPC never
 * reads not_before, so a directed assignment naming a deferred QF claimed it early (specimen:
 * QF-20260704-348, claimed ~2.6h before its gate). The self-claim pickers were already gated
 * by SD-LEO-FIX-QUICK-FIXES-NEEDS-001 (isAutoStartableQF); this covers the directed lane.
 *
 * Semantics under test:
 *  - future not_before  -> NO claim attempt, NO ack (transient: assignment stays live and
 *    succeeds once the gate passes), breadcrumb assignment_deferred_not_before.
 *  - past/null not_before -> claims exactly as before (no regression).
 *  - quick_fixes read error -> FAIL CLOSED, same as the QF-20260703-151 fitness-fetch
 *    semantics: no claim attempt, retryable assignment_claim_error breadcrumb.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../scripts/worker-checkin.cjs');

const QF_KEY = 'QF-20260704-348';
const FUTURE = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 6 * 3600 * 1000).toISOString();

function fakeSb({ notBefore = null, qfFetchError = null, rpcCalls = [] } = {}) {
  return {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: { success: true }, error: null });
    },
    from(table) {
      const api = {
        select() { return this; }, eq() { return this; }, neq() { return this; },
        gte() { return this; }, lte() { return this; }, gt() { return this; }, lt() { return this; },
        in() { return this; }, is() { return this; }, or() { return this; }, not() { return this; },
        ilike() { return this; }, contains() { return this; }, order() { return this; },
        limit() { return this; }, range() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
          // A QF key genuinely misses in strategic_directives_v2 -- no row, no error.
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: null, error: null });
          if (table === 'quick_fixes') {
            if (qfFetchError) return Promise.resolve({ data: null, error: qfFetchError });
            return Promise.resolve({ data: { not_before: notBefore }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return Promise.resolve({ data: null, error: null }); },
        insert() { return Promise.resolve({ error: null }); },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
      };
      return api;
    },
  };
}

async function runWithDirectedQf(sb) {
  const ws = require('../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => [{ id: 'msg-deferred-qf', message_type: 'WORK_ASSIGNMENT', payload: { qf_id: QF_KEY } }];
  try {
    return await resolveCheckin(sb, 'sess-directed-defer-test', { getCoordinator: async () => null });
  } finally {
    ws.getMessagesForSession = orig;
  }
}

const claimAttemptsFor = (rpcCalls, key) =>
  rpcCalls.filter(c => JSON.stringify(c.args || {}).includes(key));

describe('resolveCheckin — directed QF assignment honors quick_fixes.not_before (QF-20260705-429)', () => {
  it('does NOT claim a directed QF whose not_before is in the future; breadcrumbs the deferral', async () => {
    const rpcCalls = [];
    const res = await runWithDirectedQf(fakeSb({ notBefore: FUTURE, rpcCalls }));
    expect(res.action).not.toBe('claimed_assignment');
    expect(res.assignment_deferred_not_before).toEqual({ qf: QF_KEY, not_before: FUTURE });
    expect(claimAttemptsFor(rpcCalls, QF_KEY)).toHaveLength(0);
  });

  it('claims normally when not_before is in the past (gate passed — no regression)', async () => {
    const rpcCalls = [];
    const res = await runWithDirectedQf(fakeSb({ notBefore: PAST, rpcCalls }));
    expect(res.action).toBe('claimed_assignment');
    expect(res.sd).toBe(QF_KEY);
  });

  it('claims normally when not_before is null (no gate — the QF-20260704-602 repro shape)', async () => {
    const rpcCalls = [];
    const res = await runWithDirectedQf(fakeSb({ notBefore: null, rpcCalls }));
    expect(res.action).toBe('claimed_assignment');
    expect(res.sd).toBe(QF_KEY);
  });

  it('FAILS CLOSED on a quick_fixes read error: no claim attempt, retryable breadcrumb', async () => {
    const rpcCalls = [];
    const res = await runWithDirectedQf(fakeSb({ qfFetchError: { message: 'boom' }, rpcCalls }));
    expect(res.action).not.toBe('claimed_assignment');
    expect(res.assignment_claim_error).toBe('fitness_check_query_failed');
    expect(claimAttemptsFor(rpcCalls, QF_KEY)).toHaveLength(0);
  });
});
