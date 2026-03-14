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

/**
 * Analyze YouTube video content using Gemini's native video understanding.
 * Sends the YouTube URL directly to Gemini — no download needed.
 *
 * Called AFTER chairman review so the chairman's intent guides the analysis.
 * Fail-open: returns null on any error.
 *
 * @param {string} videoId - 11-character YouTube video ID
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {string} [options.chairmanIntent] - Chairman's notes/intent to guide analysis
 * @param {Object} [options.metadata] - Pre-fetched metadata to include in prompt
 * @returns {Promise<string|null>} Content summary or null
 */
export async function analyzeVideoContent(videoId, options = {}) {
  if (!videoId || videoId.length !== 11) return null;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    if (options.verbose) console.log('    Gemini: No API key for video analysis');
    return null;
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const model = 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const metaContext = options.metadata
    ? `\nVideo title: "${options.metadata.title}"\nChannel: ${options.metadata.channelName}\nDuration: ${Math.round(options.metadata.durationSeconds / 60)} minutes`
    : '';

  const intentContext = options.chairmanIntent
    ? `\n\nThe chairman's intent for this video: "${options.chairmanIntent}"\nFocus your analysis on what's relevant to this intent.`
    : '';

  const prompt = options.chairmanIntent
    ? `Analyze this YouTube video based on the chairman's stated intent. Provide 3-5 sentences explaining what's in the video that's relevant to their goals, specific techniques or insights they should know about, and actionable takeaways.${metaContext}${intentContext}`
    : `Summarize this YouTube video in 3-4 sentences for a strategic business evaluation. Focus on: what it teaches, key techniques or insights, and why it might be valuable for a software company building AI-powered tools.${metaContext}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: 'video/*',
                fileUri: youtubeUrl,
              },
            },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.3,
        },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (options.verbose) console.log(`    Gemini video analysis error: ${response.status} ${errBody.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (options.verbose && summary) {
      console.log(`    Gemini video summary: ${summary.substring(0, 100)}...`);
    }

    return summary;
  } catch (err) {
    if (options.verbose) {
      console.log(`    Gemini video analysis failed: ${err.message}`);
    }
    return null;
  }
}

export default { fetchVideoMetadata, analyzeVideoContent };
