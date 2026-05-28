/**
 * venture-pipeline-pointer.js — sd-start pointer to the Venture Lifecycle Pipeline.
 *
 * SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001 (FR-4).
 *
 * When sd-start claims an orchestrator or venture SD, it surfaces a one-line
 * pointer to the canonical pipeline section in CLAUDE_LEAD.md — so the LEAD
 * worker sees the sequence (brainstorm → L2 vision → approval → cascade →
 * orchestrator → LEAD-as-circuit-breaker) at the exact moment they engage.
 * Ordinary non-venture SDs get no pointer (no noise).
 */

/**
 * Decide whether to show the venture-pipeline pointer for an SD.
 * Pure predicate — no IO. Reuses the same signals sd-start already selects
 * (sd_type, venture_id, metadata.is_parent).
 *
 * @param {object} sd - SD row (must include sd_type; may include venture_id, metadata)
 * @returns {boolean}
 */
export function shouldShowVenturePipelinePointer(sd) {
  if (!sd || typeof sd !== 'object') return false;
  if (sd.sd_type === 'orchestrator') return true;
  if (sd.venture_id) return true;
  if (sd.metadata && sd.metadata.is_parent === true) return true;
  return false;
}

/**
 * The one-line pointer text. Plain string (caller adds any color codes).
 */
export const VENTURE_PIPELINE_POINTER =
  'Venture pipeline: see CLAUDE_LEAD.md "Venture Lifecycle Pipeline" — ' +
  'brainstorm (6-seat board) → L2 vision → chairman approval → cascade → orchestrator. ' +
  'LEAD is a CIRCUIT-BREAKER: approve OR bubble up to chairman; do NOT redesign the decomposition.';
