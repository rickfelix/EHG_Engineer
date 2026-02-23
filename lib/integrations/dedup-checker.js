/**
 * EVA Idea Dedup Checker
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D
 * Extended: SD-LEO-FEAT-CONNECT-ASSIST-ENGINE-001 (FR-004)
 *
 * Detects duplicate ideas using Jaccard similarity on title tokens.
 * Threshold: 0.7 (configurable).
 *
 * FR-004 adds cross-path YouTube URL deduplication: checks
 * feedback.metadata->>youtube_url for Telegram-path duplicates.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_THRESHOLD = 0.7;

/**
 * Extract YouTube video ID from various URL formats.
 * Handles youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, and ?si= params.
 * @param {string} url
 * @returns {string|null} Video ID or null
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID or youtube.com/shorts/ID
    if (u.hostname.includes('youtube.com')) {
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/**
 * Tokenize text into normalized words
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2) // Skip short words
  );
}

/**
 * Compute Jaccard similarity between two sets
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0-1 similarity score
 */
function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

/**
 * Check if an idea is a duplicate of existing items
 * @param {string} title - New item title
 * @param {Object} [options]
 * @param {number} [options.threshold=0.7] - Similarity threshold
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {string} [options.sourceType] - 'todoist' or 'youtube' (checks both if omitted)
 * @param {string} [options.excludeId] - ID to exclude from results (the item being evaluated)
 * @param {string} [options.youtubeVideoId] - YouTube video ID for exact-match dedup (higher confidence than title)
 * @returns {Promise<{isDuplicate: boolean, matches: Array, bestMatch: Object|null}>}
 */
export async function checkDuplicate(title, options = {}) {
  const threshold = options.threshold || DEFAULT_THRESHOLD;
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const newTokens = tokenize(title);
  const matches = [];

  // Video-ID exact matching (highest confidence, checked first)
  if (options.youtubeVideoId) {
    // Check eva_youtube_intake for exact video ID match
    const { data: ytMatches } = await supabase
      .from('eva_youtube_intake')
      .select('id, title, status')
      .eq('youtube_video_id', options.youtubeVideoId)
      .neq('status', 'error');

    for (const item of ytMatches || []) {
      if (item.id !== options.excludeId) {
        matches.push({ source: 'youtube', id: item.id, title: item.title, similarity: 1.0, status: item.status, matchType: 'video_id' });
      }
    }

    // Check eva_todoist_intake for same extracted video ID
    let tdQuery = supabase
      .from('eva_todoist_intake')
      .select('id, title, status')
      .eq('extracted_youtube_id', options.youtubeVideoId)
      .neq('status', 'error');
    if (options.excludeId) tdQuery = tdQuery.neq('id', options.excludeId);
    const { data: tdMatches } = await tdQuery;

    for (const item of tdMatches || []) {
      matches.push({ source: 'todoist', id: item.id, title: item.title, similarity: 1.0, status: item.status, matchType: 'video_id' });
    }

    // FR-004: Cross-path YouTube URL dedup — check feedback.metadata->>youtube_url
    // Catches Telegram-path feedback that has the same YouTube video
    const { data: feedbackUrlMatches } = await supabase
      .from('feedback')
      .select('id, title, status, metadata')
      .not('status', 'in', '(resolved,shipped)')
      .not('metadata->>youtube_url', 'is', null);

    for (const item of feedbackUrlMatches || []) {
      const feedbackVideoId = extractYouTubeVideoId(item.metadata?.youtube_url);
      if (feedbackVideoId === options.youtubeVideoId) {
        matches.push({
          source: 'feedback_cross_path',
          id: item.id,
          title: item.title,
          similarity: 1.0,
          status: item.status,
          matchType: 'youtube_url_cross_path',
        });
      }
    }
  }

  // Check Todoist intake
  if (!options.sourceType || options.sourceType !== 'youtube') {
    let query = supabase
      .from('eva_todoist_intake')
      .select('id, title, status')
      .neq('status', 'error');
    if (options.excludeId) query = query.neq('id', options.excludeId);
    const { data: todoistItems } = await query;

    for (const item of todoistItems || []) {
      const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
      if (similarity >= threshold) {
        matches.push({ source: 'todoist', id: item.id, title: item.title, similarity, status: item.status });
      }
    }
  }

  // Check YouTube intake
  if (!options.sourceType || options.sourceType !== 'todoist') {
    let query = supabase
      .from('eva_youtube_intake')
      .select('id, title, status')
      .neq('status', 'error');
    if (options.excludeId) query = query.neq('id', options.excludeId);
    const { data: youtubeItems } = await query;

    for (const item of youtubeItems || []) {
      const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
      if (similarity >= threshold) {
        matches.push({ source: 'youtube', id: item.id, title: item.title, similarity, status: item.status });
      }
    }
  }

  // Check existing feedback items too
  const { data: feedbackItems } = await supabase
    .from('feedback')
    .select('id, title, status')
    .in('source_type', ['todoist_intake', 'youtube_intake', 'manual_feedback']);

  for (const item of feedbackItems || []) {
    const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
    if (similarity >= threshold) {
      matches.push({ source: 'feedback', id: item.id, title: item.title, similarity, status: item.status });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);

  return {
    isDuplicate: matches.length > 0,
    matches,
    bestMatch: matches[0] || null
  };
}

// Export helpers for testing
export { jaccardSimilarity, tokenize, extractYouTubeVideoId };

export default { checkDuplicate, jaccardSimilarity, tokenize, extractYouTubeVideoId };
