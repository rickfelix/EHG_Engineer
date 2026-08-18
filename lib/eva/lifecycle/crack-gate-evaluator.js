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
 * Combines PBN + both attestation checks into one verdict.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<object>} structured verdict
 */
export async function evaluateCrackGateStatus(supabase, ventureId) {
  const [pbn, stage17, chairmanReview] = await Promise.all([
    fetchPbnStatus(supabase, ventureId),
    fetchLatestAttestation(supabase, ventureId, 'stage17_judgment'),
    fetchLatestAttestation(supabase, ventureId, 'chairman_site_review'),
  ]);

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

export default { evaluateCrackGateStatus, fetchPbnStatus, fetchLatestAttestation, recordCrackGateObservation };
