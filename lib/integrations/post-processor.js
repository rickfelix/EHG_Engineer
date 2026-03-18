/**
 * EVA Post-Processor
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001E
 *
 * Archives evaluated items at their source:
 * - Todoist: Complete (check off) classified tasks via Sync API
 * - YouTube: Remove from "For Processing" + add to "Processed" playlist
 *
 * Note: Todoist moveTask is unreliable (MAX_ITEMS_LIMIT_REACHED silently
 * swallowed by SDK). We use item_complete via Sync API v1 instead.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { google } from 'googleapis';
import { getAuthenticatedClient } from './youtube/oauth-manager.js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create Supabase client
 */
function createSupabaseClient() {
  return createSupabaseServiceClient();
}

/**
 * Complete a Todoist task via the Sync API v1 (item_complete).
 * The SDK's moveTask/closeTask silently fail in some cases.
 * @param {string} taskId
 * @param {string} token - Todoist API token
 * @returns {Promise<boolean>}
 */
async function completeTodoistTask(taskId, token) {
  const uuid = randomUUID();
  const body = new URLSearchParams({
    commands: JSON.stringify([{
      type: 'item_complete',
      uuid,
      args: { id: taskId }
    }])
  });

  const resp = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await resp.json();
  return data.sync_status?.[uuid] === 'ok';
}

/**
 * Post-process completed Todoist items
 * @param {Object} options
 * @returns {Promise<{processed: number, errors: Array}>}
 */
async function postProcessTodoist(options = {}) {
  const supabase = options.supabase || createSupabaseClient();
  const results = { processed: 0, errors: [] };

  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.log('  Todoist: Skipping (no API token)');
    return results;
  }

  // Get items ready for archival:
  // - Legacy evaluation flow: status in approved/rejected/needs_revision
  // - New distill flow (pending): classified (classified_at set) and still pending
  // - New distill flow (reviewed): chairman reviewed and marked processed, but not yet archived
  const { data: legacyItems } = await supabase
    .from('eva_todoist_intake')
    .select('id, todoist_task_id, status')
    .in('status', ['approved', 'rejected', 'needs_revision'])
    .is('processed_at', null);

  const { data: classifiedItems } = await supabase
    .from('eva_todoist_intake')
    .select('id, todoist_task_id, status')
    .eq('status', 'pending')
    .not('classified_at', 'is', null)
    .is('processed_at', null);

  const { data: reviewedItems } = await supabase
    .from('eva_todoist_intake')
    .select('id, todoist_task_id, status')
    .eq('status', 'processed')
    .is('processed_at', null);

  // Orphan recovery: reviewed by chairman but still pending (SD-LEO-FIX-DISTILL-ORPHAN-RECOVERY-001)
  const { data: orphanedItems } = await supabase
    .from('eva_todoist_intake')
    .select('id, todoist_task_id, status')
    .eq('status', 'pending')
    .not('chairman_reviewed_at', 'is', null)
    .is('processed_at', null);

  const items = [...(legacyItems || []), ...(classifiedItems || []), ...(reviewedItems || []), ...(orphanedItems || [])];

  if (!items || items.length === 0) {
    if (options.verbose) console.log('  Todoist: No items to post-process');
    return results;
  }

  for (const item of items) {
    try {
      // Complete (check off) the task via Sync API v1
      const ok = await completeTodoistTask(item.todoist_task_id, token);

      if (!ok) {
        // Task may already be completed/deleted — still mark as processed
        if (options.verbose) {
          console.log(`    Already done: ${item.todoist_task_id}`);
        }
      } else if (options.verbose) {
        console.log(`    Completed: ${item.todoist_task_id}`);
      }

      // Mark as processed in database
      await supabase
        .from('eva_todoist_intake')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', item.id);

      results.processed++;
    } catch (err) {
      results.errors.push({ id: item.id, error: err.message });
      if (options.verbose) {
        console.error(`    Error processing ${item.todoist_task_id}: ${err.message}`);
      }
    }
  }

  return results;
}

/**
 * Find or create "Processed" YouTube playlist
 * @param {Object} youtube - YouTube API client
 * @returns {Promise<string>} Playlist ID
 */
async function getOrCreateProcessedPlaylist(youtube) {
  // Search existing playlists
  let nextPageToken = null;
  do {
    const response = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const playlist = response.data.items?.find(p => p.snippet.title === 'Processed');
    if (playlist) return playlist.id;

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  // Create if not found
  const response = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: 'Processed',
        description: 'EVA: Processed idea videos'
      },
      status: { privacyStatus: 'private' }
    }
  });

  return response.data.id;
}

/**
 * Post-process completed YouTube items
 * @param {Object} options
 * @returns {Promise<{processed: number, errors: Array}>}
 */
async function postProcessYouTube(options = {}) {
  const supabase = options.supabase || createSupabaseClient();
  const results = { processed: 0, errors: [] };

  let youtube;
  try {
    const oauth2Client = await getAuthenticatedClient();
    youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  } catch {
    console.log('  YouTube: Skipping (not authenticated)');
    return results;
  }

  // Get items ready for archival:
  // - Legacy evaluation flow: status in approved/rejected/needs_revision
  // - New distill flow: classified (classified_at set) and still pending
  const { data: legacyItems } = await supabase
    .from('eva_youtube_intake')
    .select('id, youtube_video_id, youtube_playlist_item_id, status')
    .in('status', ['approved', 'rejected', 'needs_revision'])
    .is('processed_at', null);

  const { data: classifiedItems } = await supabase
    .from('eva_youtube_intake')
    .select('id, youtube_video_id, youtube_playlist_item_id, status')
    .eq('status', 'pending')
    .not('classified_at', 'is', null)
    .is('processed_at', null);

  const items = [...(legacyItems || []), ...(classifiedItems || [])];

  if (!items || items.length === 0) {
    if (options.verbose) console.log('  YouTube: No items to post-process');
    return results;
  }

  const processedPlaylistId = await getOrCreateProcessedPlaylist(youtube);

  for (const item of items) {
    try {
      // Add to "Processed" playlist
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: processedPlaylistId,
            resourceId: {
              kind: 'youtube#video',
              videoId: item.youtube_video_id
            }
          }
        }
      });

      // Remove from "For Processing" playlist (using playlistItemId)
      if (item.youtube_playlist_item_id) {
        await youtube.playlistItems.delete({ id: item.youtube_playlist_item_id });
      }

      // Mark as processed
      await supabase
        .from('eva_youtube_intake')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          destination_playlist_id: processedPlaylistId
        })
        .eq('id', item.id);

      results.processed++;

      if (options.verbose) {
        console.log(`    Processed: ${item.youtube_video_id}`);
      }
    } catch (err) {
      results.errors.push({ id: item.id, error: err.message });
      if (options.verbose) {
        console.error(`    Error processing ${item.youtube_video_id}: ${err.message}`);
      }
    }
  }

  return results;
}

/**
 * Post-process all evaluated items
 * @param {Object} options
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Object>}
 */
export async function postProcessAll(options = {}) {
  const supabase = options.supabase || createSupabaseClient();

  console.log('  Running post-processing...');

  const todoist = await postProcessTodoist({ ...options, supabase });
  const youtube = await postProcessYouTube({ ...options, supabase });

  return {
    todoist,
    youtube,
    totalProcessed: todoist.processed + youtube.processed,
    totalErrors: todoist.errors.length + youtube.errors.length
  };
}

export default { postProcessAll };
