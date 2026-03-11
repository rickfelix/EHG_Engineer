/**
 * PromptLoader — Versioned prompt loading from leo_prompts table
 *
 * Queries the leo_prompts table for active prompts by name,
 * falls back to null when no database entry exists (caller provides fallback).
 * Caches results in memory with a configurable TTL.
 *
 * Part of SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-B
 *
 * @module lib/eva/prompt-loader
 */

import { createClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** @type {Map<string, { value: string, expiry: number }>} */
const cache = new Map();

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabaseClient = null;

/**
 * Get or create the Supabase client.
 * Uses service role key for prompt reads (RLS allows anon read of active prompts,
 * but service role is more reliable for server-side usage).
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
function getClient() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  try {
    supabaseClient = createClient(url, key);
    return supabaseClient;
  } catch {
    return null;
  }
}

/**
 * Load an active prompt by name from leo_prompts.
 *
 * Returns the prompt_text of the highest-version active prompt matching the name,
 * or null if not found or on any error. Never throws.
 *
 * @param {string} name - Prompt name (e.g., 'stage-00-acquirability')
 * @returns {Promise<string | null>} prompt_text or null
 */
export async function getPrompt(name) {
  // Check cache first
  const cached = cache.get(name);
  if (cached && Date.now() < cached.expiry) {
    return cached.value;
  }

  try {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client
      .from('leo_prompts')
      .select('prompt_text')
      .eq('name', name)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Cache the result
    cache.set(name, {
      value: data.prompt_text,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    return data.prompt_text;
  } catch {
    // Graceful fallback — never throw
    return null;
  }
}

/**
 * Clear all cached prompts.
 * Useful for testing and manual cache invalidation.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get the current cache size (for diagnostics).
 * @returns {number}
 */
export function getCacheSize() {
  return cache.size;
}
