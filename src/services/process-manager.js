/**
 * Process Manager Module
 * Extracted from CodebaseSearchService.js for Single Responsibility
 *
 * Part of SD-REFACTOR-2025-001-P1-006: CodebaseSearchService Refactoring
 *
 * Contains controlled process lifecycle management without shell spawning.
 * @module ProcessManager
 * @version 1.0.0
 */

// =============================================================================
// PROCESS MANAGER (Replaces spawn/exec for server restart)
// =============================================================================

/**
 * ProcessManager - Controlled process lifecycle without shell spawning
 */
export class ProcessManager {
  constructor() {
    this.pm2Available = null;
  }

  /**
   * Get server status without spawning shell
   */
  async getServerStatus() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Request graceful restart
   *
   * Instead of spawning PM2, we signal the need for restart
   * and let the orchestration layer handle it.
   */
  async requestRestart() {
    return {
      status: 'restart_requested',
      message: 'Restart request queued. Orchestration layer will handle.',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if PM2 is available (for informational purposes)
   */
  async isPM2Available() {
    if (this.pm2Available !== null) {
      return this.pm2Available;
    }

    try {
      // Check if running under PM2 by environment variable
      this.pm2Available = !!process.env.PM2_HOME || !!process.env.pm_id;
      return this.pm2Available;
    } catch {
      this.pm2Available = false;
      return false;
    }
  }
}

// Singleton instance
let processInstance = null;

/**
 * Get singleton ProcessManager instance
 */
export function getProcessManager() {
  if (!processInstance) {
    processInstance = new ProcessManager();
  }
  return processInstance;
}

export default ProcessManager;
