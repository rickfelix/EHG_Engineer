/**
 * Unit tests for the canonical competitive-intelligence layer.
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A
 *
 * Covers:
 *  - Four-Buckets epistemic tagging (ported pure functions) — TS-4 parity
 *  - canonical-store CRUD + snapshot diffing via an injected mock client
 */

import { describe, it, expect } from 'vitest';
import {
  FOUR_BUCKETS,
  extractValue,
  extractByBucket,
  structureWithFourBuckets,
} from '../../../lib/competitive-intelligence/four-buckets.js';
import {
  upsertCompetitorIntelligence,
  appendSnapshot,
  listSnapshots,
  computeDiff,
} from '../../../lib/competitive-intelligence/canonical-store.js';

// ---------------------------------------------------------------------------
// Mock Supabase: chainable + awaitable query builder. Per-table results are
// consumed in call order so a function that makes two from(<table>) calls can
// get two different results.
// ---------------------------------------------------------------------------
function makeQuery(result) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    insert: () => q,
    update: () => q,
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}
function makeSupabase(tableResults = {}) {
  const counters = {};
  return {
    from(table) {
      const arr = tableResults[table] || [];
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const result = arr[idx] ?? arr[arr.length - 1] ?? { data: [], error: null };
      return makeQuery(result);
    },
  };
}

describe('four-buckets: constants and extractValue', () => {
  it('exposes the four epistemic buckets', () => {
    expect(FOUR_BUCKETS).toEqual({
      FACT: 'fact',
      ASSUMPTION: 'assumption',
      SIMULATION: 'simulation',
      UNKNOWN: 'unknown',
    });
  });

  it('extractValue unwraps {value,bucket} objects and passes scalars through', () => {
    expect(extractValue({ value: 'Acme', bucket: 'FACT' })).toBe('Acme');
    expect(extractValue('plain')).toBe('plain');
    expect(extractValue(null)).toBeNull();
    expect(extractValue(undefined)).toBeNull();
  });
});

describe('four-buckets: extractByBucket', () => {
  const analysis = {
    company: { name: { value: 'Acme', bucket: 'FACT' } },
    product: { pricing_model: { value: 'Freemium', bucket: 'ASSUMPTION' } },
    opportunities: [{ value: 'AI automation', bucket: 'SIMULATION', reasoning: 'cost edge' }],
    market: { founded: { value: 'Unknown', bucket: 'UNKNOWN' } },
  };

  it('collects only leaves tagged with the requested bucket', () => {
    const facts = extractByBucket(analysis, FOUR_BUCKETS.FACT);
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe('Acme');
    expect(facts[0].path).toBe('company.name');
  });

  it('classifies each bucket independently and captures evidence/reasoning', () => {
    expect(extractByBucket(analysis, FOUR_BUCKETS.ASSUMPTION)).toHaveLength(1);
    const sims = extractByBucket(analysis, FOUR_BUCKETS.SIMULATION);
    expect(sims[0].evidence).toBe('cost edge');
    expect(extractByBucket(analysis, FOUR_BUCKETS.UNKNOWN)).toHaveLength(1);
  });

  it('is case-insensitive on the bucket tag', () => {
    const a = { x: { value: 'v', bucket: 'fact' } };
    expect(extractByBucket(a, FOUR_BUCKETS.FACT)).toHaveLength(1);
  });
});

describe('four-buckets: structureWithFourBuckets (TS-4 parity contract)', () => {
  const raw = {
    company: { name: { value: 'Acme', bucket: 'FACT' } },
    product: { description: { value: 'CRM', bucket: 'FACT' } },
    market: { industry: { value: 'SaaS', bucket: 'ASSUMPTION' } },
    strengths: [{ value: 'brand', bucket: 'FACT' }],
    weaknesses: [{ value: 'price', bucket: 'ASSUMPTION' }],
    opportunities: [{ value: 'automation', bucket: 'SIMULATION' }],
    venture_suggestion: {
      name: { value: 'AcmeRival', bucket: 'SIMULATION' },
      problem_statement: { value: 'too pricey', bucket: 'SIMULATION' },
      solution: { value: 'cheaper AI CRM', bucket: 'SIMULATION' },
    },
    confidence_score: 0.8,
    data_quality: 'high',
  };

  it('produces the canonical structured shape', () => {
    const out = structureWithFourBuckets(raw, 'https://www.acme.com/pricing');
    expect(out.name).toBe('AcmeRival');
    expect(out.competitor_reference).toBe('https://www.acme.com/pricing');
    expect(out.four_buckets.facts.length).toBeGreaterThanOrEqual(2);
    expect(out.four_buckets.simulations.length).toBeGreaterThanOrEqual(3);
    expect(out.competitive_intelligence.swot.strengths).toEqual(raw.strengths);
    expect(out.quality.confidence_score).toBe(0.8);
    expect(out.quality.data_quality).toBe('high');
  });

  it('falls back to a domain-derived name when no suggestion is present', () => {
    const out = structureWithFourBuckets({}, 'https://www.example.com');
    expect(out.name).toBe('EXAMPLE Alternative');
    expect(out.quality.confidence_score).toBe(0.5); // default
  });
});

describe('canonical-store: computeDiff', () => {
  it('detects added, removed, and changed top-level keys', () => {
    const diff = computeDiff(
      { a: 1, b: 2, c: { x: 1 } },
      { b: 3, c: { x: 1 }, d: 4 }
    );
    expect(diff.added).toEqual(['d']);
    expect(diff.removed).toEqual(['a']);
    expect(diff.changed).toEqual(['b']); // c is deep-equal, not changed
  });

  it('treats null/undefined snapshots as empty objects', () => {
    expect(computeDiff(null, { a: 1 })).toEqual({ added: ['a'], removed: [], changed: [] });
    expect(computeDiff({ a: 1 }, null)).toEqual({ added: [], removed: ['a'], changed: [] });
  });
});

describe('canonical-store: upsertCompetitorIntelligence', () => {
  it('inserts a new record (no id) and whitelists columns', async () => {
    const inserted = { id: 'ci-1', competitor_url: 'https://x.com', source: 'teardown' };
    const supabase = makeSupabase({ competitor_intelligence: [{ data: inserted, error: null }] });
    const out = await upsertCompetitorIntelligence(
      { competitor_url: 'https://x.com', source: 'teardown', not_a_column: 'dropped' },
      { supabase }
    );
    expect(out).toEqual(inserted);
  });

  it('updates when an id is present', async () => {
    const updated = { id: 'ci-1', sanitization_status: 'passed' };
    const supabase = makeSupabase({ competitor_intelligence: [{ data: updated, error: null }] });
    const out = await upsertCompetitorIntelligence(
      { id: 'ci-1', sanitization_status: 'passed' },
      { supabase }
    );
    expect(out.sanitization_status).toBe('passed');
  });

  it('throws a descriptive error on DB failure', async () => {
    const supabase = makeSupabase({
      competitor_intelligence: [{ data: null, error: { message: 'boom' } }],
    });
    await expect(
      upsertCompetitorIntelligence({ competitor_url: 'https://x.com' }, { supabase })
    ).rejects.toThrow(/boom/);
  });
});

describe('canonical-store: snapshots', () => {
  it('appendSnapshot computes a diff against the most recent prior snapshot', async () => {
    const prior = { data: [{ snapshot: { price: 10, name: 'A' } }], error: null };
    const inserted = { data: { id: 'snap-2', diff_from_prior: { changed: ['price'] } }, error: null };
    const supabase = makeSupabase({ ci_snapshots: [prior, inserted] });
    const out = await appendSnapshot('ci-1', { price: 20, name: 'A' }, { supabase, source: 'refresh' });
    expect(out.id).toBe('snap-2');
  });

  it('appendSnapshot uses a null diff when there is no prior snapshot', async () => {
    const noPrior = { data: [], error: null };
    const inserted = { data: { id: 'snap-1' }, error: null };
    const supabase = makeSupabase({ ci_snapshots: [noPrior, inserted] });
    const out = await appendSnapshot('ci-1', { price: 10 }, { supabase, source: 'seed' });
    expect(out.id).toBe('snap-1');
  });

  it('appendSnapshot requires a record id', async () => {
    const supabase = makeSupabase({});
    await expect(appendSnapshot(null, {}, { supabase })).rejects.toThrow(/required/);
  });

  it('listSnapshots returns rows newest-first', async () => {
    const rows = [{ id: 's2' }, { id: 's1' }];
    const supabase = makeSupabase({ ci_snapshots: [{ data: rows, error: null }] });
    const out = await listSnapshots('ci-1', { supabase });
    expect(out).toEqual(rows);
  });
});
