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
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-2. This function used to take ONLY a
 * ventureId, build its OWN service client, and UPDATE unconditionally — so it ignored
 * both the dryRun flag and any injected client that the rest of deleteVentureFully
 * honours (phases 2 and 4 already accept `{ dryRun }`). Two consequences, both real:
 *   1. A "preview" performed a live write, so the preview was never side-effect-free.
 *   2. A unit test passing dryRun plus a stub client STILL wrote to the live table,
 *      because this phase bypassed the injection seam and read process.env directly.
 * It also returned 0 on failure, which is indistinguishable from "nothing to clean" —
 * a failed write was invisible. It now THROWS instead. The sole production caller
 * (deleteVentureFully phase 3) wraps this in try/catch and is explicitly non-blocking,
 * so throwing surfaces the failure as phases.resources_error without changing control
 * flow. Modelled on lib/cleanup/credentials.js, which short-circuits on dryRun BEFORE
 * the write rather than after it.
 *
 * @param {string} ventureId - Venture UUID
 * @param {object} [options={}]
 * @param {boolean} [options.dryRun=false] - Report what WOULD be cleaned; issue no write.
 * @param {object}  [options.supabase] - Injected client. Defaults to a service client.
 * @returns {Promise<number>} Count of rows updated, or (dryRun) rows that would be.
 * @throws {Error} If the query fails. Callers must decide whether that is fatal.
 */
export async function markResourcesCleaned(ventureId, options = {}) {
  const { dryRun = false, supabase: injectedClient = null } = options;
  const supabase = injectedClient || createSupabaseServiceClient();

  // dryRun short-circuits BEFORE the update. This is a read, so a preview can report
  // the real count without mutating anything.
  if (dryRun) {
    const { data, error } = await supabase
      .from('venture_resources')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('status', 'active');

    if (error) throw new Error(`[venture-resources] dry-run count failed: ${error.message}`);
    return data?.length ?? 0;
  }

  const { data, error } = await supabase
    .from('venture_resources')
    .update({ status: 'cleaned' })
    .eq('venture_id', ventureId)
    .eq('status', 'active')
    .select('id');

  if (error) throw new Error(`[venture-resources] cleanup failed: ${error.message}`);
  return data?.length ?? 0;
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
