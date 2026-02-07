/**
 * RCA Auto-Trigger Module
 * SD-LEO-ENH-ENHANCE-RCA-SUB-001
 *
 * Public API for the RCA auto-trigger system.
 *
 * Usage:
 *   import { triggerRCAOnFailure, buildHandoffContext } from '../lib/rca/index.js';
 *
 *   // In a catch block:
 *   await triggerRCAOnFailure(buildHandoffContext({ ... }));
 *
 * @module lib/rca
 */

export {
  TRIGGER_TYPES,
  CLASSIFICATIONS,
  buildTriggerEvent,
  buildHandoffContext,
  buildGateContext,
  buildApiContext,
  buildMigrationContext,
  buildStateMismatchContext,
  redactSecrets,
  truncateContext,
  generateFingerprint,
  checkRateLimit
} from './trigger-sdk.js';

export {
  processTriggerEvent,
  triggerQuick
} from './rca-orchestrator.js';

/**
 * Convenience: trigger RCA on a failure event (non-blocking)
 * Safe to call in catch blocks - never throws
 *
 * @param {Object} triggerEvent - From buildXxxContext()
 * @returns {Promise<void>}
 */
export async function triggerRCAOnFailure(triggerEvent) {
  try {
    const { triggerQuick } = await import('./rca-orchestrator.js');
    await triggerQuick(triggerEvent);
  } catch {
    // Intentionally silent - RCA trigger should never crash the caller
  }
}
