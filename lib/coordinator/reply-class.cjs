/**
 * Reply-class SSOT — SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C
 *
 * Every inter-role message is sender-stamped with one of REPLY_CLASSES
 * (docs/protocol/crew-comms-routing-protocol.md Rule 3: fire-and-forget /
 * reply-needed / live-handshake). This module is the single source of truth for
 * the 3 values plus the PING-ON-SILENCE overdue detector, so every payload
 * builder (worker-signal.cjs, adam-advisory.cjs, solomon-advisory.cjs,
 * coordinator-reply.cjs) stamps identically and never re-declares the literal
 * strings.
 *
 * No migration: reply_class / reply_expected_by / ping_sent_at all ride in the
 * existing session_coordination.payload JSONB column.
 */

const REPLY_CLASSES = Object.freeze(['fire-and-forget', 'reply-needed', 'live-handshake']);
const REPLY_CLASS_SET = new Set(REPLY_CLASSES);

const DEFAULT_REPLY_WINDOW_MS = 2 * 60 * 60_000; // 2h

// QF-20260709-800: alreadyAnswered/resolveAnsweredSet must only count a GENUINE
// answer row (adam_advisory/oracle lane), not a ping_on_silence reminder — a
// ping row also carries payload.reply_to (it threads back to the original
// consult), so without this exclusion a pinged-but-never-answered consult
// falsely dedups as "already answered" and the real answer never gets sent.
const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');
const ANSWER_KIND = PAYLOAD_KINDS.ADAM_ADVISORY;

/** Pure: true iff v is one of the 3 canonical reply-class values. */
function isValidReplyClass(v) {
  return REPLY_CLASS_SET.has(v);
}

/** Pure: ISO timestamp `windowMs` after `nowMs` (defaults: Date.now(), DEFAULT_REPLY_WINDOW_MS). */
function computeReplyExpectedBy(nowMs, windowMs) {
  const base = Number.isFinite(nowMs) ? nowMs : Date.now();
  const win = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_REPLY_WINDOW_MS;
  return new Date(base + win).toISOString();
}

/**
 * Pure: which of `rows` (a sender's own outbound session_coordination rows) are
 * PING-ON-SILENCE candidates right now? A candidate is reply_class='reply-needed',
 * past its reply_expected_by, not already answered (per answeredCorrelationIds —
 * a Set the caller resolves with ONE query, see resolveAnsweredSet), and not
 * already pinged (payload.ping_sent_at unset — the single-fire dedup gate).
 * @param {Array<{id:string, payload:object, created_at?:string}>} rows
 * @param {number} nowMs
 * @param {Set<string>} [answeredCorrelationIds]
 * @returns {Array<object>} the overdue, unanswered, not-yet-pinged rows
 */
function findOverdueReplyNeeded(rows, nowMs, answeredCorrelationIds) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const answered = answeredCorrelationIds instanceof Set ? answeredCorrelationIds : new Set();
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const p = r && r.payload;
    if (!p || p.reply_class !== 'reply-needed') return false;
    if (p.ping_sent_at) return false; // already pinged once — single-fire gate
    if (!p.reply_expected_by) return false; // no window set — nothing to be overdue against
    const expBy = new Date(p.reply_expected_by).getTime();
    if (!Number.isFinite(expBy) || now < expBy) return false; // not yet overdue
    const corr = p.correlation_id;
    if (corr && answered.has(corr)) return false; // already answered
    return true;
  });
}

/**
 * Durable "has this correlation already been answered?" — true iff a row exists
 * whose payload.reply_to echoes it. Generalized from the original
 * scripts/solomon-advisory.cjs alreadyAnswered (Solomon consult dedup); that
 * module now delegates here instead of duplicating the query. Fail-open to
 * false on a query error (never block a real send/ping on a transient fault).
 */
async function alreadyAnswered(supabase, correlationId) {
  if (!correlationId) return false;
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('payload->>reply_to', correlationId)
      .eq('payload->>kind', ANSWER_KIND) // QF-20260709-800: exclude ping_on_silence rows
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

/**
 * Resolve, in ONE query, the subset of `candidateCorrelationIds` that already
 * have an answering row (payload.reply_to echoes them). Fail-open to an EMPTY
 * set on a query error — findOverdueReplyNeeded still gates on reply_expected_by
 * + ping_sent_at, so a fail-open here never causes a ping-storm, only a possible
 * late ping on a transient fault.
 */
async function resolveAnsweredSet(supabase, candidateCorrelationIds) {
  // Delegates to resolveAnswerRows so the answer PREDICATE (kind filter + pagination + fail-open)
  // has exactly ONE definition. reconcileLateVerdicts needs the answering PAYLOAD, not just the
  // id, and two copies of this query would be free to drift apart.
  return new Set((await resolveAnswerRows(supabase, candidateCorrelationIds)).keys());
}

/**
 * Same predicate as resolveAnsweredSet, but returns correlation_id -> answering payload.
 * Fail-open to an EMPTY Map on any query error (identical policy to resolveAnsweredSet).
 * @returns {Promise<Map<string, Object>>}
 */
async function resolveAnswerRows(supabase, candidateCorrelationIds) {
  const ids = Array.from(new Set((candidateCorrelationIds || []).filter(Boolean)));
  if (ids.length === 0) return new Map();
  try {
    // FR-6 (count-truncation discipline): the old .limit(1000) sat exactly on the PostgREST cap —
    // a busy window could silently drop answers and cause spurious pings. Paginate to completion;
    // fail-open empty policy preserved (fetchAllPaginated throws → catch below).
    const _fap = await import('../db/fetch-all-paginated.mjs');
    const data = await _fap.fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, payload')
      .in('payload->>reply_to', ids)
      .eq('payload->>kind', ANSWER_KIND) // QF-20260709-800: exclude ping_on_silence rows
      .order('id')); // unique-key tiebreaker for stable pagination
    const out = new Map();
    for (const r of (data || [])) {
      const corr = r.payload && r.payload.reply_to;
      if (corr && !out.has(corr)) out.set(corr, r.payload);
    }
    return out;
  } catch { return new Map(); }
}

// Sentinel targets can never be meaningfully pinged (nobody-in-particular is
// listening on them) — mirrors lib/coordinator/dispatch.cjs SENTINEL_TARGETS,
// duplicated as a literal list here (not imported) to keep this module
// dependency-free of dispatch.cjs at module-load time; checkAndPingOverdueReplies
// lazy-requires dispatch.cjs only for its default `insert`.
const UNPINGABLE_TARGETS = new Set(['broadcast', 'broadcast-coordinator', 'broadcast-solomon']);

/**
 * The full PING-ON-SILENCE sweep: find this sender's own overdue reply-needed
 * rows, send exactly one ping per candidate (threaded via payload.reply_to,
 * itself reply_class='fire-and-forget'), and stamp payload.ping_sent_at on the
 * ORIGINAL row so it is never re-pinged on a later tick. DI'd `insert` (defaults
 * to lib/coordinator/dispatch.cjs insertCoordinationRow) so callers/tests can
 * inject a stub. Fail-open per-candidate: one failed ping/update never aborts
 * the rest of the sweep.
 * @returns {Promise<{checked:number, pinged:number, pingedIds:string[]}>}
 */
async function checkAndPingOverdueReplies(supabase, { sessionId, senderType = 'worker', insert, now } = {}) {
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const doInsert = typeof insert === 'function' ? insert : require('./dispatch.cjs').insertCoordinationRow;
  if (!supabase || !sessionId) return { checked: 0, pinged: 0, pingedIds: [] };

  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, subject, body, payload, created_at')
    .eq('sender_session', sessionId)
    .eq('payload->>reply_class', 'reply-needed')
    .is('payload->>ping_sent_at', null)
    .limit(200);
  if (error || !Array.isArray(rows) || rows.length === 0) return { checked: 0, pinged: 0, pingedIds: [] };

  const answered = await resolveAnsweredSet(supabase, rows.map((r) => r.payload && r.payload.correlation_id));
  const overdue = findOverdueReplyNeeded(rows, nowMs, answered);

  const pingedIds = [];
  for (const row of overdue) {
    const corr = row.payload.correlation_id;
    const target = row.target_session;
    if (!target || UNPINGABLE_TARGETS.has(target)) continue; // nobody-in-particular listens on a sentinel
    try {
      await doInsert(supabase, {
        sender_session: sessionId,
        sender_type: senderType,
        target_session: target,
        message_type: 'INFO',
        subject: `[PING_ON_SILENCE] ${(row.subject || row.payload.body || '').slice(0, 60)}`,
        body: `Reminder: no reply yet to "${(row.payload.body || row.body || '').slice(0, 200)}" (sent ${row.created_at || 'earlier'}).`,
        payload: { kind: 'ping_on_silence', reply_to: corr, correlation_id: corr, reply_class: 'fire-and-forget' },
      }, { select: 'id', single: true });
      await supabase
        .from('session_coordination')
        .update({ payload: { ...row.payload, ping_sent_at: new Date(nowMs).toISOString() } })
        .eq('id', row.id);
      pingedIds.push(row.id);
    } catch { /* fail-open per-candidate — one failure never aborts the rest of the sweep */ }
  }
  return { checked: rows.length, pinged: pingedIds.length, pingedIds };
}

/**
 * LATE-VERDICT RECONCILIATION — SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 (FR-3/FR-8/FR-9).
 *
 * The missing CONSUMER. A Solomon verdict was always correlatable (reply-correlation.cjs is
 * kind-agnostic and Solomon sets both reply_to and correlation_id), but the ONLY thing that ever
 * consumed that correlation for a pre-send consult was the in-process poll awaitCoordinatorReply —
 * and the emitting process has long exited by the time the verdict lands 135-600s later. So the
 * verdict arrived, correlated fine, and was dropped on the floor. This sweep is the inverse of
 * checkAndPingOverdueReplies: that one finds reply-needed rows with NO answer, this one finds
 * reply-needed rows WITH an answer that nobody consumed.
 *
 * FR-9 scoping — two traps deliberately NOT inherited from checkAndPingOverdueReplies:
 *   (a) NO `ping_sent_at IS NULL` filter. A consult that was already pinged can still be answered
 *       late; inheriting that filter would permanently orphan exactly the long-latency consults
 *       (p50 245-324s) this whole SD exists to rescue.
 *   (b) NO `sender_session` scoping. adam-quiet-tick.mjs inserts its consult WITHOUT sender_session,
 *       so a sender-scoped sweep is blind to that lane and would read green while silently covering
 *       only adam-advisory-originated consults.
 *
 * Single-fire via payload.late_verdict_reconciled_at (mirrors the ping_sent_at idiom) AND the
 * DB-enforced idempotency of recordDisposition — either alone would be a weaker guarantee, so both
 * are used. Per-candidate fail-open: one bad row never aborts the sweep.
 *
 * @param {object} supabase
 * @param {object} opts
 * @param {Function} opts.recordDisposition - async ({decisionType, subject, payload}) => {created}
 * @param {Function} [opts.detectVerdictDelta] - (verdict) => boolean  (FR-8)
 * @param {Function} [opts.captureNearMiss]    - async (nearMiss) => void (FR-8)
 * @param {number}   [opts.now]
 * @param {number}   [opts.limit=200]
 * @returns {Promise<{checked:number, reconciled:number, reconciledIds:string[], nearMisses:number}>}
 */
async function reconcileLateVerdicts(supabase, opts = {}) {
  const { recordDisposition, detectVerdictDelta, captureNearMiss, limit = 200 } = opts;
  const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
  const empty = { checked: 0, reconciled: 0, reconciledIds: [], nearMisses: 0 };
  if (!supabase || typeof recordDisposition !== 'function') return empty;

  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, subject, body, payload, created_at')
    .eq('payload->>kind', PAYLOAD_KINDS.SOLOMON_CONSULT)
    .eq('payload->>consult_purpose', 'pre_send')   // FR-2 structural discriminator, never body prose
    .is('payload->>late_verdict_reconciled_at', null) // single-fire; NOT ping_sent_at (FR-9a)
    .limit(limit);
  if (error || !Array.isArray(rows) || rows.length === 0) return empty;

  const answers = await resolveAnswerRows(supabase, rows.map((r) => r.payload && r.payload.correlation_id));
  if (answers.size === 0) return { ...empty, checked: rows.length };

  const reconciledIds = [];
  let nearMisses = 0;
  for (const row of rows) {
    const corr = row.payload && row.payload.correlation_id;
    if (!corr || !answers.has(corr)) continue;
    const answer = answers.get(corr);
    const verdict = (answer && (answer.body ?? answer.verdict)) ?? null;
    try {
      await recordDisposition({
        decisionType: 'consult_answer',
        subject: `solomon-consult:${corr}`,
        payload: { correlation_id: corr, consult_row_id: row.id, verdict, reconciled_at: new Date(nowMs).toISOString() },
      });

      // FR-8: near-miss detection previously ran ONLY on the synchronous verdict, so going
      // non-blocking would have silently killed the capability in production while the unit tests
      // (which call performBoundedConsult directly with a resolving consult) stayed green.
      if (typeof detectVerdictDelta === 'function' && typeof captureNearMiss === 'function') {
        try {
          if (detectVerdictDelta(verdict)) {
            await captureNearMiss({
              decisionType: 'pre_send_consult',
              title: row.subject || '',
              summary: 'Solomon verdict arrived AFTER the send and materially amended it (late verdict-delta near-miss)',
              verdict,
            });
            nearMisses += 1;
          }
        } catch { /* near-miss capture is best-effort and must never block reconciliation */ }
      }

      await supabase
        .from('session_coordination')
        .update({ payload: { ...row.payload, late_verdict_reconciled_at: new Date(nowMs).toISOString() } })
        .eq('id', row.id);
      reconciledIds.push(row.id);
    } catch { /* fail-open per-candidate; the row stays un-stamped so a later sweep retries it */ }
  }
  return { checked: rows.length, reconciled: reconciledIds.length, reconciledIds, nearMisses };
}

module.exports = {
  REPLY_CLASSES,
  DEFAULT_REPLY_WINDOW_MS,
  resolveAnswerRows,
  reconcileLateVerdicts,
  isValidReplyClass,
  computeReplyExpectedBy,
  findOverdueReplyNeeded,
  alreadyAnswered,
  resolveAnsweredSet,
  checkAndPingOverdueReplies,
};
