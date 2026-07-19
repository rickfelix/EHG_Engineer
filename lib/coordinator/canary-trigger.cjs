// @wire-check-exempt: library consumed by scripts/canary-trigger-sweep.mjs (npm run canary:sweep)
// via createRequire + by tests/unit/canary-trigger.test.js, and the future canary responder.
/**
 * canary-trigger — reliably request Adam's pre-merge / full-row canary verification.
 * SD-LEO-INFRA-CANARY-SUPPORT-TRIGGER-RELIABILITY-001.
 *
 * Closes the "coordinator does not always ask + Adam gets caught up" gap: instead of
 * relying on ad-hoc memory, a deterministic sweep enqueues a DURABLE, idempotent
 * `canary_request` advisory row for each eligible SD. The reserved kind already exists —
 * the Adam full-lane inbox EXCLUDES `canary_request` from its generic drain (it is "owned
 * by the canary responder", scripts/adam-advisory.cjs), so the request PERSISTS until the
 * responder/Adam actions it (acknowledged_at). This module only PRODUCES requests.
 *
 * HARD LINE (FR-4 — CLAUDE_ADAM.md): this is ADVISORY augmentation, NOT a safety-net. The
 * coordinator stays 100% accountable and runs fully without Adam. enqueue is fire-and-forget
 * (FAIL-OPEN: returns {ok:false} on error, NEVER throws into its caller) and NO handoff /
 * merge / gate may ever depend on a canary_request existing or being actioned.
 *
 * The advisory-lane invariant mirrors adam-advisory.cjs: message_type=INFO, payload.kind set,
 * and NEVER payload.signal_type / payload.intent_action (so the friction signal-router and
 * the deconfliction sweep never scoop it).
 */

const CANARY_REQUEST_KIND = 'canary_request';

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: the unactioned-request scan is a
// processed read (the sweep escalates/acts per row) — paginate past the PostgREST 1000-row
// cap. Fail-open [] policy preserved (fetchAllPaginated throws → caught at the call site).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

// Phases at which there is built code to canary BEFORE the merge lands (pre-merge / full-row).
const CANARY_ELIGIBLE_PHASES = new Set([
  'EXEC', 'EXEC_COMPLETE', 'PLAN_VERIFICATION', 'LEAD', 'LEAD_FINAL', 'LEAD_FINAL_APPROVAL',
]);

/**
 * FR-1 (pure): is this SD eligible for a canary-verification request?
 * Eligible = an active (not terminal) real-build SD that has reached EXEC (so there is
 * something to verify pre-merge). Excludes test fixtures, docs-only, and orchestrator
 * parents (no inline code to canary).
 * @param {{sd_key?:string,id?:string,sd_type?:string,status?:string,current_phase?:string,is_test_fixture?:boolean}} sd
 * @returns {boolean}
 */
function isCanaryEligible(sd) {
  if (!sd || typeof sd !== 'object') return false;
  const key = String(sd.sd_key || sd.id || '');
  if (!key) return false;
  if (sd.is_test_fixture === true) return false;
  if (/^SD-(DEMO|TEST)\b/i.test(key)) return false;
  const type = String(sd.sd_type || '').toLowerCase();
  if (type === 'documentation' || type === 'orchestrator') return false;
  const status = String(sd.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled') return false; // terminal — too late to canary pre-merge
  const phase = String(sd.current_phase || '').toUpperCase();
  return CANARY_ELIGIBLE_PHASES.has(phase);
}

/**
 * FR-1 (pure): build the canary_request advisory payload. INVARIANT: kind=canary_request,
 * and NEVER signal_type / intent_action.
 * @param {object} sd
 * @param {{nowIso?:string, correlationId?:string}} [opts]
 * @returns {object}
 */
function buildCanaryRequestPayload(sd, opts = {}) {
  const key = String((sd && (sd.sd_key || sd.id)) || '');
  const payload = {
    kind: CANARY_REQUEST_KIND,
    sd_id: key,
    sd_uuid: (sd && sd.id && sd.id !== key) ? sd.id : null,
    body: `Canary-verify ${key} pre-merge / full-row against intent (ADVISORY — coordinator stays 100% accountable; not a blocking gate).`,
    requested_at: opts.nowIso || null,
  };
  if (opts.correlationId) payload.correlation_id = opts.correlationId;
  // INVARIANT: no signal_type, no intent_action (advisory lane only).
  return payload;
}

/**
 * Is there already an un-actioned canary_request for this sd_id? (idempotency check)
 * FAIL-OPEN: on error returns true-ish guard {pending:null} so the caller can decide;
 * here we treat a query error as "do not double-insert" only if explicitly told — default
 * is to report pending=false on error so a transient read error doesn't permanently
 * suppress a request (the un-actioned dup is itself harmless + caught by coverage).
 */
async function hasPendingCanaryRequest(supabase, sdKey) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id')
    .filter('payload->>kind', 'eq', CANARY_REQUEST_KIND)
    .filter('payload->>sd_id', 'eq', sdKey)
    .is('acknowledged_at', null)
    .limit(1);
  if (error) return { pending: false, error: error.message };
  return { pending: Array.isArray(data) && data.length > 0 };
}

/**
 * FR-1/FR-2/FR-4: idempotently enqueue a DURABLE canary_request for an eligible SD.
 * FAIL-OPEN fire-and-forget — returns a result object, NEVER throws into the caller.
 * @returns {Promise<{ok:boolean, inserted?:boolean, skipped?:boolean, reason?:string, error?:string}>}
 */
async function enqueueCanaryRequest(supabase, sd, opts = {}) {
  try {
    if (!isCanaryEligible(sd)) return { ok: true, skipped: true, reason: 'ineligible' };
    const key = String(sd.sd_key || sd.id);
    const { pending } = await hasPendingCanaryRequest(supabase, key);
    if (pending) return { ok: true, skipped: true, reason: 'already_pending' };
    const payload = buildCanaryRequestPayload(sd, opts);
    const row = {
      sender_session: opts.senderSession || 'canary-trigger',
      // NEVER null — the session_coordination valid_target CHECK rejects null; default to the
      // documented worker->coordinator sentinel (re-targeted on the next /coordinator start).
      target_session: opts.targetSession || 'broadcast-coordinator',
      message_type: 'INFO',
      subject: `[CANARY_REQUEST] ${key}`,
      body: payload.body,
      payload,
      sender_type: 'canary-trigger',
    };
    const { error } = await supabase.from('session_coordination').insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true, inserted: true, sd_id: key };
  } catch (e) {
    // FR-4: fire-and-forget — a failure here must NEVER block the caller.
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * FR-3: coverage — list un-actioned (acknowledged_at IS NULL) canary_request rows older
 * than a staleness window, so a missed/un-picked-up request is VISIBLE (no silent drop).
 * FAIL-OPEN: returns [] on error (and an error field via the second return for callers).
 * @param {object} supabase
 * @param {{olderThanMs?:number, nowMs?:number}} [opts]
 * @returns {Promise<Array<{id:any, sd_id:string, created_at:string, age_ms:number}>>}
 */
async function findUnactionedCanaryRequests(supabase, opts = {}) {
  try {
    const olderThanMs = Number.isFinite(opts.olderThanMs) ? opts.olderThanMs : 0;
    const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : null; // caller passes a clock (scripts stamp it)
    const data = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .filter('payload->>kind', 'eq', CANARY_REQUEST_KIND)
      .is('acknowledged_at', null)
      .order('id')); // unique-key tiebreaker for stable pagination
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const r of data) {
      const createdMs = r.created_at ? Date.parse(r.created_at) : NaN;
      const ageMs = (nowMs != null && Number.isFinite(createdMs)) ? (nowMs - createdMs) : null;
      if (ageMs != null && ageMs < olderThanMs) continue;
      out.push({ id: r.id, sd_id: (r.payload && r.payload.sd_id) || null, created_at: r.created_at, age_ms: ageMs });
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = {
  CANARY_REQUEST_KIND,
  CANARY_ELIGIBLE_PHASES,
  isCanaryEligible,
  buildCanaryRequestPayload,
  hasPendingCanaryRequest,
  enqueueCanaryRequest,
  findUnactionedCanaryRequests,
};
