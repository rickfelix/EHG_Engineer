import { describe, it, expect, vi } from 'vitest';
import { classifyKnowledgeType, extractInsights, accumulateFromSession } from '../../../lib/domain-intelligence/knowledge-accumulator.js';

describe('classifyKnowledgeType', () => {
  it('classifies competitor mentions', () => {
    expect(classifyKnowledgeType('Our main competitor Acme Corp')).toBe('competitor');
    expect(classifyKnowledgeType('Rivals in the space')).toBe('competitor');
    expect(classifyKnowledgeType('Alternatives to our product')).toBe('competitor');
  });

  it('classifies regulation mentions', () => {
    expect(classifyKnowledgeType('GDPR compliance requirements')).toBe('regulation');
    expect(classifyKnowledgeType('New legal framework')).toBe('regulation');
    expect(classifyKnowledgeType('HIPAA certification needed')).toBe('regulation');
  });

  it('classifies technology mentions', () => {
    expect(classifyKnowledgeType('New API platform launched')).toBe('technology');
    expect(classifyKnowledgeType('Tech stack migration')).toBe('technology');
  });

  it('classifies trend mentions', () => {
    expect(classifyKnowledgeType('Emerging market growth')).toBe('trend');
    expect(classifyKnowledgeType('Industry forecast for 2027')).toBe('trend');
  });

  it('classifies pain point mentions', () => {
    expect(classifyKnowledgeType('Customer pain with onboarding')).toBe('pain_point');
    expect(classifyKnowledgeType('Biggest challenge is retention')).toBe('pain_point');
  });

  it('defaults to market_data for unclassified text', () => {
    expect(classifyKnowledgeType('Revenue figures Q3 2026')).toBe('market_data');
    expect(classifyKnowledgeType('Pricing analysis')).toBe('market_data');
  });

  it('handles null/empty input', () => {
    expect(classifyKnowledgeType(null)).toBe('market_data');
    expect(classifyKnowledgeType('')).toBe('market_data');
    expect(classifyKnowledgeType(undefined)).toBe('market_data');
  });
});

describe('extractInsights', () => {
  it('extracts from topic and conclusion', () => {
    const session = {
      topic: 'Market entry strategy for fintech',
      conclusion: 'Focus on underserved SMB segment',
    };
    const insights = extractInsights(session);
    expect(insights.length).toBe(1);
    expect(insights[0].title).toBe('Market entry strategy for fintech');
    expect(insights[0].content).toBe('Focus on underserved SMB segment');
    expect(insights[0].knowledge_type).toBe('market_data');
  });

  it('uses topic as content when no conclusion', () => {
    const session = { topic: 'Competitor analysis for SaaS tools' };
    const insights = extractInsights(session);
    expect(insights.length).toBe(1);
    expect(insights[0].content).toBe('Competitor analysis for SaaS tools');
    expect(insights[0].knowledge_type).toBe('competitor');
  });

  it('extracts from metadata.key_insights strings', () => {
    const session = {
      topic: 'Industry research',
      metadata: {
        key_insights: [
          'Competitor X raised $50M',
          'New regulation pending in EU',
        ],
      },
    };
    const insights = extractInsights(session);
    expect(insights.length).toBe(3); // 1 topic + 2 key_insights
    expect(insights[1].knowledge_type).toBe('competitor');
    expect(insights[2].knowledge_type).toBe('regulation');
  });

  it('extracts from metadata.key_insights objects', () => {
    const session = {
      topic: 'Tech review',
      metadata: {
        key_insights: [
          { title: 'API performance', content: 'Response times are trending up', knowledge_type: 'technology' },
        ],
      },
    };
    const insights = extractInsights(session);
    expect(insights.length).toBe(2);
    expect(insights[1].title).toBe('API performance');
    expect(insights[1].knowledge_type).toBe('technology');
  });

  it('handles null/empty session fields', () => {
    expect(extractInsights({})).toEqual([]);
    expect(extractInsights({ topic: null })).toEqual([]);
    expect(extractInsights({ topic: '', metadata: {} })).toEqual([]);
  });

  it('skips empty insight strings', () => {
    const session = {
      topic: 'Test',
      metadata: { key_insights: ['', '  ', null, 'Valid insight'] },
    };
    const insights = extractInsights(session);
    expect(insights.length).toBe(2); // topic + 1 valid
  });

  it('truncates long titles to 200 chars', () => {
    const session = { topic: 'A'.repeat(300) };
    const insights = extractInsights(session);
    expect(insights[0].title.length).toBe(200);
  });
});

describe('accumulateFromSession', () => {
  function createMockSupabase(responses = {}) {
    const selectMock = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertMock = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
      }),
    };
    const updateMock = {
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
        }),
      }),
    };

    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectMock),
        insert: vi.fn().mockReturnValue(insertMock),
        update: vi.fn().mockReturnValue(updateMock),
      }),
    };
  }

  it('returns 0 for missing session', async () => {
    const supabase = createMockSupabase();
    const count = await accumulateFromSession({ session: null, venture: { industry: 'tech' }, supabase });
    expect(count).toBe(0);
  });

  it('returns 0 for missing venture industry', async () => {
    const supabase = createMockSupabase();
    const count = await accumulateFromSession({ session: { topic: 'test' }, venture: {}, supabase });
    expect(count).toBe(0);
  });

  it('returns 0 for missing supabase', async () => {
    const count = await accumulateFromSession({ session: { topic: 'test' }, venture: { industry: 'tech' }, supabase: null });
    expect(count).toBe(0);
  });

  it('accumulates insights from valid session', async () => {
    const supabase = createMockSupabase();
    const count = await accumulateFromSession({
      session: { id: 'sess-1', topic: 'Market expansion in fintech' },
      venture: { industry: 'fintech', id: 'v-1' },
      supabase,
    });
    expect(count).toBe(1);
    expect(supabase.from).toHaveBeenCalledWith('domain_knowledge');
  });

  it('handles upsert errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }),
    };

    const count = await accumulateFromSession({
      session: { topic: 'Test topic' },
      venture: { industry: 'tech' },
      supabase,
    });
    expect(count).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DomainIntelligence]'));
    consoleSpy.mockRestore();
  });
});
