/**
 * Unit tests for playlist-sync.js's credential-free (FR-3) client/lookup functions.
 * SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001. No OAuth, no live network calls --
 * verifies the API-key-based path is wired correctly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createYoutubeClient,
  getTargetPlaylistId,
  findTargetPlaylist,
} from '../../../lib/integrations/youtube/playlist-sync.js';

describe('createYoutubeClient (FR-3, credential-free)', () => {
  const ORIGINAL_KEY = process.env.YOUTUBE_API_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = ORIGINAL_KEY;
  });

  it('throws a clear error when YOUTUBE_API_KEY is not set', () => {
    delete process.env.YOUTUBE_API_KEY;
    expect(() => createYoutubeClient()).toThrow(/YOUTUBE_API_KEY/);
  });

  it('builds a client when YOUTUBE_API_KEY is set, without touching OAuth', () => {
    process.env.YOUTUBE_API_KEY = 'test-api-key';
    const client = createYoutubeClient();
    expect(client).toBeDefined();
    expect(client.playlists).toBeDefined();
    expect(client.playlistItems).toBeDefined();
  });
});

describe('getTargetPlaylistId (FR-2, low-grade-secret config)', () => {
  const ORIGINAL_ID = process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID;

  afterEach(() => {
    if (ORIGINAL_ID === undefined) delete process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID;
    else process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID = ORIGINAL_ID;
  });

  it('throws a clear error when YOUTUBE_FOR_PROCESSING_PLAYLIST_ID is not set', () => {
    delete process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID;
    expect(() => getTargetPlaylistId()).toThrow(/YOUTUBE_FOR_PROCESSING_PLAYLIST_ID/);
  });

  it('returns the configured playlist ID verbatim', () => {
    process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID = 'PL_TEST_ID_123';
    expect(getTargetPlaylistId()).toBe('PL_TEST_ID_123');
  });
});

describe('findTargetPlaylist (API-key-compatible ID lookup, not OAuth mine:true)', () => {
  it('looks up by id (not mine:true) and returns the first matching item', async () => {
    const calls = [];
    const fakeYoutube = {
      playlists: {
        list: async (params) => {
          calls.push(params);
          return { data: { items: [{ id: 'PL_TEST_ID', snippet: { title: 'For Processing' } }] } };
        },
      },
    };

    const playlist = await findTargetPlaylist(fakeYoutube, 'PL_TEST_ID');

    expect(playlist).toEqual({ id: 'PL_TEST_ID', snippet: { title: 'For Processing' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: ['PL_TEST_ID'] });
    expect(calls[0].mine).toBeUndefined();
  });

  it('returns null when no playlist matches the configured id', async () => {
    const fakeYoutube = {
      playlists: { list: async () => ({ data: { items: [] } }) },
    };

    const playlist = await findTargetPlaylist(fakeYoutube, 'NONEXISTENT_ID');

    expect(playlist).toBeNull();
  });
});
