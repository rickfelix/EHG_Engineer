/**
 * Feedback-row -> premise_descriptor adapter (SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-1)
 *
 * checkPremiseLiveness() (./premise-liveness.js) already re-verifies a diagnostic
 * premise before a work item is filed; it was only wired into the --from-proposal
 * ingestion path. This adapter reuses it for feedback-row promotion (create-quick-fix.js
 * --feedback-id, leo-create-sd.js --from-feedback, and the auto-refill promoter) so a
 * feedback row whose named defect already shipped a fix refuses promotion with a
 * STALE_PREMISE verdict instead of re-filing a duplicate QF/SD.
 *
 * Does NOT add new staleness logic -- just shapes a feedback row into the
 * { gate_name, cluster_reason, referenced_files, ... } descriptor checkPremiseLiveness
 * already understands, and calls it.
 */

import { checkPremiseLiveness } from './premise-liveness.js';

const FILE_PATH_RE = /[\w./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|sql|json|md)\b/g;

/** Best-effort extraction of implicated file paths from free-text feedback prose. */
export function extractReferencedFiles(text) {
  if (!text) return [];
  const matches = String(text).match(FILE_PATH_RE) || [];
  return [...new Set(matches)].slice(0, 5);
}

/**
 * @param {Object} feedbackRow - a row from the `feedback` table (title, description, category, ...)
 * @returns {Object} premise_descriptor shape consumed by checkPremiseLiveness()
 */
export function feedbackToPremiseDescriptor(feedbackRow = {}) {
  const text = [feedbackRow.title, feedbackRow.description].filter(Boolean).join('\n');
  return {
    kind: 'feedback',
    gate_name: feedbackRow.category || null,
    cluster_reason: (feedbackRow.title || '').slice(0, 80) || null,
    source: 'feedback',
    severity: feedbackRow.severity || feedbackRow.priority || null,
    premise_text: text,
    referenced_files: extractReferencedFiles(text),
  };
}

/**
 * @param {Object} feedbackRow
 * @param {Object} [deps] - forwarded to checkPremiseLiveness (supabase, git, ...)
 * @returns {Promise<{status:'LIVE'|'STALE', confidence_score:number, evidence:string[], recommendation:string}>}
 */
export async function checkFeedbackPremiseLiveness(feedbackRow, deps = {}) {
  return checkPremiseLiveness(feedbackToPremiseDescriptor(feedbackRow), deps);
}

/**
 * Durable audit trail for a --force-liveness bypass (mirrors the --force-claim /
 * force_claim_override precedent). Non-fatal on write failure.
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {string} args.entityId - feedback id (or comma-joined ids)
 * @param {string} args.reason
 */
export async function logForceLivenessOverride({ supabase, entityId, reason }) {
  const { error } = await supabase.from('audit_log').insert({
    event_type: 'force_liveness_override',
    entity_type: 'feedback',
    entity_id: entityId,
    created_by: process.env.CLAUDE_SESSION_ID || null,
    severity: 'warning',
    metadata: { entity_id: entityId, reason, message: `force-liveness override on feedback ${entityId}: ${reason}` },
  });
  if (error) console.warn(`⚠️  [AUDIT_WRITE_FAILED] force_liveness_override audit row not persisted (non-fatal): ${error.message}`);
}

export default checkFeedbackPremiseLiveness;
