/**
 * YouTube Video Metadata Fetcher
 * SD: SD-LEO-FDBK-FIX-EVALUATE-YOUTUBE-VIDEO-001
 *
 * Fetches video metadata (title, description, channel, tags, duration)
 * from the YouTube Data API v3 using native fetch().
 *
 * Uses YOUTUBE_API_KEY for read-only access (no OAuth needed).
 * Fail-open: returns null on any error, never blocks the pipeline.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    if (options.verbose) console.log('    YouTube: YOUTUBE_API_KEY not set');
    return null;
  }

  try {
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      if (options.verbose) console.log(`    YouTube API error: ${response.status} for ${videoId}`);
      return null;
    }

    const data = await response.json();
    const video = data.items?.[0];
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
      publishedAt: video.snippet?.publishedAt || '',
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
