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

// Documented non-UUID targets that are intentionally allowed. broadcast =
// coordinator→all; broadcast-coordinator = worker→coordinator. Sentinels
// short-circuit the live-session lookup (they are not a single session row).
const SENTINEL_TARGETS = Object.freeze(['broadcast', 'broadcast-coordinator']);
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

/**
 * Validated session_coordination insert. The single code path coordinator-side
 * inserts route through. Validates row.target_session, then performs the insert.
 *
 * @param {object} supabase - Supabase client
 * @param {object} row - session_coordination row (must include target_session)
 * @param {object} [opts]
 * @param {object} [opts.logger=console]
 * @param {string} [opts.select] - optional columns to .select() after insert (e.g. 'id')
 * @param {boolean} [opts.single] - if true with select, append .single()
 * @returns {Promise<{data:any,error:any}>} the Supabase insert result
 * @throws {Error} with err.code DISPATCH_TARGET_INVALID|DISPATCH_TARGET_UNKNOWN|DISPATCH_LOOKUP_FAILED on refusal
 */
async function insertCoordinationRow(supabase, row, opts = {}) {
  const { logger = console, select = null, single = false } = opts;
  if (!row || typeof row !== 'object') {
    const e = new Error('[dispatch] row must be an object');
    e.code = 'DISPATCH_BAD_ROW';
    throw e;
  }
  await assertValidTarget(supabase, row.target_session, logger);
  let q = supabase.from('session_coordination').insert(row);
  if (select) {
    q = q.select(select);
    if (single) q = q.single();
  }
  return await q;
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
  dispatchToWorker,
};
