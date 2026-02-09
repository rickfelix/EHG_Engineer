/**
 * EVA Post-Processor
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001E
 *
 * Moves evaluated items to their destination:
 * - Todoist: Move task to "Processed" project + add outcome label
 * - YouTube: Remove from "For Processing" + add to "Processed" playlist
 */

import { TodoistApi } from '@doist/todoist-api-typescript';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedClient } from './youtube/oauth-manager.js';
import dotenv from 'dotenv';

dotenv.config();

const PROCESSED_PROJECT_NAME = 'Processed';

/**
 * Create Supabase client
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Find or create a "Processed" Todoist project
 * @param {TodoistApi} api
 * @returns {Promise<string>} Project ID
 */
async function getOrCreateProcessedProject(api) {
  const response = await api.getProjects();
  const projects = response.results || response;
  const existing = projects.find(p => p.name === PROCESSED_PROJECT_NAME);
  if (existing) return existing.id;

  const created = await api.addProject({ name: PROCESSED_PROJECT_NAME });
  return created.id;
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

  const api = new TodoistApi(token);

  // Get evaluated items not yet processed
  const { data: items } = await supabase
    .from('eva_todoist_intake')
    .select('id, todoist_task_id, status')
    .in('status', ['approved', 'rejected', 'needs_revision'])
    .is('processed_at', null);

  if (!items || items.length === 0) {
    if (options.verbose) console.log('  Todoist: No items to post-process');
    return results;
  }

  const processedProjectId = await getOrCreateProcessedProject(api);

  for (const item of items) {
    try {
      // Move task to Processed project
      await api.moveTask(item.todoist_task_id, { projectId: processedProjectId });

      // Add outcome label
      const label = `eva-${item.status}`;
      const task = await api.getTask(item.todoist_task_id);
      const existingLabels = task.labels || [];
      if (!existingLabels.includes(label)) {
        await api.updateTask(item.todoist_task_id, { labels: [...existingLabels, label] });
      }

      // Mark as processed in database
      await supabase
        .from('eva_todoist_intake')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', item.id);

      results.processed++;

      if (options.verbose) {
        console.log(`    Processed: ${item.todoist_task_id} → ${label}`);
      }
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

  // Get evaluated items not yet processed
  const { data: items } = await supabase
    .from('eva_youtube_intake')
    .select('id, youtube_video_id, youtube_playlist_item_id, status')
    .in('status', ['approved', 'rejected', 'needs_revision'])
    .is('processed_at', null);

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
