import { describe, it, expect, vi } from 'vitest';
import { buildDomainContext } from '../../../lib/domain-intelligence/domain-expert-integration.js';

/**
 * Create a mock Supabase client that returns the given entries.
 */
function createMockSupabase(entries = [], error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(function () {
          return {
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: entries, error }),
          };
        }),
      }),
    }),
  };
}

function makeEntry(overrides = {}) {
  const now = new Date();
  return {
    id: 'test-id',
    industry: 'fintech',
    knowledge_type: 'market_data',
    title: 'Test knowledge',
    content: 'Test content about the market',
    confidence: 0.8,
    last_verified_at: now.toISOString(),
    extraction_count: 1,
    ...overrides,
  };
}

describe('buildDomainContext', () => {
  it('returns empty string when no supabase client', async () => {
    const result = await buildDomainContext(null, 'fintech');
    expect(result).toBe('');
  });

  it('returns empty string when no industry', async () => {
    const supabase = createMockSupabase([]);
    const result = await buildDomainContext(supabase, '');
    expect(result).toBe('');
  });

  it('returns empty string for empty domain_knowledge (cold start)', async () => {
    const supabase = createMockSupabase([]);
    const result = await buildDomainContext(supabase, 'fintech');
    expect(result).toBe('');
  });

  it('returns formatted context for fresh entries', async () => {
    const entries = [
      makeEntry({ title: 'Market size growing', content: 'TAM is $50B', knowledge_type: 'market_data', confidence: 0.9 }),
      makeEntry({ title: 'Key competitor', content: 'Acme Corp dominates SMB', knowledge_type: 'competitor', confidence: 0.7 }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await buildDomainContext(supabase, 'fintech');

    expect(result).toContain('## Domain Knowledge: fintech');
    expect(result).toContain('Market size growing');
    expect(result).toContain('Key competitor');
    expect(result).toContain('[market_data]');
    expect(result).toContain('[competitor]');
  });

  it('excludes stale entries with low effective confidence', async () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 365); // 1 year old

    const entries = [
      makeEntry({ title: 'Fresh data', confidence: 0.8 }),
      makeEntry({
        title: 'Stale competitor info',
        knowledge_type: 'competitor', // 60-day expiry
        confidence: 0.5,
        last_verified_at: staleDate.toISOString(),
      }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await buildDomainContext(supabase, 'fintech');

    expect(result).toContain('Fresh data');
    expect(result).not.toContain('Stale competitor info');
  });

  it('caps output at 2000 characters', async () => {
    const entries = [];
    for (let i = 0; i < 50; i++) {
      entries.push(makeEntry({
        title: `Knowledge item ${i} with long title padding ${'x'.repeat(50)}`,
        content: `Detailed content about item ${i} ${'y'.repeat(100)}`,
        confidence: 0.9,
      }));
    }
    const supabase = createMockSupabase(entries);
    const result = await buildDomainContext(supabase, 'fintech');

    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('respects custom maxChars option', async () => {
    const entries = [];
    for (let i = 0; i < 20; i++) {
      entries.push(makeEntry({
        title: `Item ${i}`,
        content: `Content ${i} ${'z'.repeat(50)}`,
        confidence: 0.9,
      }));
    }
    const supabase = createMockSupabase(entries);
    const result = await buildDomainContext(supabase, 'fintech', { maxChars: 500 });

    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('handles database errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = createMockSupabase(null, { message: 'Connection failed' });
    const result = await buildDomainContext(supabase, 'fintech');

    expect(result).toBe('');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DomainIntelligence]'));
    consoleSpy.mockRestore();
  });

  it('includes confidence percentage in output', async () => {
    const entries = [
      makeEntry({ title: 'High confidence item', confidence: 0.95, knowledge_type: 'trend' }),
    ];
    const supabase = createMockSupabase(entries);
    const result = await buildDomainContext(supabase, 'fintech');

    // Should include percentage (95% for fresh entry with 0.95 confidence)
    expect(result).toMatch(/\d+% confidence/);
    expect(result).toContain('[trend]');
  });
});
