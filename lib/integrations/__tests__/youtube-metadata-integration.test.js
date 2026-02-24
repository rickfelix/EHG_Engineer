import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for YouTube metadata integration in idea-classifier.js.
 * SD: SD-LEO-FDBK-FIX-EVALUATE-YOUTUBE-VIDEO-001
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

import { classifyIdea } from '../idea-classifier.js';
import { getClassificationClient } from '../../llm/client-factory.js';

describe('idea-classifier YouTube metadata integration', () => {
  let mockSupabase;
  let mockLLMClient;

  const categories = [
    { category_type: 'venture_tag', code: 'ehg_core', label: 'EHG Core', classification_keywords: ['platform', 'core'] },
    { category_type: 'venture_tag', code: 'learning_resource', label: 'Learning', classification_keywords: ['learn', 'tutorial'] },
    { category_type: 'business_function', code: 'feature_idea', label: 'Feature', classification_keywords: ['feature', 'add'] },
    { category_type: 'business_function', code: 'content_strategy', label: 'Content', classification_keywords: ['content', 'video'] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Build a chainable mock for supabase queries
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

  it('includes rich YouTube metadata in LLM prompt', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "learning_resource", "business_function": "content_strategy", "confidence": 0.9}'
    );

    await classifyIdea('Watch this video', 'Check out this tutorial', {
      supabase: mockSupabase,
      item: {
        extracted_youtube_id: 'dQw4w9WgXcQ',
        youtube_metadata: {
          title: 'Advanced React Patterns',
          description: 'A deep dive into React hooks',
          channelName: 'Tech Channel',
          tags: ['react', 'hooks'],
          durationSeconds: 1200,
          publishedAt: '2026-01-01T00:00:00Z'
        }
      }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).toContain('YouTube Video Context:');
    expect(prompt).toContain('Advanced React Patterns');
    expect(prompt).toContain('Tech Channel');
    expect(prompt).toContain('react, hooks');
  });

  it('falls back to generic hint when no metadata available', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.7}'
    );

    await classifyIdea('Some video', '', {
      supabase: mockSupabase,
      item: { extracted_youtube_id: 'dQw4w9WgXcQ' }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).toContain('references a YouTube video');
    expect(prompt).toContain('dQw4w9WgXcQ');
    expect(prompt).not.toContain('YouTube Video Context:');
  });

  it('omits YouTube section when no video context', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.8}'
    );

    await classifyIdea('Regular task', 'No video here', {
      supabase: mockSupabase,
      item: { todoist_task_id: '123' }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).not.toContain('YouTube');
  });

  it('truncates long descriptions to 500 chars', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.8}'
    );

    const longDesc = 'A'.repeat(1000);
    await classifyIdea('Test', '', {
      supabase: mockSupabase,
      item: {
        extracted_youtube_id: 'dQw4w9WgXcQ',
        youtube_metadata: {
          title: 'Long Video', description: longDesc,
          channelName: 'Ch', tags: [], durationSeconds: 60, publishedAt: ''
        }
      }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).toContain('A'.repeat(500));
    expect(prompt).not.toContain('A'.repeat(501));
  });

  it('limits tags to first 10', async () => {
    mockLLMClient.complete.mockResolvedValue(
      '{"venture_tag": "ehg_core", "business_function": "feature_idea", "confidence": 0.8}'
    );

    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    await classifyIdea('Test', '', {
      supabase: mockSupabase,
      item: {
        extracted_youtube_id: 'dQw4w9WgXcQ',
        youtube_metadata: {
          title: 'Many Tags', description: '', channelName: 'Ch',
          tags, durationSeconds: 60, publishedAt: ''
        }
      }
    });

    const prompt = mockLLMClient.complete.mock.calls[0][1];
    expect(prompt).toContain('tag9');
    expect(prompt).not.toContain('tag10');
  });

  it('uses keyword fallback when LLM fails', async () => {
    getClassificationClient.mockRejectedValue(new Error('API unavailable'));

    const result = await classifyIdea('Watch tutorial video', 'content about learning', {
      supabase: mockSupabase,
      item: {
        extracted_youtube_id: 'dQw4w9WgXcQ',
        youtube_metadata: {
          title: 'Learn Tutorial', description: 'A learning video',
          channelName: 'Tutorials', tags: ['learn'], durationSeconds: 300, publishedAt: ''
        }
      }
    });

    expect(result).toHaveProperty('venture_tag');
    expect(result).toHaveProperty('business_function');
    expect(result.confidence_score).toBe(0.5);
  });
});
