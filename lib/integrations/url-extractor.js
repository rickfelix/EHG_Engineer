/**
 * YouTube URL Extraction Utility
 *
 * Shared module for extracting YouTube video IDs and URLs from text.
 * Adapted from scripts/idea-ingestion-dec13-v1.mjs extractUrl().
 *
 * Handles: youtu.be/ID, youtube.com/watch?v=ID, labeled IDs, bare IDs in YouTube context.
 */

/**
 * Extract YouTube video ID from text (11-char alphanumeric)
 * @param {string} text - Text to scan (can be multi-line)
 * @returns {string|null} 11-character video ID or null
 */
export function extractYouTubeVideoId(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  // 1) youtu.be short link
  const short = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (short) return short[1];

  // 2) youtube.com/watch?v=ID or &v=ID
  const watch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/i);
  if (watch) return watch[1];

  // 3) youtube.com/embed/ID or youtube.com/v/ID
  const embed = s.match(/youtube\.com\/(?:embed|v)\/([A-Za-z0-9_-]{11})/i);
  if (embed) return embed[1];

  // 4) Labeled YouTube ID / Video ID (e.g., "YouTube ID: abc123def45")
  const labeled = s.match(/\b(?:youtube\s*id|video\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]{11})\b/i);
  if (labeled) return labeled[1];

  // 5) Bare 11-char ID when context mentions YouTube
  const lower = s.toLowerCase();
  if (lower.includes('youtube') || lower.includes('youtu')) {
    const bare = s.match(/\b([A-Za-z0-9_-]{11})\b/);
    if (bare) return bare[1];
  }

  return null;
}

/**
 * Extract and normalize YouTube URL from text
 * @param {string} text - Text to scan (can be multi-line)
 * @returns {string|null} Normalized https://www.youtube.com/watch?v=ID URL or null
 */
export function extractYouTubeUrl(text) {
  const id = extractYouTubeVideoId(text);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export default { extractYouTubeVideoId, extractYouTubeUrl };
