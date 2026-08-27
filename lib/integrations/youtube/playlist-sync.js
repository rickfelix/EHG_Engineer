/**
 * YouTube Playlist Sync Client
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C
 * SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001 (FR-3): credential-free read via YOUTUBE_API_KEY.
 * Chairman approved switching the "For Processing" playlist from Private to Unlisted
 * (chairman_decisions id a94f88c8-bf97-4c04-a11a-084817cdc185, 2026-08-26), eliminating the
 * OAuth token custody problem class entirely rather than relocating it. This module no longer
 * depends on oauth-manager.js -- the OAuth-fallback design (a second, read-only client, kept
 * separate from the shared read+write client used by post-processor.js/youtube-strategy-extract.js)
 * remains documented in this SD's PRD (product_requirements_v2, FR-4) as the not-taken branch,
 * should the playlist ever need to go private again.
 *
 * Syncs videos from "For Processing" playlist to eva_youtube_intake table.
 * Uses playlistItemId for post-processing removal.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_PLAYLIST_NAME = 'For Processing';

/**
 * Build a YouTube Data API client authenticated by a plain API key (no OAuth, no user
 * consent, no token custody) -- matches the precedent already proven in production by
 * lib/integrations/youtube/video-metadata.js and lib/integrations/youtube/subscription-scanner.js's
 * RSS pattern. Requires the "For Processing" playlist to be Unlisted or Public (an API key
 * cannot read a Private playlist's contents).
 * @returns {Object} YouTube API client
 */
export function createYoutubeClient() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable required for credential-free playlist sync.');
  }
  return google.youtube({ version: 'v3', auth: apiKey });
}

/**
 * Resolve the target playlist's ID from config. Treated as a low-grade secret per the
 * chairman's approval riders: never logged or committed in plaintext -- read from env only.
 * @returns {string} Playlist ID
 */
export function getTargetPlaylistId() {
  const playlistId = process.env.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID;
  if (!playlistId) {
    throw new Error('YOUTUBE_FOR_PROCESSING_PLAYLIST_ID environment variable required (captured once via YouTube Studio or an authenticated one-time discovery call, never hardcoded).');
  }
  return playlistId;
}

/**
 * Create Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createSupabaseServiceClient();
}

/**
 * Look up the target playlist by ID (API-key compatible -- does NOT use the OAuth-only
 * `mine: true` lookup the previous name-search relied on).
 * @param {Object} youtube - YouTube API client
 * @param {string} playlistId
 * @returns {Promise<Object|null>} Playlist object or null
 */
export async function findTargetPlaylist(youtube, playlistId) {
  const response = await youtube.playlists.list({
    part: ['snippet'],
    id: [playlistId],
  });

  return response.data.items?.[0] || null;
}

/**
 * Fetch all videos from a playlist with pagination
 * @param {Object} youtube - YouTube API client
 * @param {string} playlistId
 * @returns {Promise<Array>} Playlist items
 */
async function fetchPlaylistVideos(youtube, playlistId) {
  const items = [];
  let nextPageToken = null;

  do {
    const response = await youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId,
      maxResults: 50,
      pageToken: nextPageToken
    });

    if (response.data.items) {
      items.push(...response.data.items);
    }
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return items;
}

/**
 * Get video details (duration, tags) for a batch of video IDs
 * @param {Object} youtube - YouTube API client
 * @param {string[]} videoIds
 * @returns {Promise<Map<string, Object>>} Map of videoId to details
 */
async function getVideoDetails(youtube, videoIds) {
  const details = new Map();

  // YouTube API allows max 50 IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const response = await youtube.videos.list({
      part: ['contentDetails', 'snippet'],
      id: batch
    });

    for (const video of response.data.items || []) {
      details.set(video.id, {
        duration_seconds: parseDuration(video.contentDetails?.duration),
        tags: video.snippet?.tags || [],
        channel_name: video.snippet?.channelTitle,
        published_at: video.snippet?.publishedAt
      });
    }
  }

  return details;
}

/**
 * Parse ISO 8601 duration to seconds
 * @param {string} duration - e.g., "PT1H2M30S"
 * @returns {number} Seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 3600) +
         (parseInt(match[2] || 0) * 60) +
         parseInt(match[3] || 0);
}

/**
 * Map a playlist item to the eva_youtube_intake row format
 * @param {Object} item - YouTube playlist item
 * @param {Object} videoDetail - Video detail from videos.list
 * @returns {Object} Row for upsert
 */
export function mapVideoToIntakeRow(item, videoDetail = {}) {
  const snippet = item.snippet || {};
  return {
    youtube_video_id: snippet.resourceId?.videoId || item.contentDetails?.videoId,
    youtube_playlist_item_id: item.id,
    title: snippet.title || 'Untitled',
    description: snippet.description || null,
    channel_name: videoDetail.channel_name || snippet.videoOwnerChannelTitle || null,
    duration_seconds: videoDetail.duration_seconds || null,
    thumbnail_url: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
    tags: videoDetail.tags || [],
    published_at: videoDetail.published_at || snippet.publishedAt || null,
    raw_data: { playlistItem: item, videoDetail }
  };
}

/**
 * Load known video IDs from database for incremental sync
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Map<string, {id: string, status: string}>>} Map of youtube_video_id to {id, status}
 */
async function loadKnownVideos(supabase) {
  const known = new Map();
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('eva_youtube_intake')
      .select('id, youtube_video_id, status')
      .order('id', { ascending: true }));
  } catch {
    data = [];
  }

  for (const row of data) {
    known.set(row.youtube_video_id, { id: row.id, status: row.status });
  }
  return known;
}

/**
 * Upsert videos to eva_youtube_intake table (incremental - skips known non-pending items)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array} rows - Mapped intake rows
 * @param {Map} knownVideos - Pre-loaded known video map
 * @returns {Promise<{inserted: number, updated: number, skipped: number, errors: Array}>}
 */
async function upsertVideos(supabase, rows, knownVideos) {
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const existing = knownVideos.get(row.youtube_video_id);

    if (existing) {
      if (existing.status === 'pending') {
        const { error } = await supabase
          .from('eva_youtube_intake')
          .update({
            youtube_playlist_item_id: row.youtube_playlist_item_id,
            title: row.title,
            description: row.description,
            channel_name: row.channel_name,
            duration_seconds: row.duration_seconds,
            thumbnail_url: row.thumbnail_url,
            tags: row.tags,
            published_at: row.published_at,
            raw_data: row.raw_data
          })
          .eq('id', existing.id);

        if (error) {
          results.errors.push({ video_id: row.youtube_video_id, error: error.message });
        } else {
          results.updated++;
        }
      } else {
        results.skipped++;
      }
    } else {
      const { error } = await supabase
        .from('eva_youtube_intake')
        .insert(row);

      if (error) {
        results.errors.push({ video_id: row.youtube_video_id, error: error.message });
      } else {
        results.inserted++;
      }
    }
  }

  return results;
}

/**
 * Update sync state for YouTube
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} playlistName
 * @param {number} syncedCount
 * @param {string|null} error
 */
async function updateSyncState(supabase, playlistName, syncedCount, error = null) {
  // SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 TR-5: a single atomic UPSERT (via RPC), not a
  // separate SELECT + JS-computed increment — overlapping runs can no longer lose an update.
  // Never throws (TESTING sub-agent finding, EXEC review): the original read-then-write version
  // never threw either, and this function runs inside syncYouTube's own catch block — a throw
  // here would escape that catch and mask the REAL sync error with an unrelated RPC error.
  const { error: rpcError } = await supabase.rpc('eva_sync_state_record_sync_result', {
    p_source_type: 'youtube',
    p_source_identifier: playlistName,
    p_synced_count: syncedCount,
    p_error: error || null
  });
  if (rpcError) {
    console.error(`  eva_sync_state_record_sync_result RPC failed: ${rpcError.message}`);
  }
}

/**
 * Check circuit breaker for YouTube sync
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} playlistName
 * @returns {Promise<boolean>} true if circuit is open (should skip)
 */
async function isCircuitOpen(supabase, playlistName) {
  const { data } = await supabase
    .from('eva_sync_state')
    .select('consecutive_failures')
    .eq('source_type', 'youtube')
    .eq('source_identifier', playlistName)
    .maybeSingle();

  return data?.consecutive_failures >= 3;
}

/**
 * Main YouTube sync function
 * @param {Object} options
 * @param {boolean} [options.dryRun=false]
 * @param {number} [options.limit]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Object>} Sync results
 */
export async function syncYouTube(options = {}) {
  const { dryRun = false, limit, verbose = false } = options;
  const supabase = createSupabaseClient();

  const results = {
    playlist: null,
    totalInserted: 0,
    totalUpdated: 0,
    totalErrors: 0,
    dryRun
  };

  // Circuit breaker check
  if (!dryRun && await isCircuitOpen(supabase, TARGET_PLAYLIST_NAME)) {
    console.log(`  Circuit OPEN for "${TARGET_PLAYLIST_NAME}" (3+ consecutive failures) - skipping`);
    results.skipped = true;
    return results;
  }

  try {
    // Credential-free client (FR-3): plain API key, no OAuth, no token custody.
    const youtube = createYoutubeClient();
    const playlistId = getTargetPlaylistId();

    // Find target playlist by ID (API-key compatible)
    const playlist = await findTargetPlaylist(youtube, playlistId);
    if (!playlist) {
      console.log('  Playlist not found for the configured YOUTUBE_FOR_PROCESSING_PLAYLIST_ID. Verify it is Unlisted/Public and the ID is correct.');
      return results;
    }

    // Rider: playlist ID is a low-grade secret -- never logged in plaintext.
    results.playlist = { id: playlist.id, title: playlist.snippet.title };

    if (verbose) {
      console.log(`  Found playlist: "${playlist.snippet.title}"`);
    }

    // Pre-load known videos for incremental sync
    const knownVideos = await loadKnownVideos(supabase);

    // Fetch all playlist items (1 unit per 50 items - cheap)
    let items = await fetchPlaylistVideos(youtube, playlist.id);

    if (verbose) {
      console.log(`  Videos in playlist: ${items.length}`);
      console.log(`  Already in database: ${knownVideos.size}`);
    }

    if (limit && items.length > limit) {
      items = items.slice(0, limit);
    }

    // Filter to only new videos for detail API calls (saves quota)
    const newItems = items.filter(item => {
      const videoId = item.snippet?.resourceId?.videoId || item.contentDetails?.videoId;
      return !knownVideos.has(videoId);
    });

    const newVideoIds = newItems
      .map(i => i.snippet?.resourceId?.videoId || i.contentDetails?.videoId)
      .filter(Boolean);

    if (verbose) {
      console.log(`  New videos to fetch details: ${newVideoIds.length}`);
    }

    // Only call videos.list for new videos (1 unit per 50 - skip for known)
    const videoDetails = newVideoIds.length > 0
      ? await getVideoDetails(youtube, newVideoIds)
      : new Map();

    // Map to intake rows
    const rows = items.map(item => {
      const videoId = item.snippet?.resourceId?.videoId || item.contentDetails?.videoId;
      return mapVideoToIntakeRow(item, videoDetails.get(videoId) || {});
    });

    if (dryRun) {
      console.log(`  [DRY RUN] "${TARGET_PLAYLIST_NAME}": ${rows.length} videos (${newItems.length} new)`);
      newItems.forEach(item => {
        const title = item.snippet?.title || 'Untitled';
        const channel = item.snippet?.videoOwnerChannelTitle || 'unknown';
        console.log(`    + ${title} (${channel})`);
      });
    } else {
      const upsertResult = await upsertVideos(supabase, rows, knownVideos);
      results.totalInserted = upsertResult.inserted;
      results.totalUpdated = upsertResult.updated;
      results.totalSkipped = upsertResult.skipped;
      results.totalErrors = upsertResult.errors.length;

      await updateSyncState(supabase, TARGET_PLAYLIST_NAME, upsertResult.inserted + upsertResult.updated);
    }
  } catch (err) {
    results.totalErrors++;
    if (!dryRun) {
      await updateSyncState(supabase, TARGET_PLAYLIST_NAME, 0, err.message);
    }
    console.error(`  Error syncing YouTube: ${err.message}`);
  }

  return results;
}

export default { syncYouTube, TARGET_PLAYLIST_NAME };
