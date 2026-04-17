/**
 * SD Classification Helpers
 * SD: SD-LEO-INFRA-FIX-ORCHESTRATOR-CHILD-001
 *
 * Centralizes orchestrator-child detection to prevent contract drift
 * between SD producers (leo-create-sd.js) and gate consumers.
 */

/**
 * Determines whether an SD is a child of an orchestrator.
 *
 * Signal priority:
 *   1. parent_sd_id column (FK-enforced, 100% coverage on orch children)
 *   2. metadata.parent_orchestrator (legacy — set by cascade-validator, infrastructure-consumer-check)
 *   3. metadata.auto_generated (legacy — set by orchestrator-completion-guardian)
 *
 * @param {object} sd - Strategic directive row from strategic_directives_v2
 * @returns {boolean} true if sd is an orchestrator child
 */
export function isOrchestratorChild(sd) {
  if (!sd) return false;
  // Primary: FK column (canonical, always populated for orch children)
  if (sd.parent_sd_id) return true;
  // Fallback: legacy metadata keys
  if (sd.metadata?.parent_orchestrator) return true;
  if (sd.metadata?.auto_generated) return true;
  return false;
}

/**
 * Returns a human-readable parent identifier for logging.
 * @param {object} sd
 * @returns {string}
 */
export function getParentIdentifier(sd) {
  if (sd?.parent_sd_id) return sd.parent_sd_id;
  if (sd?.metadata?.parent_orchestrator) return sd.metadata.parent_orchestrator;
  if (sd?.metadata?.auto_generated) return 'auto_generated';
  return 'unknown';
}
