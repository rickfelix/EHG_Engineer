/**
 * rubric-cache.js — Content-hash cache for LLM-generated venture rubrics.
 *
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-3).
 *
 * Cache key = SHA-256 hex of stringified {vision_key, plan_key, vision_content_hash,
 * plan_content_hash}. When either source document's content changes, content_hash
 * (GENERATED STORED) changes → cache_key changes → next scoring run regenerates.
 *
 * No TTL. Stale-but-keyed rows are acceptable (content_hash is the freshness signal).
 */

import { createHash } from 'node:crypto';

/**
 * Compute the cache key for a (vision, plan) pair.
 * Pure function; no IO.
 *
 * @param {object} input
 * @param {string} input.vision_key
 * @param {string} input.plan_key
 * @param {string} [input.vision_content_hash]
 * @param {string} [input.plan_content_hash]
 * @returns {string} SHA-256 hex digest
 */
export function computeCacheKey({ vision_key, plan_key, vision_content_hash, plan_content_hash }) {
  const payload = JSON.stringify({
    vision_key,
    plan_key,
    vision_content_hash: vision_content_hash ?? null,
    plan_content_hash: plan_content_hash ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Look up cached rubrics by cache key.
 * On hit: updates last_hit_at (advisory; not awaited for the hot path).
 *
 * @param {object} supabase - Supabase service client
 * @param {string} cacheKey
 * @returns {Promise<Map<string, object>|null>} Map<dimId, rubric> or null on miss.
 */
export async function getCachedRubrics(supabase, cacheKey) {
  const { data, error } = await supabase
    .from('eva_vision_rubric_cache')
    .select('rubrics')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) throw new Error(`getCachedRubrics: ${error.message}`);
  if (!data) return null;
  await supabase
    .from('eva_vision_rubric_cache')
    .update({ last_hit_at: new Date().toISOString() })
    .eq('cache_key', cacheKey);
  return new Map(Object.entries(data.rubrics));
}

/**
 * Persist generated rubrics for a (vision, plan) pair.
 * UPSERTs on cache_key — concurrent writers for the same key are race-safe.
 *
 * @param {object} supabase
 * @param {string} cacheKey
 * @param {Map<string, object>} rubrics - Map<dimId, rubric>
 * @param {object} keyMeta - { vision_key, plan_key, vision_content_hash, plan_content_hash }
 * @param {object} [genMeta] - { generator_model, generator_cost_usd }
 * @returns {Promise<void>}
 */
export async function setCachedRubrics(supabase, cacheKey, rubrics, keyMeta, genMeta = {}) {
  const rubricsObj = Object.fromEntries(rubrics);
  const row = {
    cache_key: cacheKey,
    vision_key: keyMeta.vision_key,
    plan_key: keyMeta.plan_key,
    vision_content_hash: keyMeta.vision_content_hash ?? null,
    plan_content_hash: keyMeta.plan_content_hash ?? null,
    rubrics: rubricsObj,
    generator_model: genMeta.generator_model ?? null,
    generator_cost_usd: genMeta.generator_cost_usd ?? null,
  };
  const { error } = await supabase
    .from('eva_vision_rubric_cache')
    .upsert(row, { onConflict: 'cache_key' });
  if (error) throw new Error(`setCachedRubrics: ${error.message}`);
}
