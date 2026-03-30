/**
 * Venture Resources Registry — Helper Module
 * SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B
 *
 * Provides idempotent registration and cleanup of external resources per venture.
 */

import { createSupabaseServiceClient } from './supabase-client.js';

/**
 * Register an external resource for a venture (idempotent upsert).
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} resourceType - One of: github_repo, vercel_deployment, local_directory, supabase_project, domain, npm_package
 * @param {string} resourceIdentifier - Unique identifier (e.g. repo URL, directory path)
 * @param {string} provider - Provider name (e.g. 'github', 'vercel', 'local')
 * @param {object} [metadata={}] - Additional metadata
 * @returns {Promise<object|null>} The upserted row, or null on error
 */
export async function registerVentureResource(ventureId, resourceType, resourceIdentifier, provider, metadata = {}) {
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('venture_resources')
      .upsert(
        {
          venture_id: ventureId,
          resource_type: resourceType,
          resource_identifier: resourceIdentifier,
          provider,
          status: 'active',
          metadata,
        },
        { onConflict: 'venture_id,resource_type,resource_identifier' }
      )
      .select()
      .single();

    if (error) {
      console.error(`[venture-resources] register failed: ${error.message}`);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`[venture-resources] register error: ${err.message}`);
    return null;
  }
}

/**
 * Mark all resources for a venture as cleaned (for master reset).
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<number>} Count of updated rows
 */
export async function markResourcesCleaned(ventureId) {
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('venture_resources')
      .update({ status: 'cleaned' })
      .eq('venture_id', ventureId)
      .eq('status', 'active')
      .select('id');

    if (error) {
      console.error(`[venture-resources] cleanup failed: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error(`[venture-resources] cleanup error: ${err.message}`);
    return 0;
  }
}

/**
 * Get all resources for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} [status] - Optional status filter
 * @returns {Promise<object[]>} Array of resource rows
 */
export async function getVentureResources(ventureId, status) {
  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from('venture_resources')
      .select('*')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[venture-resources] get failed: ${error.message}`);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error(`[venture-resources] get error: ${err.message}`);
    return [];
  }
}
