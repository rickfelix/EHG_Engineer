import { describe, it, expect, vi } from 'vitest';
import { computeFreshness, effectiveConfidence, getByIndustry, upsert, getHierarchy } from '../../../lib/domain-intelligence/domain-knowledge-service.js';

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    industry: 'fintech',
    knowledge_type: 'market_data',
    title: 'Test entry',
    content: 'Test content',
    confidence: 0.8,
    last_verified_at: new Date().toISOString(),
    extraction_count: 1,
    segment: null,
    problem_area: null,
    ...overrides,
  };
}

describe('computeFreshness', () => {
  it('returns ~1 for entry verified just now', () => {
    const entry = makeEntry({ last_verified_at: new Date().toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.5 at half the expiry period', () => {
    const halfExpiry = new Date();
    halfExpiry.setDate(halfExpiry.getDate() - 45); // market_data expiry = 90
    const entry = makeEntry({ knowledge_type: 'market_data', last_verified_at: halfExpiry.toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(0.5, 1);
  });

  it('returns 0 when past expiry', () => {
    const old = new Date();
    old.setDate(old.getDate() - 100); // market_data expiry = 90
    const entry = makeEntry({ knowledge_type: 'market_data', last_verified_at: old.toISOString() });
    expect(computeFreshness(entry)).toBe(0);
  });

  it('uses type-specific expiry for competitor (60 days)', () => {
    const at30 = new Date();
    at30.setDate(at30.getDate() - 30);
    const entry = makeEntry({ knowledge_type: 'competitor', last_verified_at: at30.toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(0.5, 1);
  });

  it('uses type-specific expiry for pain_point (730 days)', () => {
    const at365 = new Date();
    at365.setDate(at365.getDate() - 365);
    const entry = makeEntry({ knowledge_type: 'pain_point', last_verified_at: at365.toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(0.5, 1);
  });

  it('uses type-specific expiry for regulation (365 days)', () => {
    const entry = makeEntry({ knowledge_type: 'regulation', last_verified_at: new Date().toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(1.0, 1);
  });

  it('falls back to 180 days for unknown knowledge_type', () => {
    const at90 = new Date();
    at90.setDate(at90.getDate() - 90);
    const entry = makeEntry({ knowledge_type: 'unknown_type', last_verified_at: at90.toISOString() });
    expect(computeFreshness(entry)).toBeCloseTo(0.5, 1);
  });

  it('never returns negative (clamps at 0)', () => {
    const ancient = new Date();
    ancient.setFullYear(ancient.getFullYear() - 10);
    const entry = makeEntry({ last_verified_at: ancient.toISOString() });
    expect(computeFreshness(entry)).toBe(0);
  });
});

describe('effectiveConfidence', () => {
  it('returns confidence * freshness for fresh entry', () => {
    const entry = makeEntry({ confidence: 0.8, last_verified_at: new Date().toISOString() });
    expect(effectiveConfidence(entry)).toBeCloseTo(0.8, 1);
  });

  it('returns 0 for fully expired entry', () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const entry = makeEntry({ confidence: 0.9, knowledge_type: 'market_data', last_verified_at: old.toISOString() });
    expect(effectiveConfidence(entry)).toBe(0);
  });

  it('handles missing confidence (defaults to 0)', () => {
    const entry = makeEntry({ confidence: undefined, last_verified_at: new Date().toISOString() });
    expect(effectiveConfidence(entry)).toBe(0);
  });

  it('returns reduced value for half-expired entry', () => {
    const half = new Date();
    half.setDate(half.getDate() - 45);
    const entry = makeEntry({ confidence: 1.0, knowledge_type: 'market_data', last_verified_at: half.toISOString() });
    expect(effectiveConfidence(entry)).toBeCloseTo(0.5, 1);
  });
});

describe('getByIndustry', () => {
  function createMockSupabase(data = [], error = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(function () {
            return {
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data, error }),
            };
          }),
        }),
      }),
    };
  }

  it('returns enriched entries sorted by effective_confidence', async () => {
    const entries = [
      makeEntry({ title: 'Low', confidence: 0.3 }),
      makeEntry({ title: 'High', confidence: 0.9 }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await getByIndustry(supabase, 'fintech');

    expect(result[0].title).toBe('High');
    expect(result[1].title).toBe('Low');
    expect(result[0]).toHaveProperty('freshness_score');
    expect(result[0]).toHaveProperty('effective_confidence');
  });

  it('throws on database error', async () => {
    const supabase = createMockSupabase(null, { message: 'Connection lost' });
    await expect(getByIndustry(supabase, 'fintech')).rejects.toThrow('[DomainIntelligence]');
  });

  it('returns empty array when no data', async () => {
    const supabase = createMockSupabase([]);
    const result = await getByIndustry(supabase, 'fintech');
    expect(result).toEqual([]);
  });

  it('queries the domain_knowledge table', async () => {
    const supabase = createMockSupabase([]);
    await getByIndustry(supabase, 'fintech');
    expect(supabase.from).toHaveBeenCalledWith('domain_knowledge');
  });
});

describe('upsert', () => {
  it('inserts new entry when no existing match', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: insertSingle,
          }),
        }),
      }),
    };

    const result = await upsert(supabase, {
      industry: 'fintech',
      knowledge_type: 'market_data',
      title: 'New insight',
      content: 'Some content',
    });

    expect(result).toEqual({ id: 'new-1' });
  });

  it('updates existing entry with incremented extraction_count', async () => {
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'existing-1' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'existing-1', extraction_count: 3 }, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          expect(data.extraction_count).toBe(4); // 3 + 1
          expect(data.confidence).toBeCloseTo(0.55); // 0.5 + 0.05
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: updateSingle,
              }),
            }),
          };
        }),
      }),
    };

    const result = await upsert(supabase, {
      industry: 'fintech',
      knowledge_type: 'market_data',
      title: 'Existing insight',
      content: 'Updated content',
    });

    expect(result).toEqual({ id: 'existing-1' });
  });

  it('caps confidence boost at 1.0', async () => {
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'cap-1' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cap-1', extraction_count: 5 }, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          expect(data.confidence).toBe(1.0); // min(1, 0.98 + 0.05) = 1.0
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: updateSingle,
              }),
            }),
          };
        }),
      }),
    };

    await upsert(supabase, {
      industry: 'fintech',
      knowledge_type: 'market_data',
      title: 'High confidence',
      content: 'Content',
      confidence: 0.98,
    });
  });

  it('throws on insert error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
          }),
        }),
      }),
    };

    await expect(upsert(supabase, {
      industry: 'fintech',
      knowledge_type: 'market_data',
      title: 'Bad insert',
      content: 'Content',
    })).rejects.toThrow('[DomainIntelligence] upsert insert failed');
  });
});

describe('getHierarchy', () => {
  function createMockSupabase(data = []) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(function () {
            return {
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data, error: null }),
            };
          }),
        }),
      }),
    };
  }

  it('groups entries by segment and problem_area', async () => {
    const entries = [
      makeEntry({ segment: 'payments', problem_area: 'fraud' }),
      makeEntry({ segment: 'payments', problem_area: 'compliance' }),
      makeEntry({ segment: 'lending', problem_area: 'risk' }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await getHierarchy(supabase, 'fintech');

    expect(result).toHaveProperty('payments');
    expect(result).toHaveProperty('lending');
    expect(result.payments).toHaveProperty('fraud');
    expect(result.payments).toHaveProperty('compliance');
    expect(result.lending).toHaveProperty('risk');
  });

  it('uses _general for null segment/problem_area', async () => {
    const entries = [
      makeEntry({ segment: null, problem_area: null }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await getHierarchy(supabase, 'fintech');

    expect(result).toHaveProperty('_general');
    expect(result._general).toHaveProperty('_general');
    expect(result._general._general).toHaveLength(1);
  });

  it('returns empty object for no entries', async () => {
    const supabase = createMockSupabase([]);
    const result = await getHierarchy(supabase, 'fintech');
    expect(result).toEqual({});
  });
});
