/**
 * Cleanup Orchestrator
 *
 * Coordinates all cleanup providers in the TEARDOWN phase sequence.
 * Individual provider failures are caught and reported without blocking
 * other providers.
 *
 * @module lib/cleanup
 * Part of SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B
 */

import { cleanupVercel } from './vercel-provider.js';
import { cleanupFilesystem } from './filesystem-provider.js';
import { cleanupDocker } from './docker-provider.js';

/**
 * Run the full external resource teardown for a venture.
 *
 * Executes providers in order: Vercel → Filesystem → Docker.
 * Each provider runs independently — a failure in one does not
 * prevent the others from executing.
 *
 * @param {string} ventureId - UUID of the venture to tear down
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Preview mode, no actual deletions
 * @param {string[]} [options.filesystemPaths] - Explicit filesystem paths to clean
 * @returns {Promise<{success: boolean, providers: {vercel: Object, filesystem: Object, docker: Object}}>}
 */
export async function runTeardown(ventureId, options = {}) {
  const { dryRun = false, filesystemPaths } = options;
  const providers = {};

  // Vercel
  try {
    providers.vercel = await cleanupVercel(ventureId, { dryRun });
  } catch (err) {
    providers.vercel = { success: false, error: err.message };
  }

  // Filesystem
  try {
    providers.filesystem = await cleanupFilesystem(ventureId, {
      dryRun,
      paths: filesystemPaths,
    });
  } catch (err) {
    providers.filesystem = { success: false, error: err.message };
  }

  // Docker
  try {
    providers.docker = await cleanupDocker(ventureId, { dryRun });
  } catch (err) {
    providers.docker = { success: false, error: err.message };
  }

  const allSuccess = Object.values(providers).every(p => p.success);

  return { success: allSuccess, providers };
}
