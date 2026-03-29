/**
 * Vercel Cleanup Provider
 *
 * Wraps existing Vercel deployment deletion logic from lib/genesis/
 * into a standardized provider interface for the cleanup orchestrator.
 *
 * @module lib/cleanup/vercel-provider
 * Part of SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { deleteVercelDeployment } from '../genesis/vercel-deploy.js';

/**
 * Clean up all Vercel deployments associated with a venture.
 *
 * Queries genesis_deployments for active deployments linked to the venture,
 * then deletes each via the existing Vercel deploy module.
 *
 * @param {string} ventureId - UUID of the venture to clean up
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, report what would be deleted without acting
 * @returns {Promise<{success: boolean, deleted: number, errors: Array<{id: string, error: string}>}>}
 */
export async function cleanupVercel(ventureId, options = {}) {
  const { dryRun = false } = options;
  const result = { success: true, deleted: 0, errors: [] };

  const supabase = createSupabaseServiceClient();

  // Find active deployments for this venture
  const { data: deployments, error: queryError } = await supabase
    .from('genesis_deployments')
    .select('simulation_id, deployment_id, project_name')
    .eq('venture_id', ventureId)
    .eq('deleted', false);

  if (queryError) {
    return { success: false, deleted: 0, errors: [{ id: 'query', error: queryError.message }] };
  }

  if (!deployments || deployments.length === 0) {
    return result; // Nothing to clean
  }

  for (const deployment of deployments) {
    if (dryRun) {
      result.deleted++;
      continue;
    }

    // Delete from Vercel via existing module
    if (deployment.deployment_id) {
      const vercelResult = await deleteVercelDeployment(deployment.deployment_id);
      if (!vercelResult.success) {
        // Log but don't fail the whole operation
        result.errors.push({
          id: deployment.deployment_id,
          error: vercelResult.error || 'Unknown Vercel deletion error',
        });
      }
    }

    // Mark as deleted in DB
    const { error: updateError } = await supabase
      .from('genesis_deployments')
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq('simulation_id', deployment.simulation_id);

    if (updateError) {
      result.errors.push({ id: deployment.simulation_id, error: updateError.message });
    } else {
      result.deleted++;
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
