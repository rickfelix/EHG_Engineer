/**
 * Wiring-guard test for SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001.
 *
 * TESTING sub-agent (EXEC-TO-PLAN, evidence row 89bc69e3) proved via mutation that
 * syncYouTube()'s body could be reverted to getAuthenticatedClient() + a hardcoded playlist id
 * and every existing test (including the 6 credential-free unit tests) would still pass --
 * those tests exercise createYoutubeClient/getTargetPlaylistId/findTargetPlaylist in isolation,
 * but nothing asserted the PRODUCTION entry point (syncYouTube) actually calls them, or that it
 * never falls back to OAuth. This file closes that gap: it exercises syncYouTube() itself (not
 * the helpers directly) and would fail if the OAuth path were ever reintroduced.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getAuthenticatedClient } = vi.hoisted(() => ({
  getAuthenticatedClient: vi.fn(async () => ({ MOCK: 'oauth-client-should-never-be-used' })),
}));
vi.mock('../../../lib/integrations/youtube/oauth-manager.js', () => ({ getAuthenticatedClient }));

const { youtubeCtor, playlistsList } = vi.hoisted(() => ({
  youtubeCtor: vi.fn(),
  playlistsList: vi.fn(async () => ({ data: { items: [] } })), // no match -> syncYouTube early-returns
}));
vi.mock('googleapis', () => ({
  google: {
    youtube: (...args) => {
      youtubeCtor(...args);
      return { playlists: { list: playlistsList }, playlistItems: { list: vi.fn() } };
    },
  },
}));

const { rpcSpy } = vi.hoisted(() => ({ rpcSpy: vi.fn(async () => ({ data: null, error: null })) }));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    rpc: rpcSpy,
  }),
}));

describe('syncYouTube production wiring (regression guard for the credential-free FR-3 path)', () => {
  const ORIGINAL_KEY = process.env.YOUTUBE_API_KEY;
  const ORIGINAL_ID = process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID;

  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = 'test-api-key-wiring-guard';
    process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID = 'test-playlist-id-wiring-guard';
    youtubeCtor.mockClear();
    playlistsList.mockClear();
    getAuthenticatedClient.mockClear();
    rpcSpy.mockClear();
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_ID === undefined) delete process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID; else process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID = ORIGINAL_ID;
  });

  it('builds the YouTube client with API-key auth (not OAuth) and looks up the playlist by the configured id', async () => {
    const { syncYouTube } = await import('../../../lib/integrations/youtube/playlist-sync.js');

    await syncYouTube({ dryRun: true });

    expect(youtubeCtor).toHaveBeenCalledWith({ version: 'v3', auth: 'test-api-key-wiring-guard' });
    expect(playlistsList).toHaveBeenCalledWith(
      expect.objectContaining({ id: ['test-playlist-id-wiring-guard'] })
    );
    // The exact mutation the TESTING agent proved possible: reverting to mine:true would pass
    // this if we only checked id presence, so assert mine is absent, not just id present.
    const call = playlistsList.mock.calls[0][0];
    expect(call.mine).toBeUndefined();
  });

  it('never calls getAuthenticatedClient (the OAuth path this SD removed)', async () => {
    const { syncYouTube } = await import('../../../lib/integrations/youtube/playlist-sync.js');

    await syncYouTube({ dryRun: true });

    expect(getAuthenticatedClient).not.toHaveBeenCalled();
  });

  it('arms the circuit breaker when the playlist is not found (SECURITY finding C-2: a privacy flip-back must not fail silently outside CI)', async () => {
    const { syncYouTube } = await import('../../../lib/integrations/youtube/playlist-sync.js');

    // dryRun:false so the fix (gated by `if (!dryRun)`) actually fires.
    await syncYouTube({ dryRun: false });

    expect(rpcSpy).toHaveBeenCalledWith(
      'eva_sync_state_record_sync_result',
      expect.objectContaining({
        p_source_type: 'youtube',
        p_synced_count: 0,
        p_error: expect.stringContaining('playlist not found'),
      })
    );
  });
});
