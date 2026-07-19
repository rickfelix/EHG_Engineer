/**
 * routing-consumption.test.js — FR-4 single routing-doctrine seam
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-D, child D).
 *
 * Stubbed supabase — no live reads. Proves the fail-closed trust posture (FR-4.2),
 * zero-trusted-rows parity with tier-ladder capabilityScore (FR-4.3), and the
 * anti-fork + contamination-inheritance guards (FR-4.4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveCapabilityRouting,
  gradedRoutingScore,
  REFERENCE_RESULT_COLUMNS,
  ROUTING_DOCTRINE_CONSUMERS,
} from '../routing-consumption.mjs';
import ladder from '../../fleet/tier-ladder.cjs';

const { capabilityScore, resolveRoutingScore } = ladder;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEAM_SRC = readFileSync(join(__dirname, '..', 'routing-consumption.mjs'), 'utf8');
const LADDER_SRC = readFileSync(join(__dirname, '..', '..', 'fleet', 'tier-ladder.cjs'), 'utf8');
const DISPATCH_SRC = readFileSync(join(__dirname, '..', '..', 'coordinator', 'dispatch.cjs'), 'utf8');

/** Chainable supabase stub; records filters, resolves {data, error} as a thenable. */
function makeStub({ rows = [], error = null, throws = false } = {}) {
  const calls = { table: null, select: null, eq: [] };
  const chain = {
    select(cols) { calls.select = cols; return chain; },
    eq(col, val) { calls.eq.push([col, val]); return chain; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error }).then(resolve, reject); },
  };
  const client = {
    from(table) {
      calls.table = table;
      if (throws) throw new Error('synthetic client fault');
      return chain;
    },
  };
  return { client, calls };
}

const TUPLE = { shape: 'R3-taste', model: 'opus', effort: 'high' };
const TRUSTED_ROW = {
  problem_shape: 'R3-taste', model_id: 'opus', effort: 'high',
  quality_score: 0.8, cost_norm: 3.25, trusted_for_routing: true,
};

describe('FR-4.2 fail-closed trust', () => {
  it('absent table (query error, e.g. PGRST205) returns fallback without throwing', async () => {
    const { client } = makeStub({ error: { code: 'PGRST205', message: 'relation missing' } });
    const score = await resolveCapabilityRouting({ supabase: client, ...TUPLE });
    expect(score).toBe(capabilityScore('opus', 'high'));
  });

  it('thrown client fault still resolves to fallback (CEREMONY_PENDING-safe)', async () => {
    const { client } = makeStub({ throws: true });
    await expect(resolveCapabilityRouting({ supabase: client, ...TUPLE })).resolves
      .toBe(capabilityScore('opus', 'high'));
  });

  it('table present, zero trusted rows for the tuple → fallback', async () => {
    const { client } = makeStub({ rows: [] });
    const score = await resolveCapabilityRouting({ supabase: client, ...TUPLE });
    expect(score).toBe(capabilityScore('opus', 'high'));
  });

  it('a trusted row present → its graded routing score (cost_norm preferred)', async () => {
    const { client } = makeStub({ rows: [TRUSTED_ROW] });
    const score = await resolveCapabilityRouting({ supabase: client, ...TUPLE });
    expect(score).toBe(3.25);
  });

  it('untrusted rows are structurally ignored: the query itself filters trusted_for_routing=true', async () => {
    const { client, calls } = makeStub({ rows: [] });
    await resolveCapabilityRouting({ supabase: client, ...TUPLE });
    expect(calls.table).toBe('model_capability_reference');
    expect(calls.eq).toContainEqual(['trusted_for_routing', true]);
  });

  it('no supabase / no shape short-circuits to fallback (no query attempted)', async () => {
    const { client, calls } = makeStub({ rows: [TRUSTED_ROW] });
    const score = await resolveCapabilityRouting({ supabase: client, shape: null, model: 'opus', effort: 'high' });
    expect(score).toBe(capabilityScore('opus', 'high'));
    expect(calls.table).toBeNull();
  });

  it('explicit fallback (number or fn) wins over the default', async () => {
    const { client } = makeStub({ rows: [] });
    await expect(resolveCapabilityRouting({ supabase: client, ...TUPLE, fallback: 42 })).resolves.toBe(42);
    await expect(resolveCapabilityRouting({ supabase: client, ...TUPLE, fallback: (m, e) => `${m}:${e}` }))
      .resolves.toBe('opus:high');
  });
});

describe('FR-4.3 behavior-preserving parity', () => {
  const REPRESENTATIVE = [
    ['fable', 'xhigh'], ['opus', 'high'], ['sonnet', 'medium'], ['haiku', 'low'],
  ];

  it('with zero trusted rows, seam output === capabilityScore for representative tuples', async () => {
    for (const [model, effort] of REPRESENTATIVE) {
      const { client } = makeStub({ rows: [] });
      const seam = await resolveCapabilityRouting({ supabase: client, shape: 'R1-compounding', model, effort });
      expect(seam).toBe(capabilityScore(model, effort));
    }
  });

  it('tier-ladder resolveRoutingScore adapter matches capabilityScore with an empty trusted set', async () => {
    for (const [model, effort] of REPRESENTATIVE) {
      const { client } = makeStub({ rows: [] });
      const viaAdapter = await resolveRoutingScore({ supabase: client, shape: 'R2-negative-space', model, effort });
      expect(viaAdapter).toBe(capabilityScore(model, effort));
    }
  });

  it('dispatch tiering is wired live through the adapter (reachability pin)', () => {
    expect(DISPATCH_SRC).toMatch(/resolveRoutingScore\(\{ supabase, shape/);
  });

  it('§17 consumption is a durable contract marker, not live forked code', () => {
    const c2 = ROUTING_DOCTRINE_CONSUMERS['foresight-board-section-17'];
    expect(c2.status).toBe('deferred-with-trigger');
    expect(c2.contract).toBe('C2');
    expect(ROUTING_DOCTRINE_CONSUMERS['dispatch-tiering'].status).toBe('live');
    expect(Object.isFrozen(ROUTING_DOCTRINE_CONSUMERS)).toBe(true);
  });
});

describe('FR-4.4 anti-fork + contamination inheritance', () => {
  it('single routing-score path: only the seam computes a graded score; the adapter delegates', () => {
    // Adapter delegates to the seam module (never re-derives a metric)...
    expect(LADDER_SRC).toContain("import('../eval/routing-consumption.mjs')");
    // ...and no second graded-score implementation exists in the tiering/dispatch modules.
    expect(LADDER_SRC).not.toMatch(/gradedRoutingScore\s*\(/);
    expect(DISPATCH_SRC).not.toMatch(/gradedRoutingScore\s*\(/);
    expect(SEAM_SRC.match(/export function gradedRoutingScore/g)).toHaveLength(1);
  });

  it('the seam selects only results-only reference columns (no task or key text)', () => {
    expect(REFERENCE_RESULT_COLUMNS).toEqual([
      'problem_shape', 'model_id', 'effort', 'quality_score', 'cost_norm', 'trusted_for_routing',
    ]);
    expect(Object.isFrozen(REFERENCE_RESULT_COLUMNS)).toBe(true);
    // Contamination inheritance: the seam source never references task/key content columns.
    expect(SEAM_SRC).not.toMatch(/task_text|answer_key|golden_task|expected_answer/);
    // The only .select() uses the allow-list constant, not an inline column string.
    expect(SEAM_SRC).toMatch(/\.select\(REFERENCE_RESULT_COLUMNS\.join\(','\)\)/);
    expect(SEAM_SRC.match(/\.select\(/g)).toHaveLength(1);
  });

  it('the seam is a read-only consumer: it never writes/flips trusted_for_routing', () => {
    expect(SEAM_SRC).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });
});

describe('gradedRoutingScore core', () => {
  it('averages cost_norm across trusted rows, falls back to quality_score per row', () => {
    expect(gradedRoutingScore([{ cost_norm: 2 }, { cost_norm: 4 }])).toBe(3);
    expect(gradedRoutingScore([{ cost_norm: null, quality_score: 0.5 }])).toBe(0.5);
    expect(gradedRoutingScore([])).toBeNull();
    expect(gradedRoutingScore([{ cost_norm: 'NaN-ish' }])).toBeNull();
  });
});
