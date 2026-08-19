/**
 * Chairman Site-Review Attestation Bridge — SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-3 (class c).
 *
 * Bridge-writes a venture_gate_attestations row (check_type='chairman_site_review') from the
 * ONE real, live, human-identity-carrying path a chairman decision actually travels today:
 * scripts/chairman-decisions.mjs's `decide` command -> fn_chairman_decide RPC. That RPC only
 * knows {decision_id, action} -- 'chairman_approval' is a ROUTING CATEGORY covering many
 * chairman_decisions.decision_type values (kill-gate calls, SD approvals, etc.), not just
 * product_review, so this module re-fetches the real row after the RPC succeeds and filters on
 * decision_type==='product_review' before ever writing an attestation.
 *
 * SAFE BY CONSTRUCTION, not just by convention: venture_gate_attestations' own
 * vga_chairman_review_is_human CHECK constraint requires attested_by to match a bare-email shape
 * for check_type='chairman_site_review'. scripts/chairman-decisions.mjs's DECIDED_BY defaults to
 * the generic string 'chairman-cli' when CHAIRMAN_DECIDED_BY is unset -- that default FAILS the
 * email regex, so an un-configured/default CLI invocation cannot silently write a fake attestation;
 * the DB itself refuses it. resolveAndWriteChairmanSiteReviewAttestation surfaces that failure
 * (never swallows it) but never blocks the primary chairman_decisions write, which the caller has
 * already committed by the time this runs.
 */

import { createHash } from 'crypto';

export const PRODUCT_REVIEW_DECISION_TYPE = 'product_review';

/** True when a Supabase/PostgREST error means "the object does not exist yet" (PGRST205/42P01). */
function isMissingRelationError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = String(error.message || '');
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(message);
}

/**
 * Pure: decide whether this decision should produce an attestation, and which verdict.
 * @param {object} decisionRow - a chairman_decisions row (decision_type, venture_id, ...)
 * @param {string} action - 'approved' | 'rejected' (fn_chairman_decide's own vocabulary)
 * @returns {{shouldWrite: boolean, verdict?: 'PASS'|'BLOCKED', reason?: string}}
 */
export function shouldAttestChairmanSiteReview(decisionRow, action) {
  if (!decisionRow) return { shouldWrite: false, reason: 'decision row not found' };
  if (decisionRow.decision_type !== PRODUCT_REVIEW_DECISION_TYPE) {
    return { shouldWrite: false, reason: `decision_type '${decisionRow.decision_type}' is not ${PRODUCT_REVIEW_DECISION_TYPE}` };
  }
  if (!decisionRow.venture_id) return { shouldWrite: false, reason: 'decision row has no venture_id' };
  if (action === 'approved') return { shouldWrite: true, verdict: 'PASS' };
  if (action === 'rejected') return { shouldWrite: true, verdict: 'BLOCKED' };
  // Any other action (e.g. a future addition) is deliberately NOT attested -- defer already
  // never reaches this path (routeDecision handles it before any writer runs).
  return { shouldWrite: false, reason: `action '${action}' has no attestation mapping` };
}

/**
 * Pure: build the venture_gate_attestations row. Does not touch the network.
 * @param {object} params
 * @param {object} params.decisionRow
 * @param {string} params.decisionId
 * @param {'PASS'|'BLOCKED'} params.verdict
 * @param {string} params.decidedBy - real chairman email (DECIDED_BY from the CLI)
 * @param {string|null} [params.rationale]
 * @param {string|null} [params.deploySha] - current venture_deployments.sha at review time, if
 *   known (never the literal 'unknown' sentinel -- callers normalize that to null). FR-6:
 *   subject_content_hash's own column comment always promised "deployed sha + rendered site
 *   build", but nothing ever captured the deploy half; embedding it in subject_ref (rather than
 *   a new column) lets crack-gate-evaluator.js detect a stale PASS after a redeploy.
 * @returns {object} row shape for venture_gate_attestations.insert()
 */
export function buildChairmanSiteReviewAttestationRow({ decisionRow, decisionId, verdict, decidedBy, rationale = null, deploySha = null }) {
  const briefData = decisionRow.brief_data || {};
  const row = {
    venture_id: decisionRow.venture_id,
    check_type: 'chairman_site_review',
    verdict,
    attested_by: decidedBy,
    // The reviewed PACKET was produced by generateReviewPacket() (lib/eva/chairman-product-review.js),
    // not by the chairman -- distinct from attested_by by construction, satisfying
    // vga_attester_not_producer independent of the identity check above.
    produced_by: 'chairman_product_review_packet',
    subject_ref: deploySha
      ? `venture_site:${decisionRow.venture_id}:deploy:${deploySha}`
      : `venture_site:${decisionRow.venture_id}`,
    citation: `chairman_decision:${decisionId}`,
    path_to_pass: verdict === 'PASS'
      ? `Approved via chairman_decisions ${decisionId}. A subsequent send-back/rejected decision on a later review cycle would supersede this attestation.`
      : `Chairman requested changes via chairman_decisions ${decisionId} (rejected). Resolve the cited rationale and obtain a fresh approved decision.`,
    findings: {
      decision_id: decisionId,
      action: verdict === 'PASS' ? 'approved' : 'rejected',
      rationale: rationale || null,
      lifecycle_stage: decisionRow.lifecycle_stage ?? null,
      attempt_number: decisionRow.attempt_number ?? null,
    },
    enforcement_strength: 'convention',
  };
  if (verdict === 'PASS') {
    row.subject_content_hash = createHash('sha256').update(JSON.stringify(briefData)).digest('hex');
  }
  return row;
}

/**
 * I/O, fail-soft: current venture_deployments.sha for a venture, or null if unknown/unavailable.
 * FR-6: venture_deployments is an upsert-style (one row per venture) reachability-probe table
 * written by venture-ops-actuals-sweep -- sha is frequently the literal string 'unknown' today
 * (no deploy pipeline populates it yet for most ventures), which this normalizes to null so
 * callers only ever see "a real sha" or "no signal", never a fake sentinel string.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<string|null>}
 */
async function fetchCurrentDeploySha(supabase, ventureId) {
  try {
    const { data, error } = await supabase.from('venture_deployments').select('sha').eq('venture_id', ventureId).maybeSingle();
    if (error || !data?.sha || data.sha === 'unknown') return null;
    return data.sha;
  } catch {
    return null;
  }
}

/**
 * I/O: fetch the real chairman_decisions row, decide, and write the attestation if warranted.
 * Never throws on "not applicable" (returns {written:false, reason}); DOES throw on a genuine
 * write failure so the caller can surface it loudly without blocking the primary decision write
 * it already committed.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.decisionId
 * @param {string} params.action - 'approved' | 'rejected'
 * @param {string} params.decidedBy
 * @param {string|null} [params.rationale]
 * @returns {Promise<{written: boolean, reason?: string, id?: number}>}
 */
export async function resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId, action, decidedBy, rationale = null }) {
  const { data: decisionRow, error: fetchError } = await supabase
    .from('chairman_decisions')
    .select('venture_id, decision_type, lifecycle_stage, attempt_number, brief_data')
    .eq('id', decisionId)
    .maybeSingle();
  if (fetchError) throw new Error(`chairman_decisions fetch failed: ${fetchError.message}`);

  const gate = shouldAttestChairmanSiteReview(decisionRow, action);
  if (!gate.shouldWrite) return { written: false, reason: gate.reason };

  const deploySha = await fetchCurrentDeploySha(supabase, decisionRow.venture_id);
  const row = buildChairmanSiteReviewAttestationRow({ decisionRow, decisionId, verdict: gate.verdict, decidedBy, rationale, deploySha });

  const { data, error } = await supabase.from('venture_gate_attestations').insert(row).select('id').single();
  if (error) {
    if (isMissingRelationError(error)) return { written: false, reason: 'venture_gate_attestations not yet applied (chairman-gated migration pending)' };
    throw new Error(`venture_gate_attestations insert failed: ${error.message}`);
  }
  return { written: true, id: data.id, verdict: gate.verdict };
}
