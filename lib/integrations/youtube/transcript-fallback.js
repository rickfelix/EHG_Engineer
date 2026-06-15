/**
 * YouTube Transcript Fallback
 * SD: SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001 (FR-1)
 *
 * The long-form companion to lib/integrations/youtube/video-metadata.js.
 * Gemini native-video analysis (analyzeVideoContent) ABORTS on long strategy
 * videos (>~45-60min) because the model exceeds the client timeout. This module
 * extracts the video's CAPTIONS and runs Gemini over the TEXT instead — far
 * cheaper and unbounded by video length.
 *
 * Why not the official YouTube captions.download API? It is OWNER-ONLY — it
 * returns 403 for any video the authenticated channel does not own (i.e. every
 * third-party strategy video: Wharton lectures, B2B pricing playbooks, etc.).
 * So we fetch the public caption track list via the innertube player endpoint
 * (no API key, no OAuth) and download the timedtext directly.
 *
 * Fail-open / fail-SAFE everywhere: every export returns null on any error and
 * NEVER throws. A video whose transcript cannot be obtained is left for the
 * caller to mark failed_long and KEEP in the For-Processing playlist (never
 * disposed) — EVA-straggler discipline.
 */

const INNERTUBE_PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player';
// Public ANDROID innertube client context — needs no API key and reliably
// returns caption tracks for public videos. Version string is non-sensitive.
const ANDROID_CLIENT = Object.freeze({
  clientName: 'ANDROID',
  clientVersion: '19.09.37',
  androidSdkVersion: 34,
  hl: 'en',
});

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TRANSCRIPT_CHARS = 200_000;

/**
 * fetch() with an AbortController timeout. Returns the Response or throws
 * (callers wrap in try/catch and fail-open).
 * @private
 */
async function fetchWithTimeout(url, init = {}, options = {}) {
  const controller = new AbortController();
  const ms = options.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pure: choose the best caption track from the innertube list.
 * Preference order: manual track in the requested lang -> any track in the
 * requested lang -> manual track in any lang -> any track (incl. ASR).
 * Exposed for unit testing (no I/O).
 * @param {Array<{baseUrl?:string,languageCode?:string,kind?:string,vssId?:string}>} tracks
 * @param {string} [lang='en']
 * @returns {object|null}
 */
export function pickTranscriptTrack(tracks, lang = 'en') {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const withUrl = tracks.filter((t) => t && typeof t.baseUrl === 'string' && t.baseUrl);
  if (withUrl.length === 0) return null;
  const isAsr = (t) => t.kind === 'asr' || (typeof t.vssId === 'string' && t.vssId.startsWith('a.'));
  const inLang = (t) => typeof t.languageCode === 'string' && t.languageCode.toLowerCase().startsWith(lang.toLowerCase());
  return (
    withUrl.find((t) => inLang(t) && !isAsr(t)) ||
    withUrl.find((t) => inLang(t)) ||
    withUrl.find((t) => !isAsr(t)) ||
    withUrl[0]
  );
}

/**
 * Pure: flatten a YouTube json3 timedtext payload into a single string.
 * json3 shape: { events: [ { segs: [ { utf8: "..." } ] } ] }.
 * Exposed for unit testing.
 * @param {object} json3
 * @returns {string}
 */
export function parseTimedTextJson3(json3) {
  if (!json3 || !Array.isArray(json3.events)) return '';
  return json3.events
    .flatMap((e) => (Array.isArray(e.segs) ? e.segs.map((s) => (s && s.utf8) || '') : []))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch the public caption-track list for a video via the innertube player
 * endpoint. Returns the captionTracks array (possibly empty) or null on error.
 * @private
 */
async function fetchCaptionTracks(videoId, options = {}) {
  const res = await fetchWithTimeout(
    INNERTUBE_PLAYER_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 14)' },
      body: JSON.stringify({ context: { client: ANDROID_CLIENT }, videoId }),
    },
    options,
  );
  if (!res.ok) {
    if (options.verbose) console.log(`    transcript: innertube player ${res.status} for ${videoId}`);
    return null;
  }
  const data = await res.json();
  return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

/**
 * Fetch + parse the timedtext for a chosen caption track (json3 format).
 * @private
 */
async function fetchTimedText(baseUrl, options = {}) {
  const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
  const res = await fetchWithTimeout(url, {}, options);
  if (!res.ok) {
    if (options.verbose) console.log(`    transcript: timedtext ${res.status}`);
    return null;
  }
  const json3 = await res.json();
  return parseTimedTextJson3(json3);
}

/**
 * Fetch a video's transcript (captions) as plain text.
 *
 * @param {string} videoId - 11-character YouTube video ID
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {string} [options.lang='en'] - preferred caption language code
 * @param {number} [options.fetchTimeoutMs=30000]
 * @returns {Promise<string|null>} transcript text, or null if unavailable
 */
export async function fetchTranscript(videoId, options = {}) {
  if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) return null;
  try {
    const tracks = await fetchCaptionTracks(videoId, options);
    if (!tracks || tracks.length === 0) {
      if (options.verbose) console.log(`    transcript: no caption tracks for ${videoId}`);
      return null;
    }
    const track = pickTranscriptTrack(tracks, options.lang || 'en');
    if (!track || !track.baseUrl) return null;
    const text = await fetchTimedText(track.baseUrl, options);
    return text && text.trim() ? text.trim() : null;
  } catch (err) {
    if (options.verbose) console.log(`    transcript fetch failed for ${videoId}: ${err.message}`);
    return null;
  }
}

/**
 * Analyze a video transcript with Gemini's TEXT model — the long-video
 * equivalent of analyzeVideoContent. Mirrors that function's intent-guided,
 * cost-controlled (gemini-2.5-flash) prompt, but over text rather than video.
 *
 * @param {string} transcript - the caption text (from fetchTranscript)
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {string} [options.chairmanIntent] - guides the analysis
 * @param {Object} [options.metadata] - {title, channelName, durationSeconds}
 * @param {number} [options.maxTranscriptChars=200000] - clip very long transcripts
 * @returns {Promise<string|null>} framework summary or null
 */
export async function analyzeTranscriptContent(transcript, options = {}) {
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) return null;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    if (options.verbose) console.log('    Gemini: no API key for transcript analysis');
    return null;
  }

  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const maxChars = options.maxTranscriptChars || DEFAULT_MAX_TRANSCRIPT_CHARS;
  const clipped = transcript.length > maxChars ? `${transcript.slice(0, maxChars)}\n…[transcript truncated]` : transcript;

  const metaContext = options.metadata
    ? `\nVideo title: "${options.metadata.title || ''}"\nChannel: ${options.metadata.channelName || ''}`
    : '';
  const intentContext = options.chairmanIntent
    ? `\n\nThe chairman's intent for this video: "${options.chairmanIntent}"\nFocus your analysis on what's relevant to this intent.`
    : '';

  const prompt = options.chairmanIntent
    ? `Analyze this YouTube video TRANSCRIPT based on the chairman's stated intent. Provide the key frameworks, specific techniques or insights, and actionable takeaways relevant to their goals.${metaContext}${intentContext}\n\nTRANSCRIPT:\n${clipped}`
    : `Summarize this YouTube video TRANSCRIPT for a strategic business evaluation. Focus on the frameworks it teaches, key techniques or insights, and why they might be valuable for a software company building AI-powered tools.${metaContext}\n\nTRANSCRIPT:\n${clipped}`;

  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
        }),
      },
      { ...options, fetchTimeoutMs: options.fetchTimeoutMs || 60_000 },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (options.verbose) console.log(`    Gemini transcript analysis error: ${res.status} ${errBody.substring(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (options.verbose && summary) console.log(`    Gemini transcript summary: ${summary.substring(0, 100)}...`);
    return summary;
  } catch (err) {
    if (options.verbose) console.log(`    Gemini transcript analysis failed: ${err.message}`);
    return null;
  }
}

export default { fetchTranscript, analyzeTranscriptContent, pickTranscriptTrack, parseTimedTextJson3 };
