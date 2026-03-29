/**
 * Stage 23 Analysis Step - Deployment Execution
 * Phase: LAUNCH (Stage 23+)
 * Part of SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-B
 *
 * Executes docker-compose up for ventures with deployment artifacts,
 * validates health endpoint, and persists deployment_url to ventures table.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-23-deployment
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createSupabaseServiceClient } from '../../../supabase-client.js';

const HEALTH_CHECK_RETRIES = 3;
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const DEFAULT_APP_PORT = 3000;

/**
 * Check if Docker CLI tools are available.
 * @returns {{ available: boolean, reason?: string }}
 */
function checkDockerAvailability() {
  try {
    execSync('docker --version', { stdio: 'pipe', timeout: 5000 });
    execSync('docker compose version', { stdio: 'pipe', timeout: 5000 });
    return { available: true };
  } catch {
    try {
      execSync('docker-compose --version', { stdio: 'pipe', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'Docker or docker-compose not found in PATH' };
    }
  }
}

/**
 * Wait for a health endpoint to return HTTP 200.
 * @param {string} url
 * @param {Object} [options]
 * @returns {Promise<{ healthy: boolean, statusCode?: number, error?: string }>}
 */
async function waitForHealth(url, { retries = HEALTH_CHECK_RETRIES, intervalMs = HEALTH_CHECK_INTERVAL_MS, timeoutMs = HEALTH_CHECK_TIMEOUT_MS, logger = console } = {}) {
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (Date.now() > deadline) {
      return { healthy: false, error: `Health check timed out after ${timeoutMs}ms` };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        logger.log(`[Stage23-Deploy] Health check passed on attempt ${attempt}: ${res.status}`);
        return { healthy: true, statusCode: res.status };
      }
      logger.warn(`[Stage23-Deploy] Health check attempt ${attempt}: HTTP ${res.status}`);
    } catch (err) {
      logger.warn(`[Stage23-Deploy] Health check attempt ${attempt} failed: ${err.message}`);
    }

    if (attempt < retries) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  return { healthy: false, error: `Health check failed after ${retries} attempts` };
}

/**
 * Execute deployment for a venture.
 *
 * @param {Object} params
 * @param {Object} params.stage22Data - Release readiness data
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.ventureName]
 * @param {string} [params.ventureRepoPath] - Local path to venture repo
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Deployment result
 */
export async function executeDeployment({
  stage22Data,
  ventureId,
  ventureName,
  ventureRepoPath,
  logger = console,
}) {
  const startTime = Date.now();
  logger.log('[Stage23-Deploy] Starting deployment execution', { ventureId, ventureName });

  // Only deploy on 'release' decision
  const releaseDecision = stage22Data?.releaseDecision?.decision || stage22Data?.release_decision;
  if (releaseDecision !== 'release') {
    logger.log(`[Stage23-Deploy] Skipping: release decision is '${releaseDecision}'`);
    return {
      deployed: false,
      skipped: true,
      reason: `Release decision is '${releaseDecision}', requires 'release'`,
      duration_ms: Date.now() - startTime,
    };
  }

  // Check Docker availability
  const docker = checkDockerAvailability();
  if (!docker.available) {
    logger.warn(`[Stage23-Deploy] Docker not available: ${docker.reason}. Skipping.`);
    return {
      deployed: false,
      skipped: true,
      reason: docker.reason,
      duration_ms: Date.now() - startTime,
    };
  }

  // Resolve venture repo path
  const repoPath = ventureRepoPath || resolve(process.cwd(), '..', ventureName || 'unknown');
  const composePath = resolve(repoPath, 'docker-compose.yml');

  if (!existsSync(composePath)) {
    logger.warn(`[Stage23-Deploy] No docker-compose.yml at ${composePath}. Skipping.`);
    return {
      deployed: false,
      skipped: true,
      reason: 'No docker-compose.yml in venture repo',
      duration_ms: Date.now() - startTime,
    };
  }

  // Execute docker-compose up
  logger.log(`[Stage23-Deploy] Running docker compose up in ${repoPath}`);
  try {
    execSync('docker compose up -d --build', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 300_000,
      encoding: 'utf8',
    });
  } catch (err) {
    logger.error(`[Stage23-Deploy] docker compose up failed: ${err.message}`);
    return {
      deployed: false,
      skipped: false,
      error: `docker compose up failed: ${err.message}`,
      duration_ms: Date.now() - startTime,
    };
  }

  // Health check
  const deploymentUrl = `http://localhost:${DEFAULT_APP_PORT}`;
  const healthUrl = `${deploymentUrl}/health`;
  logger.log(`[Stage23-Deploy] Checking health at ${healthUrl}`);

  let health = await waitForHealth(healthUrl, { logger });
  if (!health.healthy) {
    // Fallback to root endpoint
    health = await waitForHealth(deploymentUrl, { logger, retries: 1 });
  }

  if (!health.healthy) {
    logger.error(`[Stage23-Deploy] Health check failed: ${health.error}`);
    return {
      deployed: true,
      healthy: false,
      error: health.error,
      deployment_url: null,
      duration_ms: Date.now() - startTime,
    };
  }

  // Persist deployment_url
  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('ventures')
      .update({ deployment_url: deploymentUrl })
      .eq('id', ventureId);

    if (error) {
      logger.error(`[Stage23-Deploy] Failed to write deployment_url: ${error.message}`);
    } else {
      logger.log(`[Stage23-Deploy] deployment_url saved: ${deploymentUrl}`);
    }
  } catch (err) {
    logger.error(`[Stage23-Deploy] DB update error: ${err.message}`);
  }

  logger.log('[Stage23-Deploy] Deployment complete', { duration: Date.now() - startTime });
  return {
    deployed: true,
    healthy: true,
    deployment_url: deploymentUrl,
    health_status: health.statusCode,
    duration_ms: Date.now() - startTime,
  };
}
