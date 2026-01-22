/**
 * AI Quality Evaluator - Caching
 * Assessment caching and content hash generation
 */

import { BAND_THRESHOLDS } from './config.js';

/**
 * Determine scoring band from weighted score
 * @param {number} weightedScore - Score 0-100
 * @returns {string} 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
 */
function determineBand(weightedScore) {
  if (weightedScore >= BAND_THRESHOLDS.PASS) {
    return 'PASS';
  } else if (weightedScore >= BAND_THRESHOLDS.NEEDS_REVIEW) {
    return 'NEEDS_REVIEW';
  }
  return 'FAIL';
}

/**
 * Determine if validation passed based on band and confidence
 * @param {string} band - 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
 * @param {string} confidence - 'HIGH' | 'MEDIUM' | 'LOW'
 * @param {number} weightedScore - For backward compatibility
 * @param {number} threshold - Dynamic threshold from SD type
 * @returns {boolean} Whether validation passed
 */
function determinePassedStatus(band, confidence, weightedScore, threshold) {
  if (confidence === 'LOW') return false;
  if (band === 'PASS') return true;
  if (band === 'NEEDS_REVIEW' && weightedScore >= threshold) return true;
  return false;
}

/**
 * Check for cached recent assessment to avoid redundant AI calls
 * Returns cached result if assessment exists within TTL and content unchanged
 *
 * @param {Object} supabase - Supabase client
 * @param {string} contentId - ID of content being assessed
 * @param {string} contentHash - Hash of content to detect changes
 * @param {string} contentType - Type of content being assessed
 * @returns {Promise<Object|null>} Cached assessment or null
 */
export async function getCachedAssessment(supabase, contentId, contentHash, contentType) {
  const CACHE_TTL_HOURS = parseInt(process.env.AI_CACHE_TTL_HOURS) || 24;
  const DEBUG = process.env.AI_DEBUG === 'true';

  try {
    const { data, error } = await supabase
      .from('ai_quality_assessments')
      .select('*')
      .eq('content_id', contentId)
      .eq('content_type', contentType)
      .gte('assessed_at', new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString())
      .order('assessed_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    // Cache invalidation logic
    // Case 1: Both hashes exist but differ → content changed → invalidate
    // Case 2: Old entry has NO hash but we have new hash → can't verify → invalidate
    // Case 3: Both hashes exist and match → content unchanged → use cache
    // Case 4: Neither has hash → legacy mode → use cache
    if (contentHash) {
      if (data.content_hash && data.content_hash !== contentHash) {
        if (DEBUG) console.log(`[AI-Eval] Cache invalidated: content hash changed for ${contentId}`);
        return null;
      }
      if (!data.content_hash) {
        if (DEBUG) console.log(`[AI-Eval] Cache invalidated: old entry has no hash, can't verify content for ${contentId}`);
        return null;
      }
    }

    if (DEBUG) console.log(`[AI-Eval] Cache HIT for ${contentId} (age: ${Math.round((Date.now() - new Date(data.assessed_at).getTime()) / 60000)}min)`);

    // Calculate band for cached entries
    const cachedScore = data.weighted_score;
    const cachedThreshold = data.pass_threshold || 70;
    const cachedBand = determineBand(cachedScore);
    const cachedConfidence = data.confidence || 'MEDIUM';

    return {
      scores: data.scores,
      weightedScore: cachedScore,
      feedback: data.feedback,
      passed: determinePassedStatus(cachedBand, cachedConfidence, cachedScore, cachedThreshold),
      threshold: cachedThreshold,
      band: cachedBand,
      confidence: cachedConfidence,
      confidence_reasoning: data.confidence_reasoning || '',
      sd_type: data.sd_type || 'unknown',
      cached: true,
      cached_at: data.assessed_at
    };
  } catch (_err) {
    // Cache lookup failed, proceed with fresh evaluation
    return null;
  }
}

/**
 * Generate content hash for cache invalidation
 * Sample from multiple positions to detect changes anywhere in content
 * @param {string} content - Content to hash
 * @returns {string|null} Hash string or null
 */
export function generateContentHash(content) {
  if (!content) return null;

  const len = content.length;

  // Sample from 5 positions: start, 25%, 50%, 75%, end
  // Each sample is 50 chars (or less if content is short)
  const sampleSize = Math.min(50, Math.floor(len / 5));
  const positions = [
    0,                           // Start
    Math.floor(len * 0.25),      // 25%
    Math.floor(len * 0.5),       // Middle
    Math.floor(len * 0.75),      // 75%
    Math.max(0, len - sampleSize) // End
  ];

  // Build sample string from multiple positions
  const samples = positions.map(pos =>
    content.substring(pos, pos + sampleSize)
  );
  const sample = len + ':' + samples.join(':');

  // Generate hash using djb2 algorithm
  let hash = 5381;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) + hash) + char; // hash * 33 + char
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
