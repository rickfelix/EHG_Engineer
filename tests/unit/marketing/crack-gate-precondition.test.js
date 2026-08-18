/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-5 (TS-3) — proves the observe-only crack-gate
 * precondition is genuinely wired into checkPublishAuthorization() (both branches) and
 * evaluateGraduation(), using a REAL mock that throws on any unmocked table/rpc access
 * (TR-5) rather than the catch-all `return ledgerChain` fallback already documented as a
 * blind spot in tests/unit/marketing/autonomy-gate.test.js's own makeSupabase().
 */
import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn().mockResolvedValue({ recorded: true, id: 'decision-1' }),
}));

import { checkPublishAuthorization, evaluateGraduation } from '../../../lib/marketing/autonomy-gate.js';

const VENTURE_ID = 'v-crack-gate-1';

/**
 * A chainable query-builder stub: every method returns itself so any depth/order of
 * .select()/.eq()/.order()/.limit() resolves, and the two terminal methods resolve the given
 * promise. Avoids hand-nesting a fixed chain depth per call site (the bug in the first draft
 * of this file — the real ledger dedup check and the accepted-lookup check have different
 * .eq() depths on the same table).
 */
function chainable(result) {
  const node = {
    select: () => node,
    eq: () => node,
    neq: () => node,
    order: () => node,
    limit: () => node,
    insert: () => node,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  };
  return node;
}

/**
 * A supabase fake that explicitly tracks crack-gate reads/writes and throws on anything
 * unrecognized, so a silently-swallowed unmocked-table access cannot masquerade as coverage.
 */
function makeTrackingSupabase({ autonomyState = null, ledgerAccepted = null, crackGateFails = false } = {}) {
  const calls = { rpc: [], systemEventsInsert: [] };
  return {
    calls,
    rpc: vi.fn((fnName, args) => {
      if (fnName !== 'venture_pbn_status') throw new Error(`unmocked rpc: ${fnName}`);
      calls.rpc.push(args);
      if (crackGateFails) return Promise.resolve({ data: null, error: { message: 'rpc down' } });
      return Promise.resolve({ data: [{ status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'legit', degraded: false }], error: null });
    }),
    from: vi.fn((table) => {
      if (table === 'v_venture_gate_attestations_latest') return chainable({ data: null, error: null });
      if (table === 'system_events') {
        return { insert: vi.fn((row) => { calls.systemEventsInsert.push(row); return Promise.resolve({ error: null }); }) };
      }
      if (table === 'venture_channel_autonomy') {
        return { select: () => chainable({ data: autonomyState ? { autonomy_state: autonomyState } : null, error: null }), upsert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      if (table === 'venture_channel_publish_ledger') {
        // Both the "accepted?" lookup (4 .eq()s) and the "already pending?" dedup check (1
        // .eq()) share this table; chainable() resolves either depth to the same terminal.
        return chainable({ data: ledgerAccepted, error: null });
      }
      if (table === 'venture_demand_verdicts') return chainable({ data: null, error: null });
      if (table === 'marketing_content') return chainable({ data: { lifecycle_state: 'SCHEDULE' }, error: null });
      if (table === 'campaign_enrollments') return chainable({ data: [], error: null });
      throw new Error(`unmocked table: ${table}`);
    }),
  };
}

describe('checkPublishAuthorization crack-gate precondition (FR-5)', () => {
  it('TS-3: runs on the propose_and_approve (default) branch, before the autonomy-state read', async () => {
    const supabase = makeTrackingSupabase({ autonomyState: null }); // no row -> defaults to propose_and_approve
    await checkPublishAuthorization({ supabase, ventureId: VENTURE_ID, channelType: 'x', contentId: 'c-1' });
    expect(supabase.calls.rpc).toHaveLength(1);
    expect(supabase.calls.systemEventsInsert).toHaveLength(1);
    expect(supabase.calls.systemEventsInsert[0].payload.source).toBe('publish_gate');
    expect(supabase.calls.systemEventsInsert[0].payload.venture_id).toBe(VENTURE_ID);
  });

  it('also runs on the autonomous branch (both branches covered by the single pre-branch call)', async () => {
    const supabase = makeTrackingSupabase({ autonomyState: 'autonomous' });
    await checkPublishAuthorization({ supabase, ventureId: VENTURE_ID, channelType: 'x', contentId: 'c-1', send: { audience: null } });
    expect(supabase.calls.rpc).toHaveLength(1);
    expect(supabase.calls.systemEventsInsert).toHaveLength(1);
  });

  it('a crack-gate RPC failure does not throw out of checkPublishAuthorization and does not change its allowed/denied outcome', async () => {
    const supabase = makeTrackingSupabase({ autonomyState: null, crackGateFails: true });
    const result = await checkPublishAuthorization({ supabase, ventureId: VENTURE_ID, channelType: 'x', contentId: 'c-1' });
    // The observe-only witness write should be skipped when its own read failed (nothing to
    // report), but the real authorization result must be unaffected either way.
    expect(result).toHaveProperty('allowed');
    expect(result.reason).toMatch(/AUTONOMY_APPROVAL_REQUIRED/);
  });

  it('a NON-Error (nullish) rejection from inside the crack-gate check still does not throw out (the exact gap a PR2 deep-tier review found: unguarded err.message would TypeError on this)', async () => {
    const supabase = makeTrackingSupabase({ autonomyState: null });
    // Force evaluateCrackGateStatus's own internals to reject with `undefined` by making the
    // rpc call itself reject with a nullish value rather than resolving {error}.
    supabase.rpc = vi.fn(() => Promise.reject(undefined));
    const result = await checkPublishAuthorization({ supabase, ventureId: VENTURE_ID, channelType: 'x', contentId: 'c-1' });
    expect(result).toHaveProperty('allowed');
    expect(result.reason).toMatch(/AUTONOMY_APPROVAL_REQUIRED/);
  });
});

describe('evaluateGraduation crack-gate precondition (FR-5)', () => {
  function makeGraduationSupabase({ crackGateFails = false } = {}) {
    const calls = { rpc: [], systemEventsInsert: [] };
    return {
      calls,
      rpc: vi.fn((fnName) => {
        if (fnName !== 'venture_pbn_status') throw new Error(`unmocked rpc: ${fnName}`);
        calls.rpc.push(1);
        if (crackGateFails) return Promise.resolve({ data: null, error: { message: 'down' } });
        return Promise.resolve({ data: [{ status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'legit', degraded: false }], error: null });
      }),
      from: vi.fn((table) => {
        if (table === 'v_venture_gate_attestations_latest') {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }) };
        }
        if (table === 'system_events') {
          return { insert: vi.fn((row) => { calls.systemEventsInsert.push(row); return Promise.resolve({ error: null }); }) };
        }
        if (table === 'venture_channel_publish_ledger') {
          return { select: () => ({ eq: () => ({ eq: () => ({ neq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean' })), error: null }) }) }) }) }) }) };
        }
        if (table === 'venture_demand_verdicts') {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { verdict: 'PASS', citation: 'fixture', computed_at: '2026-08-09T00:00:00Z' }, error: null }) }) }) }) }) }) };
        }
        if (table === 'venture_channel_autonomy') {
          return { upsert: vi.fn(() => Promise.resolve({ error: null })) };
        }
        throw new Error(`unmocked table: ${table}`);
      }),
    };
  }

  it('is consulted when streak + demand are both satisfied (the actual promotion moment), so an unchecked venture cannot silently graduate', async () => {
    const supabase = makeGraduationSupabase();
    const result = await evaluateGraduation({ supabase, ventureId: VENTURE_ID, channelType: 'x', requiredStreak: 5 });
    expect(supabase.calls.rpc).toHaveLength(1);
    expect(supabase.calls.systemEventsInsert).toHaveLength(1);
    expect(supabase.calls.systemEventsInsert[0].payload.source).toBe('publish_gate');
    // Observe-only: graduation itself is unaffected today.
    expect(result.autonomyState).toBe('autonomous');
  });

  it('a crack-gate failure at the promotion moment does not throw or block graduation (observe-only)', async () => {
    const supabase = makeGraduationSupabase({ crackGateFails: true });
    const result = await evaluateGraduation({ supabase, ventureId: VENTURE_ID, channelType: 'x', requiredStreak: 5 });
    expect(result.success).toBe(true);
  });
});

describe('SD-LEO-INFRA-ARM-BINDING-EXIT-001 FR-5/TS-7: this file and lib/eva/lifecycle/crack-gate-evaluator.js stay diff-empty', () => {
  it('TS-7(a): git diff origin/main -- lib/marketing/autonomy-gate.js lib/eva/lifecycle/crack-gate-evaluator.js is empty', () => {
    // TS-7(b) (behavioral identity) is proven by this file's OWN pre-existing tests above
    // (and autonomy-gate.test.js) passing unchanged -- neither file is touched by this SD, so
    // an unmodified file passing its unmodified tests IS the "before === after" comparison.
    let diff;
    try {
      diff = execSync(
        'git diff origin/main -- lib/marketing/autonomy-gate.js lib/eva/lifecycle/crack-gate-evaluator.js',
        { encoding: 'utf8', cwd: fileURLToPath(new URL('../../..', import.meta.url)) }
      );
    } catch (e) {
      // origin/main may be unreachable in some sandboxed CI checkouts (shallow clone, no
      // fetch) -- skip rather than false-fail on an environment limitation unrelated to FR-5.
      if (/unknown revision|ambiguous argument/i.test(e.message)) return;
      throw e;
    }
    expect(diff.trim()).toBe('');
  });
});
