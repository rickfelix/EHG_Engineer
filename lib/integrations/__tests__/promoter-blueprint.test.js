import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Promoter Blueprint framework integration.
 * SD: SD-LEO-FDBK-FEAT-VIDEO-EMPHASIZES-CEO-001
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn()
}));

vi.mock('../../llm/client-factory.js', () => ({
  getClassificationClient: vi.fn()
}));

import { classifyIdea, detectFrameworkStage } from '../idea-classifier.js';
import { formatPromotionContext } from '../evaluation-bridge.js';
import { getClassificationClient } from '../../llm/client-factory.js';

describe('detectFrameworkStage', () => {
  it('detects traffic stage', () => {
    expect(detectFrameworkStage('Drive more traffic with SEO and social media ads')).toBe('traffic');
  });

  it('detects holding_pattern stage', () => {
    expect(detectFrameworkStage('Build an email sequence for nurture and engagement')).toBe('holding_pattern');
  });

  it('detects selling_event stage', () => {
    expect(detectFrameworkStage('Create a landing page with call to action for the launch')).toBe('selling_event');
  });

  it('detects outcomes stage', () => {
    expect(detectFrameworkStage('Track revenue and ROI from upsell campaigns')).toBe('outcomes');
  });

  it('returns null for non-promotion content', () => {
    expect(detectFrameworkStage('Refactor the database migration script')).toBeNull();
  });

  it('picks the stage with most keyword matches', () => {
    // "traffic" + "ad campaign" = 2 matches for traffic
    // "landing page" = 1 match for selling_event
    expect(detectFrameworkStage('Run an ad campaign to drive traffic to the landing page')).toBe('traffic');
  });
});

describe('formatPromotionContext', () => {
  it('returns null for non-promotion items', () => {
    const item = { title: 'Fix database bug', description: 'Schema error in users table' };
    expect(formatPromotionContext(item)).toBeNull();
  });

  it('detects promotion keywords in item title', () => {
    const item = { title: 'Marketing campaign for product launch', description: '' };
    const ctx = formatPromotionContext(item);
    expect(ctx).not.toBeNull();
    expect(ctx.isPromotionRelated).toBe(true);
    expect(ctx.matchedKeywords).toContain('marketing');
    expect(ctx.matchedKeywords).toContain('campaign');
    expect(ctx.matchedKeywords).toContain('launch');
    expect(ctx.source).toBe('text_analysis');
  });

  it('detects promotion keywords in description', () => {
    const item = { title: 'Strategy doc', description: 'Build a funnel for lead generation and conversion' };
    const ctx = formatPromotionContext(item);
    expect(ctx).not.toBeNull();
    expect(ctx.matchedKeywords).toContain('funnel');
    expect(ctx.matchedKeywords).toContain('lead generation');
    expect(ctx.matchedKeywords).toContain('conversion');
  });

  it('includes YouTube metadata in keyword detection', () => {
    const item = { title: 'Watch this video', description: '' };
    const ytMeta = { title: 'Go To Market Launch Strategy', description: 'Traffic generation tips' };
    const ctx = formatPromotionContext(item, ytMeta);
    expect(ctx).not.toBeNull();
    expect(ctx.matchedKeywords).toContain('traffic');
    expect(ctx.matchedKeywords).toContain('go to market');
    expect(ctx.source).toBe('youtube_enriched');
  });

  it('returns correct keywordCount', () => {
    const item = { title: 'Revenue and conversion from marketing campaigns', description: '' };
    const ctx = formatPromotionContext(item);
    expect(ctx.keywordCount).toBeGreaterThanOrEqual(3);
  });
});

describe('classifyIdea with promoter_blueprint categories', () => {
  let mockSupabase;
  let mockLLMClient;

  const categories = [
    { category_type: 'venture_tag', code: 'ehg_core', label: 'EHG Core', classification_keywords: ['platform', 'core'] },
    { category_type: 'venture_tag', code: 'promoter_blueprint', label: 'Promoter Blueprint', classification_keywords: ['traffic', 'promotion', 'GTM', 'launch', 'conversion', 'selling', 'revenue generation', 'campaign', 'marketing'] },
    { category_type: 'business_function', code: 'feature_idea', label: 'Feature', classification_keywords: ['feature', 'add'] },
    { category_type: 'business_function', code: 'promotion_strategy', label: 'Promotion Strategy', classification_keywords: ['promote', 'marketing strategy', 'GTM strategy', 'campaign strategy'] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col) => {
            if (col === 'is_active') {
              return { order: vi.fn().mockResolvedValue({ data: categories }) };
            }
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] })
                })
              })
            };
          })
        })
      }))
    };

    mockLLMClient = { complete: vi.fn() };
    getClassificationClient.mockResolvedValue(mockLLMClient);
  });

  it('includes promotion framework hint in LLM prompt', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "promoter_blueprint", "business_function": "promotion_strategy", "confidence": 0.9}'
    );

    await classifyIdea('Launch a traffic campaign for revenue growth', 'Drive conversion through marketing', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).toContain('Promotion Framework Signal');
    expect(prompt).toContain('Promoter Blueprint');
  });

  it('adds framework_stage when classified as promoter_blueprint', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "promoter_blueprint", "business_function": "promotion_strategy", "confidence": 0.85}'
    );

    const result = await classifyIdea('Build a landing page with conversion tracking', '', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    expect(result.venture_tag).toBe('promoter_blueprint');
    expect(result.framework_stage).toBe('selling_event');
  });

  it('uses keyword fallback for promotion classification when LLM fails', async () => {
    getClassificationClient.mockRejectedValue(new Error('API unavailable'));

    const result = await classifyIdea('Marketing campaign strategy', 'GTM launch promotion selling', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    expect(result.venture_tag).toBe('promoter_blueprint');
    expect(result.confidence_score).toBe(0.5);
  });

  it('does not add framework_stage for non-promotion items', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.8}'
    );

    const result = await classifyIdea('Refactor database queries', '', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    expect(result.venture_tag).toBe('ehg_core');
    expect(result.framework_stage).toBeUndefined();
  });

  it('does not include promotion hint for non-marketing content', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.8}'
    );

    await classifyIdea('Fix the CI pipeline', 'Build system is broken', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).not.toContain('Promotion Framework Signal');
  });
});
