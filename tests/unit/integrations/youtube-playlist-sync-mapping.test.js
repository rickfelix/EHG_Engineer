/**
 * Unit tests for playlist-sync.js's pure video-to-intake-row mapping (TS-2 of
 * SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001). No I/O, no OAuth, no live API --
 * authorable before the chairman's credential-architecture decision lands, since
 * this mapping is unchanged by either branch.
 */
import { describe, it, expect } from 'vitest';
import { mapVideoToIntakeRow } from '../../../lib/integrations/youtube/playlist-sync.js';

describe('mapVideoToIntakeRow', () => {
  it('preserves the playlistItem id (item.id), not the video id, as youtube_playlist_item_id', () => {
    const item = {
      id: 'PLAYLIST_ITEM_ID_123',
      snippet: {
        resourceId: { videoId: 'VIDEO_ID_456' },
        title: 'Test Video',
        description: 'A test description',
        videoOwnerChannelTitle: 'Test Channel',
        thumbnails: { medium: { url: 'https://example.com/thumb.jpg' } },
        publishedAt: '2026-01-01T00:00:00Z',
      },
    };

    const row = mapVideoToIntakeRow(item, {});

    expect(row.youtube_playlist_item_id).toBe('PLAYLIST_ITEM_ID_123');
    expect(row.youtube_video_id).toBe('VIDEO_ID_456');
  });

  it('falls back to contentDetails.videoId when snippet.resourceId is absent', () => {
    const item = {
      id: 'PLAYLIST_ITEM_ID_789',
      contentDetails: { videoId: 'VIDEO_ID_FALLBACK' },
      snippet: { title: 'No resourceId here' },
    };

    const row = mapVideoToIntakeRow(item, {});

    expect(row.youtube_video_id).toBe('VIDEO_ID_FALLBACK');
    expect(row.youtube_playlist_item_id).toBe('PLAYLIST_ITEM_ID_789');
  });

  it('merges videoDetail fields (channel_name, duration, tags, published_at) over snippet-only data', () => {
    const item = {
      id: 'PLAYLIST_ITEM_ID_1',
      snippet: {
        resourceId: { videoId: 'VIDEO_ID_1' },
        title: 'Snippet Title',
        videoOwnerChannelTitle: 'Snippet Channel',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    };
    const videoDetail = {
      channel_name: 'Detail Channel',
      duration_seconds: 754,
      tags: ['tag1', 'tag2'],
      published_at: '2025-06-01T00:00:00Z',
    };

    const row = mapVideoToIntakeRow(item, videoDetail);

    expect(row.channel_name).toBe('Detail Channel');
    expect(row.duration_seconds).toBe(754);
    expect(row.tags).toEqual(['tag1', 'tag2']);
    expect(row.published_at).toBe('2025-06-01T00:00:00Z');
  });

  it('defaults title to "Untitled" and description/duration/tags to safe empty values when absent', () => {
    const item = { id: 'PLAYLIST_ITEM_ID_2', snippet: {} };

    const row = mapVideoToIntakeRow(item, {});

    expect(row.title).toBe('Untitled');
    expect(row.description).toBeNull();
    expect(row.duration_seconds).toBeNull();
    expect(row.tags).toEqual([]);
    expect(row.youtube_playlist_item_id).toBe('PLAYLIST_ITEM_ID_2');
  });

  it('retains the raw playlistItem and videoDetail in raw_data for auditability', () => {
    const item = { id: 'PLAYLIST_ITEM_ID_3', snippet: { resourceId: { videoId: 'V3' } } };
    const videoDetail = { duration_seconds: 100 };

    const row = mapVideoToIntakeRow(item, videoDetail);

    expect(row.raw_data.playlistItem).toStrictEqual(item);
    expect(row.raw_data.videoDetail).toBe(videoDetail);
  });

  it('strips snippet.playlistId from raw_data (SECURITY finding C-1: the ID is a low-grade secret, never persisted plaintext)', () => {
    const item = {
      id: 'PLAYLIST_ITEM_ID_4',
      snippet: { resourceId: { videoId: 'V4' }, playlistId: 'PL_SECRET_SHOULD_NOT_PERSIST' },
    };

    const row = mapVideoToIntakeRow(item);

    expect(row.raw_data.playlistItem.snippet.playlistId).toBeUndefined();
    expect(JSON.stringify(row.raw_data)).not.toContain('PL_SECRET_SHOULD_NOT_PERSIST');
    // Everything else on the snippet survives the sanitization.
    expect(row.raw_data.playlistItem.snippet.resourceId).toEqual({ videoId: 'V4' });
    expect(row.raw_data.playlistItem.id).toBe('PLAYLIST_ITEM_ID_4');
  });
});
