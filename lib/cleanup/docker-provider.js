/**
 * Docker Cleanup Provider (Stub)
 *
 * Provides the cleanup provider interface for future Docker
 * container/image cleanup. Currently a no-op since the platform
 * does not use Docker for venture isolation.
 *
 * @module lib/cleanup/docker-provider
 * Part of SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B
 */

/**
 * Clean up Docker resources associated with a venture.
 *
 * Currently a no-op stub. When Docker-based venture isolation is added,
 * this will stop and remove containers, delete images, and prune volumes.
 *
 * @param {string} _ventureId - UUID of the venture (unused in stub)
 * @param {Object} [_options]
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function cleanupDocker(_ventureId, _options = {}) {
  return {
    success: true,
    message: 'no-op: Docker cleanup not configured',
  };
}
