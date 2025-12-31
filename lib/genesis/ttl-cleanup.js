/**
 * Genesis Virtual Bunker - TTL Cleanup / Garbage Collection
 *
 * Automatic cleanup of expired simulation deployments.
 * Part of SD-GENESIS-V31-MASON-P3
 *
 * @module lib/genesis/ttl-cleanup
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { deleteVercelDeployment } from './vercel-deploy.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Cleanup result structure.
 * @typedef {Object} CleanupResult
 * @property {number} checked - Number of deployments checked
 * @property {number} expired - Number of expired deployments found
 * @property {number} deleted - Number successfully deleted
 * @property {Array} errors - List of deletion errors
 */

/**
 * Get all expired deployments.
 *
 * @returns {Promise<Array>}
 */
export async function getExpiredDeployments() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('genesis_deployments')
    .select('*')
    .lt('expires_at', now)
    .eq('deleted', false);

  if (error) {
    console.error('Error fetching expired deployments:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Delete a single expired deployment.
 *
 * @param {Object} deployment - Deployment record
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteDeployment(deployment) {
  const { simulation_id, deployment_id, project_name } = deployment;

  console.log(`Deleting expired deployment: ${project_name || simulation_id}`);

  // Delete from Vercel
  if (deployment_id) {
    const vercelResult = await deleteVercelDeployment(deployment_id);
    if (!vercelResult.success) {
      console.warn(`Could not delete Vercel deployment ${deployment_id}: ${vercelResult.error}`);
      // Continue anyway - mark as deleted in DB
    }
  }

  // Mark as deleted in database
  const { error } = await supabase
    .from('genesis_deployments')
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('simulation_id', simulation_id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Run garbage collection on all expired deployments.
 *
 * @returns {Promise<CleanupResult>}
 */
export async function runCleanup() {
  const result = {
    checked: 0,
    expired: 0,
    deleted: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  // Get all deployments (for counting)
  const { data: allDeployments } = await supabase
    .from('genesis_deployments')
    .select('id')
    .eq('deleted', false);

  result.checked = allDeployments?.length || 0;

  // Get expired deployments
  const expired = await getExpiredDeployments();
  result.expired = expired.length;

  if (expired.length === 0) {
    console.log('No expired deployments found.');
    return result;
  }

  console.log(`Found ${expired.length} expired deployments.`);

  // Delete each expired deployment
  for (const deployment of expired) {
    const deleteResult = await deleteDeployment(deployment);

    if (deleteResult.success) {
      result.deleted++;
    } else {
      result.errors.push({
        simulationId: deployment.simulation_id,
        error: deleteResult.error,
      });
    }
  }

  // Log cleanup run
  await logCleanupRun(result);

  console.log(`Cleanup complete: ${result.deleted}/${result.expired} deleted.`);
  return result;
}

/**
 * Log cleanup run to database for auditing.
 *
 * @param {CleanupResult} result - Cleanup result
 */
async function logCleanupRun(result) {
  await supabase
    .from('genesis_cleanup_logs')
    .insert({
      run_at: result.timestamp,
      deployments_checked: result.checked,
      deployments_expired: result.expired,
      deployments_deleted: result.deleted,
      errors: result.errors,
    });
}

/**
 * Get cleanup history.
 *
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>}
 */
export async function getCleanupHistory(limit = 10) {
  const { data, error } = await supabase
    .from('genesis_cleanup_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cleanup history:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Extend TTL for a deployment.
 *
 * @param {string} simulationId - Simulation ID
 * @param {number} additionalDays - Days to extend
 * @returns {Promise<{ success: boolean, newExpiry?: string, error?: string }>}
 */
export async function extendTTL(simulationId, additionalDays) {
  // Get current deployment
  const { data: deployment, error: fetchError } = await supabase
    .from('genesis_deployments')
    .select('expires_at')
    .eq('simulation_id', simulationId)
    .single();

  if (fetchError || !deployment) {
    return { success: false, error: 'Deployment not found' };
  }

  // Calculate new expiry
  const currentExpiry = new Date(deployment.expires_at);
  const newExpiry = new Date(currentExpiry);
  newExpiry.setDate(newExpiry.getDate() + additionalDays);

  // Update
  const { error: updateError } = await supabase
    .from('genesis_deployments')
    .update({
      expires_at: newExpiry.toISOString(),
      ttl_extended: true,
      updated_at: new Date().toISOString(),
    })
    .eq('simulation_id', simulationId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, newExpiry: newExpiry.toISOString() };
}

/**
 * Get deployments expiring soon (within N days).
 *
 * @param {number} withinDays - Days threshold
 * @returns {Promise<Array>}
 */
export async function getExpiringDeployments(withinDays = 1) {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + withinDays);

  const { data, error } = await supabase
    .from('genesis_deployments')
    .select('*')
    .gt('expires_at', now.toISOString())
    .lt('expires_at', threshold.toISOString())
    .eq('deleted', false);

  if (error) {
    console.error('Error fetching expiring deployments:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Generate cleanup report.
 *
 * @returns {Promise<Object>}
 */
export async function generateCleanupReport() {
  const [active, expired, expiringSoon, history] = await Promise.all([
    (async () => {
      const { data } = await supabase
        .from('genesis_deployments')
        .select('id')
        .gt('expires_at', new Date().toISOString())
        .eq('deleted', false);
      return data?.length || 0;
    })(),
    (async () => {
      const expired = await getExpiredDeployments();
      return expired.length;
    })(),
    getExpiringDeployments(1),
    getCleanupHistory(5),
  ]);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      activeDeployments: active,
      expiredPendingCleanup: expired,
      expiringWithin24h: expiringSoon.length,
    },
    expiringSoon: expiringSoon.map(d => ({
      simulationId: d.simulation_id,
      projectName: d.project_name,
      expiresAt: d.expires_at,
    })),
    recentCleanups: history.map(h => ({
      runAt: h.run_at,
      deleted: h.deployments_deleted,
      errors: h.errors?.length || 0,
    })),
  };
}

/**
 * Schedule cleanup to run periodically.
 * This is meant to be called from a cron job or scheduler.
 *
 * Example crontab entry (daily at 3am):
 * 0 3 * * * node -e "import('./lib/genesis/ttl-cleanup.js').then(m => m.runCleanup())"
 */
export async function scheduleCleanup() {
  console.log('Genesis TTL Cleanup - Starting scheduled run...');
  const result = await runCleanup();
  console.log('Genesis TTL Cleanup - Complete:', JSON.stringify(result, null, 2));
  return result;
}

export default {
  getExpiredDeployments,
  runCleanup,
  getCleanupHistory,
  extendTTL,
  getExpiringDeployments,
  generateCleanupReport,
  scheduleCleanup,
};
