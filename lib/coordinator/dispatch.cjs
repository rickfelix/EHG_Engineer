/**
 * Coordinator dispatch guard — SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001
 *
 * Centralizes coordinator-side session_coordination inserts behind one validated
 * path. REFUSES to insert a row unless target_session is either:
 *   - a documented sentinel (broadcast / broadcast-coordinator), OR
 *   - a full UUID that matches a LIVE row in claude_sessions.
 *
 * RCA (2026-06-07): a coordinator dispatched WORK_ASSIGNMENT rows addressed to
 * truncated 8-char session_id PREFIXES. Workers poll WHERE target_session=<full-uuid>,
 * so those rows never matched and dead-lettered — two workers polled fruitlessly for
 * 24+ min. This guard fails CLOSED on a bad target so the coordinator sees the error
 * instead of silently dead-lettering.
 *
 * CommonJS so both .cjs callers (require) and .mjs callers (createRequire) can consume it.
 *
 * @module lib/coordinator/dispatch
 */

// Single canonical full-UUID matcher (8-4-4-4-12). Do NOT hand-roll a second copy —
// the prefix-only isUuidLike in stale-session-sweep.cjs is for the cleanup path.
const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { PROTOCOL_COMMS_VERSION } = require('./protocol-comms-version.cjs');

// Documented non-UUID targets that are intentionally allowed. broadcast =
// coordinator→all; broadcast-coordinator = worker→coordinator; broadcast-solomon =
// worker/Adam→Solomon consult lane (SD-LEO-INFRA-SOLOMON-CONSULT-001C — inert until
// SOLOMON_CONSULT_V1); broadcast-adam = Solomon→Adam direct lane fallback
// (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B — inert until
// ADAM_SOLOMON_TWOWAY_V1), symmetric with broadcast-solomon so a transiently-unresolvable
// Adam never throws DISPATCH_TARGET_INVALID on the reverse leg. Sentinels short-circuit
// the live-session lookup (not a single row).
const SENTINEL_TARGETS = Object.freeze(['broadcast', 'broadcast-coordinator', 'broadcast-solomon', 'broadcast-adam']);
const SENTINEL_SET = new Set(SENTINEL_TARGETS);

/** Pure: true iff s is a full 8-4-4-4-12 hex UUID. */
function isFullUuid(s) {
  return typeof s === 'string' && FULL_UUID_RE.test(s);
}

/** Pure: true iff target is a documented sentinel. */
function isSentinelTarget(s) {
  return SENTINEL_SET.has(s);
}

/**
 * Validate a dispatch target. Resolves when the target is dispatchable; throws a
 * tagged Error (code on err.code) otherwise. Validation order:
 *   sentinel allowlist (short-circuit) -> full-UUID shape -> live claude_sessions row.
 *
 * @param {object} supabase - Supabase client (only queried for non-sentinel UUIDs)
 * @param {string} target - target_session value
 * @param {object} [logger=console]
 * @returns {Promise<{ok:true, kind:'sentinel'|'live_session'}>}
 */
async function assertValidTarget(supabase, target, logger = console) {
  if (isSentinelTarget(target)) {
    return { ok: true, kind: 'sentinel' };
  }
  if (!isFullUuid(target)) {
    const msg = `[dispatch] REFUSED insert: target_session ${JSON.stringify(target)} is not a full UUID `
      + `(expected 8-4-4-4-12 hex, e.g. 0f8d45d8-9531-4ab8-a1b9-6961c405e1ec) and not a sentinel `
      + `(${SENTINEL_TARGETS.join(', ')}). Truncated/prefix targets dead-letter — workers poll on the full UUID.`;
    logger && logger.error && logger.error(msg);
    const e = new Error(msg);
    e.code = 'DISPATCH_TARGET_INVALID';
    throw e;
  }
  // Well-formed UUID — confirm it names a live session (FR-3, the dominant new check).
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id')
    .eq('session_id', target)
    .limit(1)
    .maybeSingle();
  if (error) {
    const e = new Error(`[dispatch] live-session lookup failed for ${target}: ${error.message}`);
    e.code = 'DISPATCH_LOOKUP_FAILED';
    throw e; // fail closed — do not insert on an unverifiable target
  }
  if (!data) {
    const msg = `[dispatch] REFUSED insert: target_session ${target} matches no claude_sessions row `
      + `(unknown/dead target) — would dead-letter. Re-target to a live worker UUID or a sentinel.`;
    logger && logger.error && logger.error(msg);
    const e = new Error(msg);
    e.code = 'DISPATCH_TARGET_UNKNOWN';
    throw e;
  }
  return { ok: true, kind: 'live_session' };
}

// SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: terminal statuses that must NEVER be dispatched. These
// mirror the claim_sd RPC's terminal guard (SD-LEO-FIX-CLAIM-RPC-TERMINAL-001) so the dispatch side
// and the claim side never disagree: claim_sd already REFUSES a terminal SD/QF, so a coordinator that
// dispatches one only creates a WORK_ASSIGNMENT the worker's claim_sd will bounce ('sd_terminal_status')
// — a wasted dispatch + a confusing worker error. Refusing at the dispatch choke point closes that gap.
const TERMINAL_SD_STATUSES = Object.freeze(new Set(['completed', 'cancelled', 'deferred']));
const TERMINAL_QF_STATUSES = Object.freeze(new Set(['completed', 'cancelled', 'escalated']));

/** Pure: is an SD status terminal (un-dispatchable)? */
function isTerminalSdStatus(status) {
  return TERMINAL_SD_STATUSES.has(String(status || '').toLowerCase());
}
/** Pure: is a quick-fix status terminal (un-dispatchable)? 'escalated' is a one-way promotion. */
function isTerminalQfStatus(status) {
  return TERMINAL_QF_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: refuse to dispatch a WORK_ASSIGNMENT for a SD/QF whose
 * lifecycle has already ended. Only applies to WORK_ASSIGNMENT rows that name an assigned SD/QF.
 * Mirrors claim_sd:
 *   - terminal status (completed/cancelled/deferred; QF: completed/cancelled/escalated) -> REFUSE (closed).
 *   - non-existent SD/QF -> REFUSE (closed; mirrors claim_sd sd_not_found).
 *   - a transient DB lookup error -> FAIL-OPEN (allow + log; claim_sd remains the backstop) so a
 *     momentary hiccup never wedges all coordinator dispatch.
 * @private
 * @throws {Error} err.code DISPATCH_SD_TERMINAL | DISPATCH_SD_NOT_FOUND
 */
async function assertSdDispatchable(supabase, row, logger = console) {
  if (!row || row.message_type !== 'WORK_ASSIGNMENT') return;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  // Resolve the named SD from EVERY key real producers actually emit:
  //   row.target_sd (top-level)  — stale-session-sweep + coordinator-cold-recovery
  //   payload.sd_key             — coordinator-cold-recovery resume payload
  //   payload.current_sd         — stale-session-sweep payload
  //   payload.assigned_sd        — explicit assignment payloads
  // (Omitting payload.current_sd was the gap that let the sweep's nudge slip past the guard.)
  const sdKey = row.target_sd || payload.sd_key || payload.current_sd || payload.assigned_sd || null;
  if (!sdKey) return; // a WORK_ASSIGNMENT with no named SD (e.g. a generic nudge) — nothing to check
  const isQf = /^QF-/.test(sdKey);
  let status, found, metadata;
  try {
    if (isQf) {
      const { data, error } = await supabase.from('quick_fixes').select('status').eq('id', sdKey).maybeSingle();
      if (error) throw error;
      found = !!data; status = data && data.status;
    } else {
      // SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001: also fetch metadata so the review-hold check
      // below runs in the SAME lookup (no extra query path).
      const { data, error } = await supabase.from('strategic_directives_v2').select('status, metadata').eq('sd_key', sdKey).maybeSingle();
      if (error) throw error;
      found = !!data; status = data && data.status; metadata = data && data.metadata;
    }
  } catch (e) {
    // FAIL-OPEN on a transient lookup error: do not wedge dispatch; claim_sd still guards at claim time.
    logger && logger.warn && logger.warn(`[dispatch] SD-dispatchable check skipped for ${sdKey} (lookup error, fail-open): ${e.message}`);
    return;
  }
  if (!found) {
    const e = new Error(`[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} does not exist — refusing to dispatch a phantom id (mirrors claim_sd sd_not_found).`);
    e.code = 'DISPATCH_SD_NOT_FOUND';
    logger && logger.error && logger.error(e.message);
    throw e;
  }
  const terminal = isQf ? isTerminalQfStatus(status) : isTerminalSdStatus(status);
  if (terminal) {
    const e = new Error(`[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} is in terminal status '${status}' — refusing to dispatch a finished/cancelled SD (claim_sd would reject it as sd_terminal_status).`);
    e.code = 'DISPATCH_SD_TERMINAL';
    logger && logger.error && logger.error(e.message);
    throw e;
  }
  // SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001 (FR-2): the directed-dispatch path does NOT route
  // through classifyDispatchIneligibility (only terminal + tier), so it would otherwise BYPASS the
  // needs_coordinator_review hold and defeat the SD. Mirror the self-claim classifier axis here: a
  // review-pending SD is REFUSED (fail-CLOSED) until the coordinator clears the flag. Strict === true so a
  // false/absent flag dispatches normally; a transient lookup error already failed OPEN above.
  if (!isQf && metadata && metadata.needs_coordinator_review === true) {
    const e = new Error(`[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} is review-pending (metadata.needs_coordinator_review) — the coordinator must review + clear the flag before dispatch (the clear IS the authorization).`);
    e.code = 'DISPATCH_SD_REVIEW_PENDING';
    logger && logger.error && logger.error(e.message);
    throw e;
  }
}

/**
 * SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-5): stamp an ADVISORY
 * payload.effort_recommendation on WORK_ASSIGNMENT rows at this choke point —
 * every coordinator dispatch routes through insertCoordinationRow, so stamping
 * here covers all builders without touching each call site. QFs and tightly
 * specified SDs → 'medium'; multi-FR/ambiguous/architecture → 'xhigh'
 * (measured basis: SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001). Fail-soft: any
 * lookup/classify error leaves the row unchanged. Nothing gates on the field.
 * @private
 */
async function stampEffortRecommendation(supabase, row, logger = console) {
  try {
    if (row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (payload.effort_recommendation) return; // caller already decided
    const sdKey = payload.assigned_sd || payload.sd_key || row.target_sd || null;
    if (!sdKey) return;

    const { recommendEffort } = require('../fleet/effort-recommendation.cjs');
    let rec;
    if (/^QF-/.test(sdKey)) {
      rec = recommendEffort({ kind: 'qf', title: sdKey });
    } else {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type, title, description, metadata')
        .eq('sd_key', sdKey)
        .maybeSingle();
      if (!sd) return;
      const frs = sd.metadata?.functional_requirements || sd.metadata?.adam_authoring?.functional_requirements;
      rec = recommendEffort({
        kind: 'sd',
        sd_type: sd.sd_type,
        title: sd.title,
        description: sd.description,
        fr_count: Array.isArray(frs) ? frs.length : undefined,
      });
    }
    row.payload = { ...payload, effort_recommendation: rec.effort, effort_recommendation_reason: rec.reason };
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] effort recommendation skipped: ${e.message}`);
  }
}

/**
 * SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-4): enforce WORK-DOWN-NEVER-UP on the
 * directed-dispatch path. A WORK_ASSIGNMENT naming an SD whose stamped metadata.min_tier_rank exceeds
 * the TARGET worker's tier_rank (claude_sessions.metadata.tier_rank) is REFUSED (throws, fail-CLOSED,
 * code DISPATCH_ABOVE_WORKER_TIER). A higher-rung worker assigned below its rung is allowed. Gated by
 * the FR-5 degrade-to-1 invariant — with < 2 live workers, tiering is OFF and nothing is refused.
 *
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): this is the SECOND independent tier-enforcement
 * site (the self-claim/pull path is lib/fleet/claim-eligibility.cjs classifyDispatchIneligibility) —
 * risk-agent flagged that shipping the backlog-reservation gate only in the self-claim path would let
 * a worker correctly reserved-and-idle there still receive a directed WORK_ASSIGNMENT for the SAME
 * lower-tier work. So a downward assignment (minRank < workerRank) is ALSO refused (fail-CLOSED, code
 * DISPATCH_RESERVED_NO_LOWER_BACKLOG) unless that lower tier is genuinely backlogged. Uses the SAME
 * fetchLowerTierBacklogData/lowerTierBacklog helpers as the self-claim path (never a second
 * re-derivation) — an assignment AT the worker's own rung is always allowed, unaffected.
 *
 * Fail-OPEN on any lookup/QF/sentinel-target/backlog-data-fetch fault so a transient fault never
 * blocks a real dispatch; fail-CLOSED only once a violation is CONFIRMED against live data.
 * @private
 */
async function assertWorkerTierAllowed(supabase, row, logger = console) {
  try {
    if (!row || row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sdKey = payload.assigned_sd || payload.sd_key || row.target_sd || null;
    if (!sdKey || /^QF-/.test(sdKey)) return; // QFs and SD-less nudges are not tier-gated
    const { isTieringActive, resolveWorkerTierRank } = require('../fleet/tier-ladder.cjs');
    if (!(await isTieringActive(supabase))) return; // FR-5: tiering off with < 2 live workers
    const { data: sess } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', row.target_session)
      .maybeSingle();
    if (!sess) return; // sentinel/unknown target -> fail-open (assertValidTarget already vetted real ones)
    const workerRank = resolveWorkerTierRank(sess);
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .maybeSingle();
    const minRank = Number(sd && sd.metadata && sd.metadata.min_tier_rank);
    if (!Number.isFinite(minRank)) return; // unscored SD -> don't block dispatch
    if (minRank > workerRank) {
      const e = new Error(
        `[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} requires tier_rank ${minRank} but target worker is tier_rank ${workerRank} `
        + `(WORK-DOWN-NEVER-UP — a lower-rung worker never takes above-rung work; assign it to an equal/higher rung).`
      );
      e.code = 'DISPATCH_ABOVE_WORKER_TIER';
      throw e;
    }
    if (minRank < workerRank) {
      const { lowerTierBacklog, fetchLowerTierBacklogData } = require('../fleet/tier-backlog.cjs');
      const backlogData = await fetchLowerTierBacklogData(supabase);
      // No backlog data -> fail-open (byte-identical WORK-DOWN-ALWAYS); backlog data present but
      // lowerTierBacklog returns false -> CONFIRMED reserved, refuse.
      if (backlogData && !lowerTierBacklog(minRank, backlogData)) {
        const e = new Error(
          `[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} (tier_rank ${minRank}) has no backlog at/below that `
          + `tier — target worker (tier_rank ${workerRank}) would be reserving capability on ungenuine cheap `
          + `work; assign it to an at-or-below-rung worker instead, or wait for a genuine backlog.`
        );
        e.code = 'DISPATCH_RESERVED_NO_LOWER_BACKLOG';
        throw e;
      }
    }
  } catch (e) {
    if (e && (e.code === 'DISPATCH_ABOVE_WORKER_TIER' || e.code === 'DISPATCH_RESERVED_NO_LOWER_BACKLOG')) throw e; // fail CLOSED on a confirmed violation
    logger && logger.warn && logger.warn(`[dispatch] worker-tier check skipped (fail-open): ${e.message}`);
  }
}

/**
 * Validated session_coordination insert. The INTENDED choke point coordinator-side
 * inserts route through — though some producers (notably the stale-session-sweep cron)
 * still insert raw and therefore call assertSdDispatchable directly. Validates
 * row.target_session, refuses terminal/non-existent targets, then performs the insert.
 *
 * @param {object} supabase - Supabase client
 * @param {object} row - session_coordination row (must include target_session)
 * @param {object} [opts]
 * @param {object} [opts.logger=console]
 * @param {string} [opts.select] - optional columns to .select() after insert (e.g. 'id')
 * @param {boolean} [opts.single] - if true with select, append .single()
 * @param {string} [opts.topicId] - SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-4): when present,
 *   stamped into row.payload.topic_id before the insert so multi-party threads can be grouped later via
 *   getThreadByTopicId. Merges into any existing payload (never clobbers other payload keys). Omitting
 *   opts.topicId leaves row.payload byte-identical to before — fully backward-compatible.
 * @returns {Promise<{data:any,error:any}>} the Supabase insert result
 * @throws {Error} with err.code DISPATCH_TARGET_INVALID|DISPATCH_TARGET_UNKNOWN|DISPATCH_LOOKUP_FAILED on refusal
 */
async function insertCoordinationRow(supabase, row, opts = {}) {
  const { logger = console, select = null, single = false, topicId = null } = opts;
  if (!row || typeof row !== 'object') {
    const e = new Error('[dispatch] row must be an object');
    e.code = 'DISPATCH_BAD_ROW';
    throw e;
  }
  if (topicId) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    row.payload = { ...payload, topic_id: topicId };
  }
  await assertValidTarget(supabase, row.target_session, logger);
  // SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: refuse to dispatch a terminal/non-existent SD before the
  // insert (mirrors claim_sd's terminal guard — fails CLOSED on terminal/not-found, open on a DB hiccup).
  await assertSdDispatchable(supabase, row, logger);
  // SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-4): the SECOND tier enforcement point —
  // directed dispatch BYPASSES claim-eligibility by design, so WORK-DOWN-NEVER-UP also lives here.
  await assertWorkerTierAllowed(supabase, row, logger);
  await stampEffortRecommendation(supabase, row, logger);
  // FR-2 (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C): stamp the protocol version on every row
  // through the choke point so a stale long-lived-singleton reader can detect a skew instead of
  // silently misreading it. Only stamps INTO an existing payload object — never invents one (some
  // rows are payload-less by design) — and never overwrites a caller-supplied stamp.
  if (row.payload && typeof row.payload === 'object' && row.payload.protocol_comms_version == null) {
    row.payload = { ...row.payload, protocol_comms_version: PROTOCOL_COMMS_VERSION };
  }
  // R1 (QF-20260703-964, THREE-WAY-COMMS FR-3 lint v2): warn (never block) when a written
  // "[SENDER -> RECIPIENT]" body header disagrees with the resolved payload.addressee — the
  // crew-comms audit's addressee-vs-target divergence gauge. ONE choke point for every writer
  // (Adam, Solomon, coordinator, workers) instead of a parallel check per file. Opt-in: only
  // fires when the writer stamped payload.addressee AND body has a bracket header — silently
  // inert for every row that doesn't carry an addressee yet.
  if (row.body && row.payload && row.payload.addressee) {
    const bracket = /^\[([^\]]+)\]/.exec(row.body);
    const arrowParts = bracket ? bracket[1].split('->') : null;
    if (arrowParts && arrowParts.length === 2) {
      const written = arrowParts[1].trim().toLowerCase();
      const resolved = String(row.payload.addressee).toLowerCase();
      if (written && !written.includes(resolved) && !resolved.includes(written)) {
        const warn = (logger && logger.warn) || console.warn;
        warn(`[dispatch] ADDRESSEE MISMATCH: body header says "-> ${arrowParts[1].trim()}" but payload.addressee is "${row.payload.addressee}".`);
      }
    }
  }
  let q = supabase.from('session_coordination').insert(row);
  if (select) {
    q = q.select(select);
    if (single) q = q.single();
  }
  return await q;
}

/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-4): fetch a whole multi-party thread by its
 * topic_id (stamped via insertCoordinationRow's opts.topicId), ordered oldest-first so callers can
 * replay the conversation in send order. Uses .eq() on the JSONB ->> text-extraction path
 * ('payload->>topic_id') — the same syntax already used throughout lib/coordinator (e.g.
 * adam-advisory-store.cjs, relay-drop-gauge.cjs, reply-class.cjs) to filter on a JSONB field; supabase-js
 * passes the column string straight through to PostgREST, so ->> works with .eq() same as .filter().
 *
 * @param {object} supabase - Supabase client
 * @param {string} topicId
 * @returns {Promise<{data:any[],error:any}>}
 */
async function getThreadByTopicId(supabase, topicId) {
  return await supabase
    .from('session_coordination')
    .select('*')
    .eq('payload->>topic_id', topicId)
    .order('created_at');
}

/**
 * Thin convenience wrapper for coordinator→worker dispatch. Same guarantees as
 * insertCoordinationRow; exists so call sites read intentionally.
 */
async function dispatchToWorker(supabase, row, opts = {}) {
  return insertCoordinationRow(supabase, row, opts);
}

module.exports = {
  FULL_UUID_RE,
  SENTINEL_TARGETS,
  isFullUuid,
  isSentinelTarget,
  assertValidTarget,
  insertCoordinationRow,
  getThreadByTopicId,
  dispatchToWorker,
  stampEffortRecommendation,
  isTerminalSdStatus,
  isTerminalQfStatus,
  assertSdDispatchable,
  assertWorkerTierAllowed,
};
