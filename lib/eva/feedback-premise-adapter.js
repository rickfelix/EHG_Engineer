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
 * @param {Object} feedbackRow - a row from the `feedback` table (id, title, description, category, ...)
 * @returns {Object} premise_descriptor shape consumed by checkPremiseLiveness()
 */
export function feedbackToPremiseDescriptor(feedbackRow = {}) {
  const text = [feedbackRow.title, feedbackRow.description].filter(Boolean).join('\n');
  return {
    kind: 'feedback',
    // QF-20260703-428: `category` (e.g. "harness_backlog") is a coarse bucket shared
    // by many unrelated feedback rows, not a defect identifier. checkPremiseLiveness's
    // overlap match keys on `gate_name || cluster_reason` -- feeding it category let an
    // UNRELATED row's shipped fix falsely mark every other same-category row
    // STALE_PREMISE. Identity now comes from the per-row title (cluster_reason) and
    // referenced_files; category is retained as a display-only field.
    gate_name: null,
    cluster_reason: (feedbackRow.title || '').slice(0, 80) || null,
    source: 'feedback',
    severity: feedbackRow.severity || feedbackRow.priority || null,
    premise_text: text,
    referenced_files: extractReferencedFiles(text),
    feedback_id: feedbackRow.id || null,
    category: feedbackRow.category || null,
    // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-2): structured work identifiers
    // lifted out of the prose. cluster_reason above is 80 chars of a worker's message body, which
    // can never match an SD title or a git log entry — but workers DO name real rows inline
    // ("duplicate of QF-20260713-175", "already covered by SD-LEO-INFRA-..."). Those strings are
    // exact, so they give the resolution check something precise to look up.
    //
    // ADDITIVE ON PURPOSE: cluster_reason is left as the per-row title. QF-20260703-428 narrowed
    // identity to the per-row title precisely because a coarse shared key (then `category`) let one
    // row's shipped fix mark every same-bucket row STALE. Identifiers are offered as EXTRA lookup
    // keys, never as a replacement identity, so that regression cannot recur through this door.
    identifiers: extractWorkIdentifiers(text),
  };
}

/**
 * Extract SD keys and QF ids appearing verbatim in signal prose.
 * Deduped, order-preserving, capped — these become additional lookup tokens, not identity.
 */
export function extractWorkIdentifiers(text) {
  const out = [];
  const seen = new Set();
  for (const re of [/\bQF-\d{8}-\d{3}\b/g, /\bSD-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}\b/g]) {
    for (const m of String(text || '').toUpperCase().matchAll(re)) {
      if (!seen.has(m[0])) { seen.add(m[0]); out.push(m[0]); }
    }
  }
  return out.slice(0, 5);
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
