/**
 * QF-20260830-670 — a chairman-gated row guard tick that mints N decisions must escalate
 * ONCE for the batch, not once per decision. SPECIMEN 2026-08-30: four FENCED-SD rows minted
 * in one tick each auto-escalated independently, sending 4 identical standout/digest emails
 * within 2 seconds (every standout email renders ALL pending decisions, so per-row escalation
 * is pure duplication). recordPendingDecision runs for REAL here (proving all 4 rows are still
 * durably recorded and none call escalateChairmanDecision themselves); escalateChairmanDecision
 * is mocked so the batch call can be asserted without spawning a real child process.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const escalateChairmanDecisionMock = vi.fn(async () => ({ escalated: true }));
vi.mock('../../../lib/chairman/record-pending-decision.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, escalateChairmanDecision: (...args) => escalateChairmanDecisionMock(...args) };
});
vi.mock('../../../lib/coordinator/safe-metadata-merge.mjs', () => ({
  mergeMetadataKeys: vi.fn(async () => ({ merged: true })),
}));

import { runChairmanGatedDecisionRowGuard } from '../../../lib/chairman/chairman-gated-decision-row-guard.mjs';

/** Fake strategic_directives_v2 (range-paginated select, N fresh chairman-gated SDs, no
 *  pre-existing chairman_decisions row) + chairman_decisions (insert-only — recordPendingDecision
 *  with skipEscalation:true never reads/updates it) + feedback (insert-only, unused here). */
function makeFakeSupabase(sds) {
  let seq = 0;
  const decisionRows = [];
  return {
    decisionRows,
    from(table) {
      if (table === 'strategic_directives_v2') {
        const api = {
          select: () => api,
          is: () => api,
          not: () => api,
          range: (from, to) => Promise.resolve({ data: sds.slice(from, to + 1), error: null }),
        };
        return api;
      }
      if (table === 'chairman_decisions') {
        const ctx = { filters: [] };
        const api = {
          insert(row) {
            ctx.op = 'insert';
            ctx.row = { id: `dec-${++seq}`, created_at: new Date().toISOString(), ...row };
            return api;
          },
          select() { if (!ctx.op) ctx.op = 'select'; return api; },
          eq(col, val) { ctx.filters.push([col, val]); return api; },
          or() { return api; }, // content-match — this fixture never has a pre-existing row to match
          async maybeSingle() {
            const idFilter = ctx.filters.find(([c]) => c === 'id');
            const row = idFilter ? decisionRows.find((r) => r.id === idFilter[1]) : null;
            return { data: row || null, error: null };
          },
          then(resolve) {
            if (ctx.op === 'insert') {
              decisionRows.push(ctx.row);
              resolve({ data: [{ id: ctx.row.id }], error: null });
            } else {
              // select/or content-match path (resolveExistingPendingDecision): no pre-existing
              // rows ever match in this fixture, so every candidate is a fresh hit.
              resolve({ data: [], error: null });
            }
          },
        };
        return api;
      }
      if (table === 'feedback') {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`makeFakeSupabase: unhandled table '${table}'`);
    },
  };
}

beforeEach(() => {
  escalateChairmanDecisionMock.mockClear();
});

describe('QF-20260830-670: one tick, N FENCED-SD hits => exactly one escalation call', () => {
  it('four chairman-gated SDs recorded in the same tick durably record all four rows and escalate exactly once', async () => {
    const old = new Date(Date.now() - 48 * 3600000).toISOString();
    const sds = Array.from({ length: 4 }, (_, i) => ({
      id: `sd-${i}`,
      sd_key: `SD-BATCH-00${i + 1}`,
      status: 'draft',
      created_at: old,
      metadata: { requires_human_action: true, human_decider: 'chairman' },
    }));
    const sb = makeFakeSupabase(sds);

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: new Date() });

    expect(result.hits).toBe(4);
    expect(result.recorded).toBe(4);
    expect(result.errors).toEqual([]);
    expect(sb.decisionRows.length).toBe(4); // every decision is still durably recorded, unconditionally

    expect(escalateChairmanDecisionMock).toHaveBeenCalledTimes(1); // NOT 4 — one send for the whole tick
    const [, escalatedId] = escalateChairmanDecisionMock.mock.calls[0];
    expect(escalatedId).toBe(sb.decisionRows[0].id); // primary = first recorded id
  });

  it('a single-hit tick still escalates (no regression for the common case)', async () => {
    const old = new Date(Date.now() - 48 * 3600000).toISOString();
    const sb = makeFakeSupabase([{
      id: 'sd-solo', sd_key: 'SD-SOLO-001', status: 'draft', created_at: old,
      metadata: { requires_human_action: true, human_decider: 'chairman' },
    }]);

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: new Date() });

    expect(result.recorded).toBe(1);
    expect(escalateChairmanDecisionMock).toHaveBeenCalledTimes(1);
  });

  it('zero hits => escalateChairmanDecision is never called', async () => {
    const sb = makeFakeSupabase([]);
    const result = await runChairmanGatedDecisionRowGuard(sb, { now: new Date() });
    expect(result.hits).toBe(0);
    expect(escalateChairmanDecisionMock).not.toHaveBeenCalled();
  });
});
