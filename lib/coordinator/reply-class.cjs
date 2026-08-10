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

// How far back reconcileLateVerdicts will look for candidates. Bounds an UNREAPED table so an
// oldest-first window can never wedge on permanently-unanswerable rows (see the query for the full
// argument). 24h against a measured p95 verdict latency of 600s is ~144x headroom.
const RECONCILE_HORIZON_MS = 24 * 60 * 60_000; // 24h

// QF-20260709-800: alreadyAnswered/resolveAnsweredSet must only count a GENUINE
// answer row (adam_advisory/oracle lane), not a ping_on_silence reminder — a
// ping row also carries payload.reply_to (it threads back to the original
// consult), so without this exclusion a pinged-but-never-answered consult
// falsely dedups as "already answered" and the real answer never gets sent.
const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');
// QF-20260808-447: adopt the canonical dual-read instead of hand-rolling a 36th variant.
// lane-contract.cjs has no requires of its own, so this cannot introduce a cycle.
const { readCanonicalBody } = require('../coordination/lane-contract.cjs');
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
 *
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C (FR-2/FR-3): the guard is now
 * DISCRIMINATOR-AWARE so a correction can travel the path its original travelled.
 * Before this, the original answer permanently self-blocked every later message on
 * its correlation — a SAFETY retraction could not be posted in the thread where the
 * error lived, and ordered multi-part replies had to mint a fresh correlation_id to
 * survive dedup (see lib/coordinator/multi-part-reply.cjs).
 *
 * THE GUARD NARROWS — IT NEVER WIDENS. Two rules make that literal:
 *   1. `opts` is optional and each clause is STRICTLY CONDITIONAL. Calling
 *      alreadyAnswered(sb, corr) is byte-identical to the pre-change query: same two
 *      .eq() calls, same .limit(1). An absent discriminator must NEVER drop a clause
 *      (that would widen "already answered with kind=adam_advisory" into "answered
 *      with anything"), and it must never ADD one either — the existing fixed-depth
 *      test mocks chain exactly two .eq() before .limit(), and an unconditional third
 *      would throw there.
 *   2. Supplying a discriminator only ever ADDS a filter, so the matched set shrinks.
 *      A retraction is not blocked by the plain answer it retracts (that row carries no
 *      message_kind), while a SECOND retraction on the same correlation still is.
 *
 * @param {object} supabase
 * @param {string} correlationId
 * @param {{messageKind?: string, partIndex?: number|string}} [opts]
 *   messageKind — payload.message_kind sub-discriminator (e.g. 'retraction').
 *   partIndex   — payload.part_index of an ordered multi-part reply, so part 2 is not
 *                 deduped against part 1 while a duplicate part 1 still is.
 */
async function alreadyAnswered(supabase, correlationId, opts) {
  if (!correlationId) return false;
  try {
    let q = supabase
      .from('session_coordination')
      .select('id')
      .eq('payload->>reply_to', correlationId)
      .eq('payload->>kind', ANSWER_KIND); // QF-20260709-800: exclude ping_on_silence rows

    // Strictly conditional — see rule 1 above. Null/undefined means "no discriminator
    // supplied", which must reproduce the legacy query exactly.
    const messageKind = opts == null ? null : opts.messageKind;
    if (messageKind != null) q = q.eq('payload->>message_kind', String(messageKind));
    const partIndex = opts == null ? null : opts.partIndex;
    if (partIndex != null) q = q.eq('payload->>part_index', String(partIndex));

    const { data, error } = await q.limit(1);
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
async function resolveAnswerRows(supabase, candidateCorrelationIds, stats) {
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
      // The dedup below is first-wins per correlation_id, so this ORDER decides WHICH answer is
      // treated as the verdict. id alone is a random UUID, making that pick arbitrary; created_at
      // makes it the EARLIEST answer, with id kept as the unique tiebreaker for stable pagination.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
    const out = new Map();
    for (const r of (data || [])) {
      const corr = r.payload && r.payload.reply_to;
      if (corr && !out.has(corr)) out.set(corr, r.payload);
    }
    return out;
  } catch (err) {
    // C1: fail-open stays (a transient answer-query fault must never cause a ping-storm, and the
    // reconciler's rows stay un-stamped so the next sweep retries). But it is no longer SILENT.
    // Without this, a failed answer query and a genuinely quiet lane return byte-identical
    // {checked:N, reconciled:0, errors:0} and the cron logs ok:true while completely blind — the
    // same read-side conflation as SEC-1's write-side one. Optional out-param so the ping path
    // (resolveAnsweredSet) is entirely unaffected: callers that pass nothing get the old behaviour.
    if (stats && typeof stats === 'object') {
      stats.queryFailed = true;
      stats.errorCode = String((err && (err.code || err.name)) || 'unknown').slice(0, 64);
    }
    return new Map();
  }
}

// Sentinel targets can never be meaningfully pinged (nobody-in-particular is
// listening on them) — mirrors lib/coordinator/dispatch.cjs SENTINEL_TARGETS,
// duplicated as a literal list here (not imported) to keep this module
// dependency-free of dispatch.cjs at module-load time; checkAndPingOverdueReplies
// lazy-requires dispatch.cjs only for its default `insert`.
const UNPINGABLE_TARGETS = new Set(['broadcast', 'broadcast-coordinator', 'broadcast-solomon']);

/**
 * SD-LEO-INFRA-ALARM-HONESTY-001 (FR-1): is this row a pre-send CC — a copy-for-information
 * whose RECIPIENT owes no reply (the reply is owed by the row's ADDRESSEE, named only in the
 * body prose)? READER: checkAndPingOverdueReplies below (ping_on_silence must not dun the
 * CC recipient) and scripts/solomon-advisory.cjs inbox ordering (imports this — one
 * representation, never a re-derived copy).
 *
 * ABSENT consult_purpose means GENUINE, deliberately (solomon-advisory precedent): only the
 * literal 'pre_send' exempts a row. Matching the '[PRE-SEND CONSULT]' body prefix instead is
 * REJECTED — body text is prose, not contract (see the :308 precedent note). Measured basis:
 * 2026-08-10, four ping_on_silence duns to Solomon in one seat (two post-acknowledgment) for
 * Adam's pre-send CC rows carrying inherited reply_class='reply-needed'.
 */
function isPreSendCc(row) {
  return (row && row.payload && row.payload.consult_purpose) === 'pre_send';
}

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
  // FR-1 (SD-LEO-INFRA-ALARM-HONESTY-001): exclude pre-send CCs AFTER the pure overdue
  // classification — a JS post-filter, deliberately NOT a PostgREST `not.eq` clause on the
  // sweep query: SQL three-valued logic makes NOT(NULL = 'pre_send') evaluate NULL, which
  // EXCLUDES every genuine consult (absent key) — the exact inversion this predicate must
  // never commit. findOverdueReplyNeeded stays untouched so its second consumer
  // (lib/escalation/inbox-sla.js) keeps its current behavior; the equivalent SLA-flagging
  // false-alarm there is an explicitly-deferred follow-up, not silent scope.
  const overdue = findOverdueReplyNeeded(rows, nowMs, answered).filter((r) => !isPreSendCc(r));

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
        // QF-20260808-447: subject-first is deliberate and PRESERVED; only the fallback
        // changes. Was `row.payload.body`, which (a) missed a row whose prose lives in the
        // TOP-LEVEL body column and (b) THREW outright when payload was null. The body line
        // below was already a correct dual-read by hand — routed through the same helper so
        // there is one representation of this rule rather than two that can drift apart.
        subject: `[PING_ON_SILENCE] ${(row.subject || readCanonicalBody(row)).slice(0, 60)}`,
        body: `Reminder: no reply yet to "${readCanonicalBody(row).slice(0, 200)}" (sent ${row.created_at || 'earlier'}).`,
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
 * @returns {Promise<{checked:number, reconciled:number, reconciledIds:string[], nearMisses:number,
 *   alreadyDispositioned:number, errors:number, firstError:string|null, firstErrorCode:string|null,
 *   saturated:boolean}>}
 *   `errors` exists so a lane FAILING on every write is distinguishable from a merely quiet one —
 *   conflating the two is what hid SEC-1.
 *   LOG `firstErrorCode`, NEVER `firstError`. The raw driver message can carry the failing row's
 *   JSONB (Postgres "Failing row contains (...)"), i.e. the consult body, and the cron host's log is
 *   world-readable. `firstError` is for in-process debugging only.
 *   `saturated` (checked === limit) is the leading indicator that the recency window is full and
 *   candidates may be aging out un-reconciled.
 */
async function reconcileLateVerdicts(supabase, opts = {}) {
  const { recordDisposition, detectVerdictDelta, captureNearMiss, limit = 200 } = opts;
  const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
  // SEC-14: the counters MUST be present on the early-return shape too. 54.8% of consults are never
  // answered, so the no-answers path IS the steady state — and JSON.stringify drops undefined keys,
  // so omitting them here meant write_errors was simply absent from most real log lines. A missing
  // field vs a zero field is exactly the ambiguity these counters were added to remove.
  const empty = { checked: 0, reconciled: 0, reconciledIds: [], nearMisses: 0, alreadyDispositioned: 0, errors: 0, firstError: null, firstErrorCode: null, saturated: false, answerQueryFailed: false };
  if (!supabase || typeof recordDisposition !== 'function') return empty;

  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, subject, body, payload, created_at')
    .eq('payload->>kind', PAYLOAD_KINDS.SOLOMON_CONSULT)
    .eq('payload->>consult_purpose', 'pre_send')   // FR-2 structural discriminator, never body prose
    .is('payload->>late_verdict_reconciled_at', null) // single-fire; NOT ping_sent_at (FR-9a)
    // HORIZON, and it is what makes the ordering below safe. Only ANSWERED rows ever get stamped,
    // so unanswered ones accumulate forever — session_coordination has no reaper (MEASURED
    // 2026-07-25: 4670 rows, 3379 already past expires_at and still present). A pure oldest-first
    // window over that backlog is a TERMINAL state: once the oldest `limit` candidates are all
    // permanently unanswerable, the window stops advancing and the sweep goes blind for good —
    // strictly worse than the arbitrary slice it replaced, which at least kept sampling new rows.
    // Bounding by recency keeps the window moving. A verdict older than this is not actionable
    // anyway: measured latency is p95 600s, so a day is ~144x the slowest real reply.
    .gte('created_at', new Date(nowMs - RECONCILE_HORIZON_MS).toISOString())
    // OLDEST-FIRST within that horizon: drain the most-likely-to-expire candidates first, with id
    // as the unique tiebreaker for a stable slice.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(rows) || rows.length === 0) return empty;

  const answerStats = {};
  const answers = await resolveAnswerRows(supabase, rows.map((r) => r.payload && r.payload.correlation_id), answerStats);
  // "no answers" and "could not READ the answers" are different states and must not log alike.
  if (answers.size === 0) {
    return {
      ...empty,
      checked: rows.length,
      answerQueryFailed: answerStats.queryFailed === true,
      firstErrorCode: answerStats.errorCode ?? null,
    };
  }

  const reconciledIds = [];
  let nearMisses = 0;
  let alreadyDispositioned = 0;
  // FAILURE VISIBILITY. The per-candidate catch below is what concealed SEC-1: a write that threw
  // on EVERY row still returned {reconciled:0}, which the cron reports as a healthy quiet lane.
  // Fixing the bug without fixing the concealment would leave the next one just as invisible, so
  // errors are now counted and the first message is carried out for the caller to log.
  let errors = 0;
  let firstError = null;
  let firstErrorCode = null;
  for (const row of rows) {
    const corr = row.payload && row.payload.correlation_id;
    if (!corr || !answers.has(corr)) continue;
    const answer = answers.get(corr);
    const verdict = (answer && (answer.body ?? answer.verdict)) ?? null;

    // The subject MUST be an object (computeQuestionKey throws on a string) and is keyed PER CONSULT
    // EVENT via consult_row_id.
    //
    // An earlier revision keyed on question_text alone, mirroring the canonical binder
    // (scripts/consult-answer-bind.mjs). That was wrong HERE, and wrong in the SD's own signature
    // way: two distinct pre-send consults sharing question text collapsed onto one question_key, so
    // the second verdict was stamped reconciled while only the FIRST was ever persisted — a verdict
    // silently not delivered to its consumer, which is precisely the defect this SD exists to fix.
    // It was reachable, not theoretical: presend-consult-lane.cjs hardcodes the row subject to the
    // constant '[SOLOMON_CONSULT] pre-send' and never passes sd_key, so for a body-less consult
    // EVERY discriminator in that subject was identical across rows.
    //
    // Deliberate departure from the binder: it dedups a re-ASKED question across sessions because it
    // guards one blocked state. Here each consult is a distinct send decision carrying its own
    // verdict, so per-event is the correct granularity. consult_row_id is the durable PK of the
    // consult row — it does NOT rotate per session, so this does not reintroduce the correlation_id
    // /message_id anti-pattern disposition.js warns about. Re-running the sweep over the same row
    // recomputes the same key, so retries still dedup, which is the idempotency that actually
    // matters for a cron.
    const questionText = (row.payload && row.payload.body) || row.body || null;
    try {
      const res = await recordDisposition({
        decisionType: 'consult_answer',
        subject: {
          consult_purpose: 'pre_send',
          consult_row_id: row.id,
          sd_key: (row.payload && row.payload.sd_key) || null,
          question_text: questionText,
        },
        payload: { correlation_id: corr, consult_row_id: row.id, verdict, reconciled_at: new Date(nowMs).toISOString() },
      });
      // created===false means "this exact row was already dispositioned by an earlier sweep", so
      // stamping is correct and idempotent. What this counter measures is RE-SWEEP CHURN — the cron
      // racing the in-session host, or a stamp erased by the SEC-4 payload clobber. It is NOT a
      // collapse detector: with the row PK in the key, a non-discriminating key is impossible by
      // construction. Expect it to run routinely nonzero until the SEC-4 merge RPC lands.
      if (res && res.created === false) alreadyDispositioned += 1;

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
    } catch (err) {
      // Still fail-open per-candidate (the row stays un-stamped and a later sweep retries it), but
      // no longer SILENT — a swallowed error is now countable and reportable.
      errors += 1;
      // SEC-13: the CODE is what callers may log; the raw message is NOT. recordDisposition
      // rethrows the driver message verbatim, and a Postgres constraint violation embeds
      // "Failing row contains (...)" with the row's JSONB — i.e. the consult body — which on the
      // GHA host would land in a world-readable log. Truncating to 200 chars bounds LENGTH, not
      // CONTENT, and in fact truncates mid-body. The message stays available in the returned
      // summary for in-process debugging; only the code is safe to print.
      if (!firstError) {
        firstError = String((err && err.message) || err).slice(0, 200);
        firstErrorCode = String((err && (err.code || err.name)) || 'unknown').slice(0, 64);
      }
    }
  }
  return {
    checked: rows.length,
    reconciled: reconciledIds.length,
    reconciledIds,
    nearMisses,
    alreadyDispositioned,
    errors,
    firstError,
    firstErrorCode,
    // Zero-cost saturation signal: no extra query, just window-size vs candidates returned. A full
    // window is the leading indicator that older candidates may be aging past the recency horizon
    // un-reconciled — the one loss mode deliberately left unfixed (SEC-15).
    saturated: rows.length >= limit,
  };
}

module.exports = {
  REPLY_CLASSES,
  DEFAULT_REPLY_WINDOW_MS,
  resolveAnswerRows,
  reconcileLateVerdicts,
  isValidReplyClass,
  computeReplyExpectedBy,
  findOverdueReplyNeeded,
  isPreSendCc,
  alreadyAnswered,
  resolveAnsweredSet,
  checkAndPingOverdueReplies,
};
