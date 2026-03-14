import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchVideoMetadata } from '../video-metadata.js';

describe('fetchVideoMetadata', () => {
  const originalEnv = process.env.YOUTUBE_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOUTUBE_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.YOUTUBE_API_KEY = originalEnv;
    } else {
      delete process.env.YOUTUBE_API_KEY;
    }
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(data, ok = true, status = 200) {
    fetch.mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(data),
    });
  }

  it('returns null for empty videoId', async () => {
    expect(await fetchVideoMetadata(null)).toBeNull();
    expect(await fetchVideoMetadata('')).toBeNull();
    expect(await fetchVideoMetadata(undefined)).toBeNull();
  });

  it('returns null for videoId not 11 characters', async () => {
    expect(await fetchVideoMetadata('short')).toBeNull();
    expect(await fetchVideoMetadata('toolongvideoidentifier')).toBeNull();
  });

  it('returns null when YOUTUBE_API_KEY not set', async () => {
    delete process.env.YOUTUBE_API_KEY;
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches metadata for valid video ID', async () => {
    mockFetchResponse({
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

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toContain('dQw4w9WgXcQ');
    expect(fetch.mock.calls[0][0]).toContain('test-api-key');
  });

  it('returns null when video not found', async () => {
    mockFetchResponse({ items: [] });
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null when items array is missing', async () => {
    mockFetchResponse({});
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null on API error (fail-open)', async () => {
    mockFetchResponse({}, false, 403);
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null on network error (fail-open)', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    expect(await fetchVideoMetadata('dQw4w9WgXcQ')).toBeNull();
  });

  it('handles missing snippet fields gracefully', async () => {
    mockFetchResponse({
      items: [{ snippet: { title: 'Minimal' }, contentDetails: {} }]
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
      mockFetchResponse({
        items: [{ snippet: { title: 'Test' }, contentDetails: { duration } }]
      });
      const result = await fetchVideoMetadata('dQw4w9WgXcQ');
      expect(result.durationSeconds).toBe(expected);
    }
  });
});
