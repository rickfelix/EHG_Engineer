/**
 * SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 — instrumentation + readout tests.
 *
 * TS-1: stampExecutionContext writes the context, preserves metadata, fail-soft.
 * TS-2: sumUsageInWindow sums only in-window usage blocks; skips bad lines.
 * TS-3: readout decision rule — INSUFFICIENT-N guard + within-5pp adoption.
 * TS-4: setArm round-trip — greenfield key, read-merge-write, provenance.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { stampExecutionContext, buildExecutionContext } from '../../lib/fleet/claim-stamp.cjs';
import { sumUsageInWindow, windowsFromMetadata } from '../../scripts/effort-experiment/attribute-tokens.mjs';
import { setArm } from '../../scripts/effort-experiment/set-arm.mjs';
import { buildCells, evaluateRule, MIN_N, RULE_TEXT } from '../../scripts/effort-experiment/readout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../fixtures/effort-experiment-session.jsonl');

// ---------- shared mock supabase ----------
function mockSupabase(tables, { writeError = null } = {}) {
  const calls = { updates: [] };
  const client = {
    from(table) {
      const rows = tables[table] || [];
      const q = {
        _rows: rows,
        select() { return q; },
        eq() { return q; },
        in() { return q; },
        or() { return q; },
        order() { return q; },
        limit: async (n) => ({ data: rows.slice(0, n), error: null }),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        single: async () => ({ data: rows[0] || null, error: rows[0] ? null : { message: 'none' } }),
        update(payload) {
          calls.updates.push({ table, payload });
          return { eq: async () => ({ error: writeError }) };
        }
      };
      return q;
    }
  };
  return { client, calls };
}

// ---------- TS-1: execution context stamp ----------
describe('TS-1 stampExecutionContext', () => {
  const SD = { id: 'aa4692db-732b-4719-ad79-595a5aa45f8e', sd_key: 'SD-X-001', sd_type: 'documentation', metadata: { keep: 1 } };

  it('stamps arm/model/class and preserves metadata', async () => {
    const { client, calls } = mockSupabase({
      strategic_directives_v2: [SD],
      claude_sessions: [{ metadata: { effort_arm: 'medium' } }],
      model_usage_log: [{ reported_model_id: 'claude-opus-4-8[1m]' }]
    });
    const ctx = await stampExecutionContext(client, SD.id, 'sess-1');
    expect(ctx.effort_arm).toBe('medium');
    expect(ctx.arm_source).toBe('coordinator');
    expect(ctx.model_id).toBe('claude-opus-4-8[1m]');
    expect(ctx.item_class).toBe('docs'); // documentation → docs
    const md = calls.updates.at(-1).payload.metadata;
    expect(md.keep).toBe(1);
    expect(md.execution_context.session_id).toBe('sess-1');
  });

  it('unassigned arm when session has no effort_arm; class derives from sd_type', async () => {
    const { client } = mockSupabase({
      strategic_directives_v2: [{ ...SD, sd_type: 'infrastructure' }],
      claude_sessions: [{ metadata: {} }],
      model_usage_log: []
    });
    const ctx = await buildExecutionContext(client, SD.id, 'sess-1');
    expect(ctx.effort_arm).toBeNull();
    expect(ctx.arm_source).toBe('unassigned');
    expect(ctx.item_class).toBe('code');
  });

  it('fail-soft: returns null on write error / throwing client, never throws', async () => {
    const { client } = mockSupabase({ strategic_directives_v2: [SD], claude_sessions: [], model_usage_log: [] }, { writeError: { message: 'boom' } });
    await expect(stampExecutionContext(client, SD.id, 's')).resolves.toBeNull();
    await expect(stampExecutionContext({ from() { throw new Error('x'); } }, SD.id, 's')).resolves.toBeNull();
  });

  it('preserves pre-existing execution_context keys (tokens merge)', async () => {
    const withTokens = { ...SD, metadata: { execution_context: { tokens: { input_tokens: 5, source: 'jsonl' } } } };
    const { client, calls } = mockSupabase({ strategic_directives_v2: [withTokens], claude_sessions: [], model_usage_log: [] });
    await stampExecutionContext(client, SD.id, 's');
    expect(calls.updates.at(-1).payload.metadata.execution_context.tokens.input_tokens).toBe(5);
  });
});

// ---------- TS-2: token attribution ----------
describe('TS-2 sumUsageInWindow', () => {
  it('sums only in-window usage blocks and skip-counts bad lines', async () => {
    const res = await sumUsageInWindow(FIXTURE, '2026-06-11T01:36:00Z', '2026-06-11T01:50:00Z');
    // 3 in-window blocks: 100+50+25 input, 500+700+300 output; the 02:30 block excluded
    expect(res.totals.input_tokens).toBe(175);
    expect(res.totals.output_tokens).toBe(1500);
    expect(res.totals.cache_creation_input_tokens).toBe(3500);
    expect(res.totals.cache_read_input_tokens).toBe(180000);
    expect(res.records).toBe(3);
    expect(res.skipped).toBe(1); // the non-JSON line mentioning "usage"
  });

  it('windowsFromMetadata derives windows from claim_history + completed_stamp_at', () => {
    const w = windowsFromMetadata({
      claim_history: [{ session_id: 'a', claimed_at: 't1' }, { session_id: 'b', claimed_at: 't2' }],
      completed_stamp_at: 't3'
    });
    expect(w).toEqual([
      { session_id: 'a', from: 't1', to: 't2' },
      { session_id: 'b', from: 't2', to: 't3' }
    ]);
  });
});

// ---------- TS-3: decision rule ----------
describe('TS-3 readout decision rule', () => {
  function sdsFor(arm, cls, count, firstPassRate) {
    return Array.from({ length: count }, (_, i) => ({
      id: `${arm}-${cls}-${i}`,
      created_at: '2026-06-11T00:00:00Z',
      completion_date: '2026-06-11T01:00:00Z',
      metadata: { execution_context: { effort_arm: arm, item_class: cls }, completed_stamp_at: '2026-06-11T01:00:00Z' },
      _pass: i < Math.round(count * firstPassRate)
    }));
  }
  function handoffsFor(sds) {
    const m = {};
    for (const sd of sds) m[sd.id] = sd._pass ? [{ status: 'accepted' }] : [{ status: 'rejected' }, { status: 'accepted' }];
    return m;
  }

  it('INSUFFICIENT-N: no recommendation below n=30 even if rates match', () => {
    const sds = [...sdsFor('xhigh', 'docs', MIN_N, 0.9), ...sdsFor('medium', 'docs', MIN_N - 1, 0.9)];
    const cells = buildCells(sds, handoffsFor(sds));
    expect(evaluateRule(cells)).toHaveLength(0);
  });

  it('adopts a lower tier within 5pp at n>=30; rejects beyond 5pp', () => {
    const sds = [
      ...sdsFor('xhigh', 'docs', 30, 0.9),
      ...sdsFor('medium', 'docs', 30, 0.867), // ~3.3pp below → adopt
      ...sdsFor('xhigh', 'code', 30, 0.9),
      ...sdsFor('medium', 'code', 30, 0.7)   // 20pp below → no adopt
    ];
    const cells = buildCells(sds, handoffsFor(sds));
    const recs = evaluateRule(cells);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ item_class: 'docs', adopt_arm: 'medium' });
  });

  it('rule text is pre-registered with the 5pp/30n constants', () => {
    expect(RULE_TEXT).toContain('5pp');
    expect(RULE_TEXT).toContain('n>=30');
  });
});

// ---------- TS-4: arm recording ----------
describe('TS-4 setArm', () => {
  it('writes effort_arm + provenance read-merge-write', async () => {
    const { client, calls } = mockSupabase({ claude_sessions: [{ metadata: { branch: 'main' } }] });
    const res = await setArm(client, 'sess-9', 'medium', { shift: 'night', setBy: 'coord-1' });
    expect(res.ok).toBe(true);
    const md = calls.updates[0].payload.metadata;
    expect(md.branch).toBe('main'); // preserved
    expect(md.effort_arm).toBe('medium');
    expect(md.arm_shift).toBe('night');
    expect(md.arm_set_by).toBe('coord-1');
  });

  it('rejects invalid arms and missing sessions', async () => {
    const { client } = mockSupabase({ claude_sessions: [] });
    expect((await setArm(client, 's', 'turbo')).ok).toBe(false);
    expect((await setArm(client, 'nope', 'high')).ok).toBe(false);
  });
});
