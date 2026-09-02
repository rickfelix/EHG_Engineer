// SD-LEO-FIX-SELF-CLAIM-PREDICATE-001 (Solomon ruling 6580bedb).
//
// A risk-noun hit in a QF's title/description holds it from worker self-claim unconditionally
// (qf-auto-start.cjs), even when a SECURITY sub-agent has already read the text and found no real
// risk change -- costing a coordinator directed dispatch every time (specimens: QF-20260902-206,
// QF-20260901-456). This module is the ONE representation of the fix's interim (no-migration)
// stamp: quick_fixes.compliance_details.risk_reviewed = { by, at, content_hash }.
//
// content_hash is bound to the CURRENT title+description via the SAME hasher the L5 gate-verdict
// cache already uses (stableStringify + computeInputHash, scripts/modules/handoff/gate-verdict-cache.js)
// -- never a second hasher -- so a post-review edit to either field silently invalidates the stamp:
// the row drops back to directed dispatch until re-reviewed. This is deliberate: the stamp certifies
// the TEXT that was read, not the row's identity.
//
// WRITER CONTRACT (ratification 6c263823: no gate accepts evidence authored by the party it gates):
// stampQfRiskReviewed must be called ONLY from a security-agent evidence path citing that agent's
// own FRESH sub_agent_execution_results row -- never by the QF's minter, never by the worker about
// to claim it. This module does not enforce that at runtime (there is no minter/claimant identity
// to check against here); it is a caller contract, same as the QF sensitive-path registry's other
// non-runtime-enforced conventions.
//
// SCOPE NOTE: the stamp answers "was the TEXT read for a risk NOUN false-positive", not "is this
// change safe". A genuine risk CHANGE (e.g. QF-20260902-022's real auth-origin edit) still escalates
// via the persisted routing_tier check earlier in isAutoStartableQF, untouched by this module.

const { stableStringify, computeInputHash } = require('../../scripts/modules/handoff/gate-verdict-cache.js');

/**
 * The content hash a fresh stamp must carry for the given title+description.
 * @param {{title?: string, description?: string}} fields
 * @returns {string}
 */
function computeQfRiskContentHash({ title, description }) {
  return computeInputHash(stableStringify({ title: title || '', description: description || '' }));
}

/**
 * Freshness of a QF row's risk-review stamp against its CURRENT title/description.
 * @param {{title?: string, description?: string, compliance_details?: object}} qf
 * @returns {{ status: 'absent'|'stale'|'fresh', stamp: object|null }}
 */
function getRiskReviewStampFreshness(qf) {
  const stamp = qf?.compliance_details?.risk_reviewed;
  if (!stamp || typeof stamp !== 'object' || !stamp.content_hash) {
    return { status: 'absent', stamp: null };
  }
  const currentHash = computeQfRiskContentHash(qf);
  return { status: stamp.content_hash === currentHash ? 'fresh' : 'stale', stamp };
}

/**
 * Write the risk-review stamp. Read-modify-write on compliance_details so an existing
 * compliance rubric result (or any other key already stored there) is preserved -- this field
 * is written wholesale-overwritten elsewhere (lib/quickfix-compliance-rubric.js, at QF
 * completion time, AFTER self-claim has already happened), so losing the stamp there is
 * harmless to this predicate's purpose, but a mid-flight clobber here would not be.
 *
 * @param {object} supabase - Supabase client
 * @param {string} qfId
 * @param {{ subAgentRowId: string, title?: string, description?: string }} params
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function stampQfRiskReviewed(supabase, qfId, { subAgentRowId, title, description }) {
  if (!subAgentRowId) return { ok: false, error: 'subAgentRowId is required (provenance: must cite the security-agent evidence row)' };
  const { data: current, error: readError } = await supabase
    .from('quick_fixes')
    .select('compliance_details')
    .eq('id', qfId)
    .single();
  if (readError) return { ok: false, error: readError.message };
  const stamp = {
    by: subAgentRowId,
    at: new Date().toISOString(),
    content_hash: computeQfRiskContentHash({ title, description }),
  };
  const nextComplianceDetails = { ...(current?.compliance_details || {}), risk_reviewed: stamp };
  const { error: writeError } = await supabase
    .from('quick_fixes')
    .update({ compliance_details: nextComplianceDetails })
    .eq('id', qfId);
  if (writeError) return { ok: false, error: writeError.message };
  return { ok: true };
}

module.exports = { computeQfRiskContentHash, getRiskReviewStampFreshness, stampQfRiskReviewed };
