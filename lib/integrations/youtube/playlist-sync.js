/**
 * YouTube Playlist Sync Client
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C
 *
 * Syncs videos from "For Processing" playlist to eva_youtube_intake table.
 * Uses playlistItemId for post-processing removal.
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedClient } from './oauth-manager.js';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_PLAYLIST_NAME = 'For Processing';

/**
 * Create Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Find the "For Processing" playlist by name
 * @param {Object} youtube - YouTube API client
 * @returns {Promise<Object|null>} Playlist object or null
 */
async function findTargetPlaylist(youtube) {
  let nextPageToken = null;

  do {
    const response = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const playlist = response.data.items?.find(
      p => p.snippet.title === TARGET_PLAYLIST_NAME
    );

    if (playlist) return playlist;
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return null;
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
function mapVideoToIntakeRow(item, videoDetail = {}) {
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
  const { data } = await supabase
    .from('eva_youtube_intake')
    .select('id, youtube_video_id, status');

  for (const row of data || []) {
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
  const { data: existing } = await supabase
    .from('eva_sync_state')
    .select('id, total_synced, consecutive_failures')
    .eq('source_type', 'youtube')
    .eq('source_identifier', playlistName)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const update = error
      ? {
          consecutive_failures: existing.consecutive_failures + 1,
          last_error: error,
          last_error_at: now
        }
      : {
          last_sync_at: now,
          total_synced: existing.total_synced + syncedCount,
          consecutive_failures: 0,
          last_error: null,
          last_error_at: null
        };

    await supabase.from('eva_sync_state').update(update).eq('id', existing.id);
  } else {
    await supabase.from('eva_sync_state').insert({
      source_type: 'youtube',
      source_identifier: playlistName,
      last_sync_at: error ? null : now,
      total_synced: syncedCount,
      consecutive_failures: error ? 1 : 0,
      last_error: error || null,
      last_error_at: error ? now : null
    });
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
    // Get authenticated YouTube client
    const oauth2Client = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Find target playlist
    const playlist = await findTargetPlaylist(youtube);
    if (!playlist) {
      console.log(`  Playlist "${TARGET_PLAYLIST_NAME}" not found. Create it in YouTube first.`);
      return results;
    }

    results.playlist = { id: playlist.id, title: playlist.snippet.title };

    if (verbose) {
      console.log(`  Found playlist: "${playlist.snippet.title}" (${playlist.id})`);
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
