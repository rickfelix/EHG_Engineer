import { describe, it, expect } from 'vitest';
import {
  normalizeRegionKey,
  validateEvidence,
  isMissingTableError,
  upsertRegionScore,
  EVIDENCE_SCHEMA_VERSION,
} from '../../../lib/fable-suitability/map-writer.mjs';

/** Minimal evidence blob that satisfies validateEvidence. */
function goodEvidence(overrides = {}) {
  return {
    evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
    axes: {
      impact: { score: 4, inputs: {}, rationale: 'high blast radius' },
      opportunity: { score: 3, inputs: {}, rationale: 'moderate churn' },
      reasoning_depth: { score: 5, inputs: {}, rationale: 'deep cross-module reasoning' },
    },
    recurrence: { weight: 1.2, count: 3, source_ids: ['a', 'b', 'c'] },
    scored_by: 'fable-scoring-engine',
    computed_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Fake supabase whose .upsert(...).select().maybeSingle() resolves to a caller-supplied
 * { data, error }. Records the table name it was pointed at (TS-5 table-name spy) and the
 * onConflict target so we can assert the history-preserving key.
 */
function fakeSupabase({ data = null, error = null } = {}) {
  const calls = { from: [], onConflict: [], rowUpserted: null };
  const builder = {
    upsert(row, opts) {
      calls.rowUpserted = row;
      calls.onConflict.push(opts?.onConflict);
      return {
        select() {
          return { maybeSingle: async () => ({ data: data === '__echo__' ? row : data, error }) };
        },
      };
    },
  };
  return {
    calls,
    from(table) {
      calls.from.push(table);
      return builder;
    },
  };
}

describe('normalizeRegionKey', () => {
  it('canonicalizes case, backslashes, duplicate + edge slashes', () => {
    expect(normalizeRegionKey('  EHG_Engineer\\Lib\\\\Sub-Agents/  ')).toBe('ehg_engineer/lib/sub-agents');
  });
  it('rejects empty / non-string', () => {
    expect(() => normalizeRegionKey('')).toThrow();
    expect(() => normalizeRegionKey(null)).toThrow();
  });
  it('rejects a key that cannot normalize to the canonical shape', () => {
    // A colon is not permitted by the region_key CHECK regex; it must fail loud, not silently pass.
    expect(() => normalizeRegionKey('c:foo')).toThrow();
  });
});

describe('validateEvidence', () => {
  it('accepts a well-formed evidence blob', () => {
    expect(validateEvidence(goodEvidence())).toBe(true);
  });
  it('rejects wrong schema version', () => {
    expect(() => validateEvidence(goodEvidence({ evidence_schema_version: 99 }))).toThrow();
  });
  it('rejects an out-of-range axis score', () => {
    const ev = goodEvidence();
    ev.axes.impact.score = 9;
    expect(() => validateEvidence(ev)).toThrow();
  });
  it('rejects a missing rationale', () => {
    const ev = goodEvidence();
    ev.axes.opportunity.rationale = '';
    expect(() => validateEvidence(ev)).toThrow();
  });
});

describe('isMissingTableError', () => {
  it('types PGRST205 (the REAL supabase-js/PostgREST missing-table code) as missing-table', () => {
    // This is what the live DB actually returns for an absent table — verified against the real
    // Supabase project. The raw-SQL 42P01 below never surfaces on the .from() path.
    expect(isMissingTableError({
      code: 'PGRST205',
      message: "Could not find the table 'public.fable_suitability_map' in the schema cache",
    })).toBe(true);
  });
  it('types raw Postgres 42P01 as missing-table (direct-SQL / RPC path)', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
  });
  it('does NOT type an unrelated error as missing-table (no blanket catch)', () => {
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError({ code: 'PGRST116', message: 'no rows' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe('upsertRegionScore', () => {
  it('TS-1: history-preserving — upserts on (region_key, repo, score_version) and targets fable_suitability_map', async () => {
    const supabase = fakeSupabase({ data: '__echo__' });
    const res = await upsertRegionScore(supabase, {
      region_key: 'EHG_Engineer/lib/gates',
      repo: 'EHG_Engineer',
      score_version: 2,
      duty_cluster: 'harness-depth',
      axis_impact: 4,
      axis_opportunity: 3,
      axis_reasoning_depth: 5,
      composite_score: 60,
      evidence: goodEvidence(),
    });
    expect(res.status).toBe('ok');
    expect(supabase.calls.from).toContain('fable_suitability_map'); // TS-5 table-name spy
    expect(supabase.calls.onConflict).toContain('region_key,repo,score_version');
    expect(supabase.calls.rowUpserted.region_key).toBe('ehg_engineer/lib/gates'); // normalized
  });

  it('TS-2: typed CEREMONY_PENDING on 42P01, not a throw', async () => {
    const supabase = fakeSupabase({ error: { code: '42P01', message: 'relation "fable_suitability_map" does not exist' } });
    const res = await upsertRegionScore(supabase, {
      region_key: 'ehg/app',
      repo: 'EHG',
      score_version: 1,
      duty_cluster: 'dedup',
      evidence: goodEvidence(),
    });
    expect(res.status).toBe('CEREMONY_PENDING');
  });

  it('TS-3a: a non-42P01 DB error propagates (not swallowed as ceremony-pending)', async () => {
    const supabase = fakeSupabase({ error: { code: '23514', message: 'check constraint violated' } });
    await expect(
      upsertRegionScore(supabase, {
        region_key: 'ehg/app',
        repo: 'EHG',
        score_version: 1,
        duty_cluster: 'dedup',
        evidence: goodEvidence(),
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it('TS-3b: rejects an invalid duty_cluster before touching the DB', async () => {
    const supabase = fakeSupabase({ data: '__echo__' });
    await expect(
      upsertRegionScore(supabase, {
        region_key: 'ehg/app',
        repo: 'EHG',
        score_version: 1,
        duty_cluster: 'not-a-cluster',
        evidence: goodEvidence(),
      }),
    ).rejects.toThrow(/duty_cluster/);
    expect(supabase.calls.from).toHaveLength(0); // guarded before any DB call
  });
});
