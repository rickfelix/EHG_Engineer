/**
 * Venture no-crack gate evaluator — SD-FDBK-FIX-VENTURE-CRACK-GATE-001.
 *
 * Combines three checks that must all clear before a venture faces strangers via a
 * distribution/traffic push: a PBN validation score, a stage17_judgment attestation, and a
 * chairman_site_review attestation. Reads from venture_pbn_status(uuid) (a DB function, since
 * PBN storage is split across two disjoint, error-differentiated locations) and
 * v_venture_gate_attestations_latest (a view over the append-only venture_gate_attestations
 * table, for the two check types with no prior storage).
 *
 * Both consumers (the detective sweep in scripts/cron/venture-ops-actuals-sweep.mjs and the
 * preventive precondition in lib/marketing/autonomy-gate.js) call evaluateCrackGateStatus() so
 * there is exactly one place this logic lives.
 *
 * THE PRODUCER-AGNOSTIC ATTESTATION CONTRACT (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-2, class b):
 * fetchLatestAttestation() below reads a venture_gate_attestations row by (venture_id,
 * check_type) only -- it never branches on attested_by/produced_by identity. This IS the named
 * verdict contract: any row that satisfies the table's own schema/CHECK constraints (see
 * database/chairman-gated/20260817_venture_gate_attestations.sql) is honored identically by every
 * consumer, regardless of who/what wrote it. Today the only stage17_judgment producer is a human
 * via scripts/eva/record-gate-attestation.mjs (see docs/reference/venture-gate-attestations-guide.md);
 * a future APA Child E automated producer (SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-E,
 * separate/unbuilt) can start writing rows against this same contract with zero change here. See
 * tests/unit/marketing/crack-gate-evaluator.test.js's "FR-2 producer-agnostic contract" block for
 * a test that proves this against two differently-attributed row shapes.
 */

const PBN_PASS_STATUSES = Object.freeze(['PBN_SCORED']);
const ATTESTATION_CHECK_TYPES = Object.freeze(['stage17_judgment', 'chairman_site_review']);

/** True when a Supabase/PostgREST error means "the object does not exist yet" (PGRST205/42P01). */
function isMissingRelationError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = String(error.message || '');
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(message);
}

/**
 * Reads PBN status via the venture_pbn_status(uuid) RPC. Always binds and asserts `error`.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<{status:string, verdict:string|null, source:string, reason:string, degraded:boolean}>}
 */
export async function fetchPbnStatus(supabase, ventureId) {
  const { data, error } = await supabase.rpc('venture_pbn_status', { p_venture_id: ventureId });
  if (error) {
    return {
      status: 'PBN_SOURCE_UNAVAILABLE',
      verdict: null,
      source: 'none',
      reason: `rpc_error:${error.message}`,
      degraded: false,
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { status: 'PBN_SOURCE_UNAVAILABLE', verdict: null, source: 'none', reason: 'rpc_returned_no_row', degraded: false };
  }
  return row;
}

/**
 * Reads the latest attestation for one check_type via v_venture_gate_attestations_latest.
 * Distinguishes "table/view does not exist yet" (chairman migration unapplied) from
 * "no attestation recorded yet" (NO_DATA) — the two must never be conflated.
 *
 * KNOWN GAP (flagged by PR1 deep-tier adversarial review, deliberately not fixed here): the
 * table's subject_content_hash column exists so a PASS can be invalidated once the reviewed
 * content changes, but this function does not compare the stored hash against any "current"
 * content hash — a PASS reads as good indefinitely until a newer attestation is recorded. Not
 * implemented because "what counts as current content for a venture" (the live URL? a specific
 * deploy sha? a rendered snapshot?) is a real design question this SD did not resolve, and a
 * wrong comparison would be worse than none. Not a live bypass today — nothing in this SD wires
 * the evaluator into an enforcing (blocking) path; both consumers are observe-only.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {'stage17_judgment'|'chairman_site_review'} checkType
 */
export async function fetchLatestAttestation(supabase, ventureId, checkType) {
  const { data, error } = await supabase
    .from('v_venture_gate_attestations_latest')
    .select('verdict, attested_by, produced_by, subject_ref, citation, path_to_pass, computed_at')
    .eq('venture_id', ventureId)
    .eq('check_type', checkType)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return { verdict: 'ATTESTATION_SOURCE_UNAVAILABLE', reason: 'attestations_table_not_yet_applied', row: null };
    }
    return { verdict: 'ATTESTATION_SOURCE_UNAVAILABLE', reason: `read_error:${error.message}`, row: null };
  }
  if (!data) {
    // Fail-closed by construction: absence reads as NO_DATA, not PASS. A .maybeSingle() null on
    // absence must never be interpreted positively (see venture_gate_attestations view comment).
    return { verdict: 'NO_DATA', reason: 'no_attestation_recorded', row: null };
  }
  return { verdict: data.verdict, reason: `attested_by:${data.attested_by}`, row: data };
}

/**
 * FR-6, fail-soft: a chairman_site_review PASS whose subject_ref embeds a deploy sha
 * (venture_site:<id>:deploy:<sha>, written by buildChairmanSiteReviewAttestationRow since FR-6)
 * is compared against the venture's CURRENT venture_deployments.sha. A mismatch means the site
 * was redeployed after the chairman reviewed it -- the attestation is downgraded from PASS to
 * STALE_DEPLOY so evaluateCrackGateStatus's chairmanOk check (verdict === 'PASS') correctly
 * stops treating it as satisfied. Every other case (non-PASS input, no embedded sha -- i.e. a
 * pre-FR-6 row or a review recorded before any deploy sha was known, current sha undeterminable,
 * or the two shas match) returns the input UNCHANGED: this can only ever make a stale PASS
 * un-pass, never invent a pass or a block from nothing.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {object} chairmanReview - fetchLatestAttestation()'s chairman_site_review result
 * @returns {Promise<object>} chairmanReview, or a copy with verdict='STALE_DEPLOY' if stale
 */
async function checkDeployFreshness(supabase, ventureId, chairmanReview) {
  if (chairmanReview?.verdict !== 'PASS') return chairmanReview;
  const embedded = chairmanReview.row?.subject_ref?.match(/:deploy:(.+)$/)?.[1];
  if (!embedded || embedded === 'unknown') return chairmanReview;
  let current;
  try {
    const { data, error } = await supabase.from('venture_deployments').select('sha').eq('venture_id', ventureId).maybeSingle();
    if (error || !data?.sha || data.sha === 'unknown') return chairmanReview;
    current = data.sha;
  } catch {
    return chairmanReview;
  }
  if (current === embedded) return chairmanReview;
  return { ...chairmanReview, verdict: 'STALE_DEPLOY', reason: `deploy changed since review (reviewed:${embedded}, current:${current})` };
}

/**
 * Combines PBN + both attestation checks into one verdict.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<object>} structured verdict
 */
export async function evaluateCrackGateStatus(supabase, ventureId) {
  const [pbn, stage17, chairmanReviewRaw] = await Promise.all([
    fetchPbnStatus(supabase, ventureId),
    fetchLatestAttestation(supabase, ventureId, 'stage17_judgment'),
    fetchLatestAttestation(supabase, ventureId, 'chairman_site_review'),
  ]);
  const chairmanReview = await checkDeployFreshness(supabase, ventureId, chairmanReviewRaw);

  const missing = [];

  // PBN_CONFLICT and PBN_SOURCE_UNAVAILABLE both fail closed — never pick a side, never treat
  // "cannot tell" as "not scored yet" (they are different situations for an operator).
  const pbnOk = PBN_PASS_STATUSES.includes(pbn.status) && pbn.verdict === 'PASS';
  if (!pbnOk) missing.push({ check: 'pbn', status: pbn.status, verdict: pbn.verdict, reason: pbn.reason });

  const stage17Ok = stage17.verdict === 'PASS';
  if (!stage17Ok) missing.push({ check: 'stage17_judgment', verdict: stage17.verdict, reason: stage17.reason });

  const chairmanOk = chairmanReview.verdict === 'PASS';
  if (!chairmanOk) missing.push({ check: 'chairman_site_review', verdict: chairmanReview.verdict, reason: chairmanReview.reason });

  return {
    overall: missing.length === 0 ? 'MEETS_CRITERION' : 'NOT_MET',
    venture_id: ventureId,
    pbn,
    stage17_judgment: stage17,
    chairman_site_review: chairmanReview,
    missing,
  };
}

/**
 * Records an observe-only witness row for a crack-gate evaluation. Shared by both enforcement
 * layers (the detective sweep and the preventive publish-gate precondition) so the two write
 * the identical system_events payload shape into one queryable dataset — see FR-9's promotion
 * criterion, which reads this dataset regardless of which layer produced a given row.
 *
 * ADVERSARIAL REVIEW FIX (found running /heal's live smoke test, not caught by any prior unit
 * test): system_events.idempotency_key is auto-derived by a BEFORE INSERT trigger
 * (fn_ensure_idempotency_key) as `event_type || ':' || COALESCE(venture_id::text,'global') ||
 * ':' || floor(epoch_seconds)` — keyed off the table's own top-level `venture_id` COLUMN, not
 * anything inside `payload`. The insert below previously embedded venture_id only in payload, so
 * every crack-gate row derived the identical key `VENTURE_CRACK_GATE_OBSERVE_ONLY:global:<sec>`
 * regardless of which venture it was for. Verified live: a single sweep cycle over 3 ventures
 * produced a real 23505 unique-constraint violation (system_events_idempotency_key_key) whenever
 * two ventures landed in the same wall-clock second — with more ventures in the fleet this
 * approaches certainty every cycle, silently starving the FR-9 promotion-criterion's observation
 * window. Fixed by setting the real venture_id column so the trigger's own key naturally
 * disambiguates per venture.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {object} verdict - result of evaluateCrackGateStatus()
 * @param {string} source - 'sweep' | 'publish_gate' | 'graduation' — which layer observed this
 */
export async function recordCrackGateObservation(supabase, ventureId, verdict, source = 'sweep') {
  const { error } = await supabase.from('system_events').insert({
    event_type: 'VENTURE_CRACK_GATE_OBSERVE_ONLY',
    venture_id: ventureId,
    payload: {
      venture_id: ventureId,
      would_block: verdict.overall !== 'MEETS_CRITERION',
      missing: verdict.missing.map((m) => m.check),
      source,
      checked_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error(`system_events insert failed: ${error.message}`);
}

export const ATTESTATION_CHECK_TYPES_EXPORT = ATTESTATION_CHECK_TYPES;

/**
 * SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-8 (class h): distinguishes "the underlying DB objects
 * don't exist / the RPC errored" from "genuinely not scored/attested yet". The latter is a normal,
 * expected state for a fresh venture and both consumers already treat it as such (NOT_MET,
 * observe-only). The former means every crack-gate check is silently measuring nothing -- exactly
 * the failure mode that let the sibling SD's choke-gate backstop read as shipped/complete while
 * being DB-inert for weeks (3 gated migrations never applied, 0/152 ventures scored). Both
 * consumers call this on every verdict so the condition is impossible to ship past silently again.
 * @param {object} verdict - result of evaluateCrackGateStatus()
 * @returns {{unavailable: boolean, reasons: string[]}}
 */
export function hasUnavailableSource(verdict) {
  const reasons = [];
  if (verdict?.pbn?.status === 'PBN_SOURCE_UNAVAILABLE') reasons.push(`pbn:${verdict.pbn.reason}`);
  if (verdict?.stage17_judgment?.verdict === 'ATTESTATION_SOURCE_UNAVAILABLE') reasons.push(`stage17_judgment:${verdict.stage17_judgment.reason}`);
  if (verdict?.chairman_site_review?.verdict === 'ATTESTATION_SOURCE_UNAVAILABLE') reasons.push(`chairman_site_review:${verdict.chairman_site_review.reason}`);
  return { unavailable: reasons.length > 0, reasons };
}

export default { evaluateCrackGateStatus, fetchPbnStatus, fetchLatestAttestation, recordCrackGateObservation, hasUnavailableSource };
