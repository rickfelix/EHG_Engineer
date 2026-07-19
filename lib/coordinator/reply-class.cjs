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
  const ids = Array.from(new Set((candidateCorrelationIds || []).filter(Boolean)));
  if (ids.length === 0) return new Set();
  try {
    // FR-6 (count-truncation discipline): the old .limit(1000) sat exactly on the PostgREST cap —
    // a busy window could silently drop answers and cause spurious pings. Paginate to completion;
    // fail-open empty-Set policy preserved (fetchAllPaginated throws → catch below).
    const _fap = await import('../db/fetch-all-paginated.mjs');
    const data = await _fap.fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, payload')
      .in('payload->>reply_to', ids)
      .eq('payload->>kind', ANSWER_KIND) // QF-20260709-800: exclude ping_on_silence rows
      .order('id')); // unique-key tiebreaker for stable pagination
    return new Set((data || []).map((r) => r.payload && r.payload.reply_to).filter(Boolean));
  } catch { return new Set(); }
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

module.exports = {
  REPLY_CLASSES,
  DEFAULT_REPLY_WINDOW_MS,
  isValidReplyClass,
  computeReplyExpectedBy,
  findOverdueReplyNeeded,
  alreadyAnswered,
  resolveAnsweredSet,
  checkAndPingOverdueReplies,
};
