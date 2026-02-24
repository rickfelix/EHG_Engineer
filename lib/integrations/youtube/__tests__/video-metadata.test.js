import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    youtube: vi.fn()
  }
}));

vi.mock('../oauth-manager.js', () => ({
  getAuthenticatedClient: vi.fn()
}));

import { fetchVideoMetadata } from '../video-metadata.js';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '../oauth-manager.js';

describe('fetchVideoMetadata', () => {
  let mockYouTubeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockYouTubeClient = {
      videos: { list: vi.fn() }
    };
    google.youtube.mockReturnValue(mockYouTubeClient);
    getAuthenticatedClient.mockResolvedValue({});
  });

  it('returns null for empty videoId', async () => {
    expect(await fetchVideoMetadata(null)).toBeNull();
    expect(await fetchVideoMetadata('')).toBeNull();
    expect(await fetchVideoMetadata(undefined)).toBeNull();
  });

  it('returns null for videoId not 11 characters', async () => {
    expect(await fetchVideoMetadata('short')).toBeNull();
    expect(await fetchVideoMetadata('toolongvideoidentifier')).toBeNull();
  });

  it('fetches metadata for valid video ID', async () => {
    mockYouTubeClient.videos.list.mockResolvedValue({
      data: {
        items: [{
          snippet: {
            title: 'Test Video Title',
            description: 'A test description',
            channelTitle: 'Test Channel',
            tags: ['tag1', 'tag2'],
            publishedAt: '2026-01-15T10:00:00Z'
          },
          contentDetails: { duration: 'PT1H23M45S' }
        }]
      }
    });

    const result = await fetchVideoMetadata('dQw4w9WgXcQ');

    expect(result).toEqual({
      title: 'Test Video Title',
      description: 'A test description',
      channelName: 'Test Channel',
      tags: ['tag1', 'tag2'],
      durationSeconds: 5025,
      publishedAt: '2026-01-15T10:00:00Z'
    });

    expect(mockYouTubeClient.videos.list).toHaveBeenCalledWith({
      part: ['snippet', 'contentDetails'],
      id: ['dQw4w9WgXcQ']
    });
  });

  it('returns null when video not found', async () => {
    mockYouTubeClient.videos.list.mockResolvedValue({ data: { items: [] } });
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null on API error (fail-open)', async () => {
    mockYouTubeClient.videos.list.mockRejectedValue(new Error('Quota exceeded'));
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null on OAuth error (fail-open)', async () => {
    getAuthenticatedClient.mockRejectedValue(new Error('No stored tokens'));
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('handles missing snippet fields gracefully', async () => {
    mockYouTubeClient.videos.list.mockResolvedValue({
      data: { items: [{ snippet: { title: 'Minimal' }, contentDetails: {} }] }
    });

    const result = await fetchVideoMetadata('dQw4w9WgXcQ');
    expect(result).toEqual({
      title: 'Minimal',
      description: '',
      channelName: '',
      tags: [],
      durationSeconds: 0,
      publishedAt: ''
    });
  });

  it('parses various ISO 8601 durations', async () => {
    const cases = [
      { duration: 'PT5M30S', expected: 330 },
      { duration: 'PT2H', expected: 7200 },
      { duration: 'PT45S', expected: 45 },
      { duration: 'PT10M', expected: 600 },
    ];

    for (const { duration, expected } of cases) {
      mockYouTubeClient.videos.list.mockResolvedValue({
        data: { items: [{ snippet: { title: 'Test' }, contentDetails: { duration } }] }
      });
      const result = await fetchVideoMetadata('dQw4w9WgXcQ');
      expect(result.durationSeconds).toBe(expected);
    }
  });
});
