/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H — kill-to-exit wiring tests.
 * Covers PRD TS-1 (PENDING-only marker) and TS-2/TS-3 (structural proof the
 * wiring can never bypass execute-exit's or kill_venture's chairman gates).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPendingExitInit,
  getPendingExitInit,
  onDecisionApproved,
  EXIT_INIT_EVENT_TYPE,
  THESIS_KILL_DECISION_TYPE,
} from '../../lib/eva/lifecycle/exit-wiring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeSupabaseStub({ insertError = null, selectData = null, selectError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      return {
        insert: async (row) => {
          inserted.push({ table, row });
          return { error: insertError };
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ data: selectData, error: selectError }),
      };
    },
  };
}

describe('createPendingExitInit — TS-1', () => {
  it('writes exactly one system_events row with the expected shape', async () => {
    const supabase = makeSupabaseStub();
    const result = await createPendingExitInit({
      supabase,
      ventureId: 'venture-1',
      decisionId: 'decision-1',
      rationale: 'test rationale',
    });
    expect(result.created).toBe(true);
    expect(supabase.inserted).toHaveLength(1);
    const { table, row } = supabase.inserted[0];
    expect(table).toBe('system_events');
    expect(row.event_type).toBe(EXIT_INIT_EVENT_TYPE);
    expect(row.venture_id).toBe('venture-1');
    expect(row.payload.decision_id).toBe('decision-1');
    expect(row.payload.decision_type).toBe(THESIS_KILL_DECISION_TYPE);
    expect(row.idempotency_key).toBe(`${EXIT_INIT_EVENT_TYPE}:venture-1:decision-1`);
  });

  it('never throws on a system_events write failure (fail-soft, mirrors thesis-kill-gate.js)', async () => {
    const supabase = makeSupabaseStub({ insertError: { message: 'boom' } });
    const result = await createPendingExitInit({ supabase, ventureId: 'v1', decisionId: 'd1' });
    expect(result.created).toBe(false);
    expect(result.reason).toBe('boom');
  });

  it('TESTING finding: malformed args fail SOFT (created:false), never throw/reject — a bad decision must not crash the approve CLI post-commit', async () => {
    await expect(createPendingExitInit({ supabase: null, ventureId: 'v', decisionId: 'd' })).resolves.toEqual({
      created: false,
      reason: expect.stringContaining('requires supabase'),
    });
    await expect(createPendingExitInit({ supabase: {}, ventureId: null, decisionId: 'd' })).resolves.toEqual({
      created: false,
      reason: expect.stringContaining('requires supabase'),
    });
  });
});

describe('getPendingExitInit — FR-5 status visibility', () => {
  it('is read-only: does not call insert/update/delete', async () => {
    const supabase = makeSupabaseStub({ selectData: { id: '1', venture_id: 'v1', payload: {}, created_at: 'now' } });
    const result = await getPendingExitInit({ supabase, ventureId: 'v1' });
    expect(result.venture_id).toBe('v1');
    expect(supabase.inserted).toHaveLength(0);
  });

  it('returns null when no exit-init marker exists', async () => {
    const supabase = makeSupabaseStub({ selectData: null });
    const result = await getPendingExitInit({ supabase, ventureId: 'v1' });
    expect(result).toBeNull();
  });
});

describe('onDecisionApproved — decision_type gating', () => {
  it('acts only on thesis_kill_tier_b decisions', async () => {
    const supabase = makeSupabaseStub();
    const acted = await onDecisionApproved({
      supabase,
      decision: { id: 'd1', venture_id: 'v1', decision_type: THESIS_KILL_DECISION_TYPE, rationale: 'r' },
    });
    expect(acted.acted).toBe(true);
    expect(supabase.inserted).toHaveLength(1);
  });

  it('is a no-op for every other decision_type', async () => {
    const supabase = makeSupabaseStub();
    for (const decision_type of ['stage_gate', 'product_review', undefined, null, 'thesis_kill_tier_a']) {
      const acted = await onDecisionApproved({ supabase, decision: { id: 'd1', venture_id: 'v1', decision_type } });
      expect(acted.acted).toBe(false);
    }
    expect(supabase.inserted).toHaveLength(0);
  });

  it('is a no-op when decision itself is missing', async () => {
    const supabase = makeSupabaseStub();
    const acted = await onDecisionApproved({ supabase, decision: null });
    expect(acted.acted).toBe(false);
  });

  it('TESTING finding: a thesis_kill_tier_b decision with a null venture_id resolves fail-soft, never rejects (approve CLI must not crash post-commit)', async () => {
    const supabase = makeSupabaseStub();
    const acted = await onDecisionApproved({
      supabase,
      decision: { id: 'd1', venture_id: null, decision_type: THESIS_KILL_DECISION_TYPE, rationale: 'r' },
    });
    expect(acted.acted).toBe(true);
    expect(acted.created).toBe(false);
    expect(acted.reason).toMatch(/requires supabase/);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('TESTING finding: a thesis_kill_tier_b decision with a null id also resolves fail-soft', async () => {
    const supabase = makeSupabaseStub();
    const acted = await onDecisionApproved({
      supabase,
      decision: { id: null, venture_id: 'v1', decision_type: THESIS_KILL_DECISION_TYPE, rationale: 'r' },
    });
    expect(acted.created).toBe(false);
    expect(supabase.inserted).toHaveLength(0);
  });
});

describe('SECURITY — TS-2/TS-3: regression tripwires (NOT a formal proof — see caveat below)', () => {
  // TESTING sub-agent finding (row 78786846): these are literal-substring/regex
  // tripwires against accidental reintroduction of a bypass, not a formal proof —
  // a determined future edit (string concatenation, an .rpc() call the table-regex
  // below doesn't observe, a renamed action) could defeat them while still passing.
  // The REAL invariant this SD relies on is minimalism (this file does almost
  // nothing) plus the two downstream systems (execute-exit, kill_venture) staying
  // independently chairman-gated at their own call sites regardless of what calls
  // them. Treat a change to this file that touches any of the checks below as a
  // mandatory manual security re-review, not something these tests alone clear.
  const rawSource = readFileSync(join(__dirname, '../../lib/eva/lifecycle/exit-wiring.js'), 'utf8');
  const codeOnly = rawSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the executable code never references execute-exit, an advance action, or a synthesized chairman_approval', () => {
    const forbidden = ['execute-exit', 'chairman_approval', "action: 'advance'", 'kill_venture', 'advanceRound'];
    for (const token of forbidden) {
      expect(codeOnly.includes(token), `exit-wiring.js code must never reference "${token}"`).toBe(false);
    }
  });

  it('makes no Supabase RPC calls at all (kill_venture is an RPC, not a .from() table — checked separately since the table-regex below cannot see it)', () => {
    expect(codeOnly.includes('.rpc(')).toBe(false);
  });

  it('the only Supabase table touched is system_events (no new table, TR-1/TR-2)', () => {
    const tableRefs = [...codeOnly.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(new Set(tableRefs)).toEqual(new Set(['system_events']));
  });
});
