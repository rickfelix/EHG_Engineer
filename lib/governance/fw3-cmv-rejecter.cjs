'use strict';
/**
 * fw3-cmv-rejecter.cjs — SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D (FW-3 Child C).
 *
 * PURE verdict machinery for the independent adversarial CMV-rejecter
 * (docs/design/fw3-effort-distribution-tier-design.md §3): the mandatory
 * CMV-alignment lens is PROPOSER-side, so a framing's self-generated CMV-trace
 * is Solomon certifying Solomon — the CONST-002 correction requires a
 * structurally-separate rejecter whose only job is to try to REJECT
 * instrument-class framings on CMV grounds, plus a gauge on the rejecter
 * itself: reject-rate ≈ 0 over a sufficient sample means the separation is
 * FAKE (structural deference) and must flag (§7.3 rejecter-reality test).
 *
 * DESIGN INVARIANTS (PLAN evidence rows d2f7360a / 0bd7fcf6 / 9a79c3c6):
 *  - The adversarial JUDGMENT is NOT in this module (DESIGN A1 / spine §3.3
 *    owns the objective function — sibling Child G): the invoking session
 *    reasons; this module only lists, records, and measures.
 *  - No process.env reads and no process.exit here (DESIGN A2): config is
 *    injected by the CLI/runner boundary; helpers are pure or fail-soft.
 *  - Wire contract (VALIDATION C2): framings ride the Solomon oracle leg
 *    (sender_type='solomon', payload.oracle=true) with the Child-A
 *    contract-fixed discriminator payload.framing_class='instrument'. Zero
 *    such rows (Child A unmerged) is a BENIGN empty world, never an error.
 *  - First-verdict-wins is enforced by a SINGLE conditional statement:
 *    PostgREST compiles .filter('payload->cmv_rejecter','is',null) into the
 *    UPDATE's WHERE, so only one writer can claim the key (0 rows = lost).
 *    Raceability note (DATABASE d2f7360a): rejecter passes run one session
 *    at a time by construction; the residual read→update window affects only
 *    SIBLING payload keys (marker-class risk, accepted). json-null-vs-missing
 *    conflation is moot — this module only ever writes an object.
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — listPendingFramings and
// detectFakeSeparation scan session_coordination (a GROWING table) over a WIDE 14-day window
// filtered only by sender_type='solomon'. Solomon is a continual strategist, so that window
// can easily exceed the PostgREST 1000-row cap: a capped read would drop pending framings
// (never verdicted) and undersample the reject-rate gauge. Paginate to completion.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const DEFAULT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // design §7.3 measurement window

/** PURE (TS-1): is this row an instrument-class oracle framing awaiting a verdict? */
function isPendingInstrumentFraming(row) {
  const p = row && row.payload;
  if (!p || typeof p !== 'object') return false;
  if (row.sender_type !== 'solomon' && p.oracle !== true) return false;
  if (p.framing_class !== 'instrument') return false;
  return p.cmv_rejecter == null;
}

/** PURE (TS-1): predicate applied to UNFILTERED rows — the tested artifact. */
function filterPendingFramings(rows) {
  return (rows || []).filter(isPendingInstrumentFraming);
}

/**
 * List instrument-class framings awaiting an adversarial verdict. The DB query
 * is deliberately BROAD (solomon-sent rows in the window); the discriminating
 * logic lives in the pure predicate above so a broken builder filter cannot
 * ship green (TESTING gap 2). Fail-soft: { items: [], error? }.
 */
async function listPendingFramings(supabase, { windowMs = DEFAULT_WINDOW_MS, nowMs = Date.now() } = {}) {
  if (!supabase) return { items: [], error: 'no supabase client' };
  try {
    const cutoff = new Date(nowMs - windowMs).toISOString();
    const rows = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, sender_session, sender_type, subject, payload, created_at')
      .eq('sender_type', 'solomon')
      .gte('created_at', cutoff)
      .order('id', { ascending: true })); // unique key: stable page boundaries (FR-6)
    return { items: filterPendingFramings(rows) };
  } catch (e) {
    return { items: [], error: (e && e.message) || String(e) };
  }
}

const VERDICTS = ['rejected', 'survived'];

/** PURE: build the payload.cmv_rejecter object; throws on an invalid verdict. */
function buildVerdictPatch({ verdict, grounds, rejecterSession, nowIso }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`verdict must be one of ${VERDICTS.join('|')} (got "${verdict}")`);
  if (!grounds || !String(grounds).trim()) throw new Error('grounds required — an adversarial verdict without grounds is unauditable');
  return {
    verdict,
    grounds: String(grounds).trim(),
    at: nowIso || new Date().toISOString(),
    rejecter_session: rejecterSession || null,
  };
}

/**
 * Record a verdict with FIRST-VERDICT-WINS: the .filter(payload->cmv_rejecter
 * is null) guard rides in the UPDATE's WHERE (single statement, atomic for the
 * key). 0 matched rows → { ok: false, alreadyVerdicted: true }. Fail-soft.
 */
async function recordVerdict(supabase, { rowId, verdict, grounds, rejecterSession } = {}) {
  if (!supabase || !rowId) return { ok: false, error: 'rowId required' };
  let patch;
  try { patch = buildVerdictPatch({ verdict, grounds, rejecterSession }); }
  catch (e) { return { ok: false, error: e.message }; }
  try {
    const { data: current, error: readErr } = await supabase
      .from('session_coordination')
      .select('payload')
      .eq('id', rowId)
      .single();
    if (readErr) return { ok: false, error: readErr.message };
    if (current && current.payload && current.payload.cmv_rejecter != null) {
      return { ok: false, alreadyVerdicted: true };
    }
    const merged = { ...((current && current.payload) || {}), cmv_rejecter: patch };
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ payload: merged })
      .eq('id', rowId)
      .filter('payload->cmv_rejecter', 'is', null) // first-verdict-wins guard (in the WHERE)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data) || data.length === 0) return { ok: false, alreadyVerdicted: true };
    return { ok: true, verdict: patch };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * PURE (TS-5): reject-rate over verdicted instrument framings. Malformed
 * cmv_rejecter entries (no recognizable verdict) are EXCLUDED from the sample
 * so the rate can never leak NaN/undefined (TESTING gap 4).
 * @returns {{ sample: number, rejected: number, rejectRate: number|null }}
 */
function computeRejectRate(rows) {
  let sample = 0;
  let rejected = 0;
  for (const row of rows || []) {
    const p = row && row.payload;
    if (!p || typeof p !== 'object') continue;
    if (p.framing_class !== 'instrument') continue;
    const v = p.cmv_rejecter && p.cmv_rejecter.verdict;
    if (!VERDICTS.includes(v)) continue;
    sample += 1;
    if (v === 'rejected') rejected += 1;
  }
  return { sample, rejected, rejectRate: sample > 0 ? rejected / sample : null };
}

/**
 * PURE (TS-3): the fake-separation trip predicate. Trips ONLY when the sample
 * is sufficient (>= minSample, inclusive) AND the reject-rate is at-or-below
 * epsilon (inclusive). Small samples NEVER trip (design §7.1 low-volume
 * caution); a zero-sample world returns count=0 cleanly (pre-Child-A).
 */
function evaluateFakeSeparation({ sample, rejected, rejectRate }, { minSample = 10, epsilon = 0.05 } = {}) {
  const trip = sample >= minSample && rejectRate !== null && rejectRate <= epsilon;
  return { count: trip ? 1 : 0, sample, rejected, rejectRate, minSample, epsilon };
}

/**
 * PURE (TS-4): structural-separation check — the rejecter must never be the
 * proposing Solomon session. Fail-CLOSED on an unresolvable invoker: without a
 * provable identity, separation cannot be certified.
 */
function checkStructuralSeparation({ invokerSession, activeSolomonSession }) {
  if (!invokerSession) return { ok: false, reason: 'invoker session unresolvable — separation cannot be certified (fail-closed)' };
  if (activeSolomonSession && invokerSession === activeSolomonSession) {
    return { ok: false, reason: `invoker ${invokerSession} IS the active Solomon — proposer cannot be its own rejecter (CONST-002)` };
  }
  return { ok: true };
}

/** Runner-boundary detector: fetch window, measure, evaluate. Fail-soft {count:0, error?}. */
async function detectFakeSeparation(supabase, { windowMs = DEFAULT_WINDOW_MS, minSample, epsilon, nowMs = Date.now() } = {}) {
  if (!supabase) return { count: 0, sample: 0, error: 'no supabase client' };
  try {
    const cutoff = new Date(nowMs - windowMs).toISOString();
    const rows = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('payload')
      .eq('sender_type', 'solomon')
      .gte('created_at', cutoff)
      .order('id', { ascending: true })); // unique key: stable page boundaries (FR-6)
    return evaluateFakeSeparation(computeRejectRate(rows), { minSample, epsilon });
  } catch (e) {
    return { count: 0, sample: 0, error: (e && e.message) || String(e) };
  }
}

module.exports = {
  DEFAULT_WINDOW_MS,
  isPendingInstrumentFraming,
  filterPendingFramings,
  listPendingFramings,
  buildVerdictPatch,
  recordVerdict,
  computeRejectRate,
  evaluateFakeSeparation,
  checkStructuralSeparation,
  detectFakeSeparation,
};
