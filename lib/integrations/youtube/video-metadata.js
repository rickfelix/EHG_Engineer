/**
 * YouTube Video Metadata Fetcher
 * SD: SD-LEO-FDBK-FIX-EVALUATE-YOUTUBE-VIDEO-001
 *
 * Fetches video metadata (title, description, channel, tags, duration)
 * from the YouTube Data API for use in classification enrichment.
 *
 * Uses existing OAuth infrastructure from oauth-manager.js.
 * Fail-open: returns null on any error, never blocks the pipeline.
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './oauth-manager.js';

/**
 * Parse ISO 8601 duration (PT1H23M45S) to seconds.
 * @param {string} duration
 * @returns {number}
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
 * Fetch video metadata from the YouTube Data API.
 *
 * @param {string} videoId - 11-character YouTube video ID
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<{title: string, description: string, channelName: string, tags: string[], durationSeconds: number, publishedAt: string}|null>}
 */
export async function fetchVideoMetadata(videoId, options = {}) {
  if (!videoId || videoId.length !== 11) return null;

  try {
    const oauth2Client = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const response = await youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [videoId]
    });

    const video = response.data.items?.[0];
    if (!video) {
      if (options.verbose) console.log(`    YouTube: video ${videoId} not found or private`);
      return null;
    }

    const metadata = {
      title: video.snippet?.title || '',
      description: video.snippet?.description || '',
      channelName: video.snippet?.channelTitle || '',
      tags: video.snippet?.tags || [],
      durationSeconds: parseDuration(video.contentDetails?.duration),
      publishedAt: video.snippet?.publishedAt || ''
    };

    if (options.verbose) {
      console.log(`    YouTube metadata: "${metadata.title}" by ${metadata.channelName} (${metadata.durationSeconds}s)`);
    }

    return metadata;
  } catch (err) {
    if (options.verbose) {
      console.log(`    YouTube metadata fetch failed: ${err.message}`);
    }
    return null;
  }
}

export default { fetchVideoMetadata };
