import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreVideoRelevance, scoreVideoBatch } from '../youtube-relevance-scorer.js';

// Mock the client-factory module
vi.mock('../../llm/client-factory.js', () => ({
  getLLMClient: vi.fn()
}));

import { getLLMClient } from '../../llm/client-factory.js';

describe('youtube-relevance-scorer', () => {
  const mockVideo = {
    title: 'Building AI Agents with LangChain',
    channel_name: 'Tech Channel',
    video_id: 'abc123'
  };

  const mockInterests = [
    { name: 'AI Automation', keywords: ['ai', 'agents', 'llm', 'automation'] },
    { name: 'SaaS', keywords: ['saas', 'subscription', 'b2b'] }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scores a relevant video with high score', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          score: 85,
          venture_tags: ['AI Automation'],
          reasoning: 'Directly about AI agent development'
        })
      })
    };
    getLLMClient.mockReturnValue(mockClient);

    const result = await scoreVideoRelevance(mockVideo, mockInterests);

    expect(result.score).toBe(85);
    expect(result.venture_tags).toEqual(['AI Automation']);
    expect(result.reasoning).toBe('Directly about AI agent development');
    expect(mockClient.complete).toHaveBeenCalledOnce();
  });

  it('clamps score to 0-100 range', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ score: 150, venture_tags: [], reasoning: 'test' })
      })
    };
    getLLMClient.mockReturnValue(mockClient);

    const result = await scoreVideoRelevance(mockVideo, mockInterests);
    expect(result.score).toBe(100);
  });

  it('returns score 0 on LLM failure', async () => {
    const mockClient = {
      complete: vi.fn().mockRejectedValue(new Error('LLM timeout'))
    };
    getLLMClient.mockReturnValue(mockClient);

    const result = await scoreVideoRelevance(mockVideo, mockInterests);

    expect(result.score).toBe(0);
    expect(result.venture_tags).toEqual([]);
    expect(result.reasoning).toContain('Scoring failed');
  });

  it('handles non-JSON LLM response', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        content: 'Sorry, I cannot process this request.'
      })
    };
    getLLMClient.mockReturnValue(mockClient);

    const result = await scoreVideoRelevance(mockVideo, mockInterests);

    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('Scoring failed');
  });

  it('handles missing venture_tags in response', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ score: 60, reasoning: 'Tangentially related' })
      })
    };
    getLLMClient.mockReturnValue(mockClient);

    const result = await scoreVideoRelevance(mockVideo, mockInterests);

    expect(result.score).toBe(60);
    expect(result.venture_tags).toEqual([]);
  });

  describe('scoreVideoBatch', () => {
    it('scores multiple videos sequentially', async () => {
      let callCount = 0;
      const mockClient = {
        complete: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            content: JSON.stringify({
              score: callCount * 30,
              venture_tags: ['AI Automation'],
              reasoning: `Video ${callCount}`
            })
          });
        })
      };
      getLLMClient.mockReturnValue(mockClient);

      const videos = [
        { ...mockVideo, video_id: 'v1' },
        { ...mockVideo, video_id: 'v2', title: 'Cooking Show' }
      ];

      const scores = await scoreVideoBatch(videos, mockInterests);

      expect(scores.size).toBe(2);
      expect(scores.get('v1').score).toBe(30);
      expect(scores.get('v2').score).toBe(60);
    });

    it('handles empty video list', async () => {
      const scores = await scoreVideoBatch([], mockInterests);
      expect(scores.size).toBe(0);
    });
  });
});
