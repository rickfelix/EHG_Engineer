/**
 * Rounds Scheduler - Thin Wrapper (Consolidated)
 * SD-EHG-ORCH-FOUNDATION-CLEANUP-001-E: FR-7
 * SD-OKR-AUTO-KR-GOV-1-2-001: US-003 (consolidation into Pipeline Orchestrator)
 *
 * Backward-compatible re-export layer. All round registration and execution
 * is now handled by EvaMasterScheduler. This module maintains the original
 * API surface for existing consumers (e.g., scripts/eva/run-rounds.js).
 *
 * Consolidation: Round registrations are tracked for the Pipeline Orchestrator
 * subsystem. The cadence metadata (frequent, hourly, daily, weekly, monthly)
 * is preserved for unified cadence management.
 *
 * Original: SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-002: FR-002
 */

import { EvaMasterScheduler } from './eva-master-scheduler.js';

// Singleton instance for module-level API compatibility.
// Uses a minimal config (no supabase needed for round registry operations).
const _sharedInstance = new EvaMasterScheduler({ config: { pollIntervalMs: 60_000 } });

// Consolidation tracking: cadence registrations for Pipeline Orchestrator
const _cadenceRegistry = new Map();

/**
 * Register a round type with its handler.
 * Delegates to the shared EvaMasterScheduler instance.
 * Also tracks cadence metadata for Pipeline Orchestrator consolidation.
 * @param {string} roundType
 * @param {Object} config - { description, handler, cadence }
 */
export function registerRound(roundType, config) {
  _sharedInstance.registerRound(roundType, config);
  // Track cadence for Pipeline Orchestrator subsystem (US-003)
  if (config.cadence) {
    _cadenceRegistry.set(roundType, {
      cadence: config.cadence,
      description: config.description || roundType,
      registeredAt: new Date().toISOString(),
    });
  }
}

/**
 * Execute a registered round.
 * @param {string} roundType
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export function runRound(roundType, options = {}) {
  return _sharedInstance.runRound(roundType, options);
}

/**
 * List all registered rounds.
 * @returns {Array<Object>}
 */
export function listRounds() {
  return _sharedInstance.listRounds();
}

/**
 * Start an interval-based scheduler (legacy convenience function).
 * Creates a new EvaMasterScheduler for the interval loop.
 * @param {Object} [options]
 * @param {number} [options.intervalMs=3600000]
 * @param {Function} [options.logger]
 * @returns {{ stop: Function }}
 */
export function startScheduler(options = {}) {
  const { intervalMs = 3_600_000, logger = console.log } = options;

  const tick = async () => {
    await _sharedInstance._executeScheduledRounds();
  };

  const intervalId = setInterval(tick, intervalMs);
  logger(`[RoundsScheduler] Started with ${intervalMs}ms check interval (delegating to EvaMasterScheduler)`);

  return {
    stop() {
      clearInterval(intervalId);
      logger('[RoundsScheduler] Stopped');
    },
  };
}

/**
 * Get cadence registrations for Pipeline Orchestrator consolidation.
 * Returns all rounds with their cadence metadata.
 * @returns {Array<{ roundType: string, cadence: string, description: string, registeredAt: string }>}
 */
export function getCadenceRegistrations() {
  return Array.from(_cadenceRegistry.entries()).map(([roundType, meta]) => ({
    roundType,
    ...meta,
  }));
}
