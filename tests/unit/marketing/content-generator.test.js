/**
 * Content Generator Unit Tests
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Anthropic SDK before importing content generator
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            text: JSON.stringify([
              { headline: 'Test Headline A', body: 'Test body A', cta: 'Learn more' },
              { headline: 'Test Headline B', body: 'Test body B', cta: 'Get started' }
            ])
          }]
        })
      }
    }))
  };
});

// Mock supabase
function createMockSupabase() {
  const mock = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'test-content-id' }, error: null })
  };
  mock.from.mockReturnValue(mock);
  return mock;
}

describe('Content Generator', () => {
  let generateContent, transitionContentState;
  let mockSupabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();

    // Configure mock chain for insert().select().single()
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'test-content-id' }, error: null })
      })
    };
    const variantInsertChain = {
      select: vi.fn().mockResolvedValue({
        data: [
          { id: 'v1', variant_key: 'variant_a', headline: 'Test A', body: 'Body A', cta: 'CTA A' },
          { id: 'v2', variant_key: 'variant_b', headline: 'Test B', body: 'Body B', cta: 'CTA B' }
        ],
        error: null
      })
    };

    let insertCallCount = 0;
    mockSupabase.from = vi.fn((table) => ({
      insert: vi.fn(() => {
        insertCallCount++;
        // First insert = marketing_content, second = marketing_content_variants
        return insertCallCount <= 1 ? insertChain : variantInsertChain;
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    }));

    const mod = await import('../../../lib/marketing/content-generator.js');
    generateContent = mod.generateContent;
    transitionContentState = mod.transitionContentState;
  });

  it('should generate content with 2 variants', async () => {
    const result = await generateContent({
      supabase: mockSupabase,
      ventureId: 'venture-123',
      ventureContext: {
        name: 'Test Venture',
        description: 'A test venture',
        targetAudience: 'Developers',
        industry: 'Technology'
      },
      contentType: 'social_post',
      platform: 'x'
    });

    expect(result.contentId).toBe('test-content-id');
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0].variant_key).toBe('variant_a');
    expect(result.variants[1].variant_key).toBe('variant_b');
  });

  it('should reject invalid content types', async () => {
    await expect(generateContent({
      supabase: mockSupabase,
      ventureId: 'venture-123',
      ventureContext: { name: 'Test' },
      contentType: 'invalid_type'
    })).rejects.toThrow('Invalid content type');
  });

  it('should transition content lifecycle state', async () => {
    await transitionContentState(mockSupabase, 'content-123', 'REVIEW');
    expect(mockSupabase.from).toHaveBeenCalledWith('marketing_content');
  });

  it('should reject invalid lifecycle states', async () => {
    await expect(
      transitionContentState(mockSupabase, 'content-123', 'INVALID')
    ).rejects.toThrow('Invalid lifecycle state');
  });
});
