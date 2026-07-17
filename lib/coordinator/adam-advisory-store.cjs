/**
 * Shared read/ack helpers for the Adam advisory lane.
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 (FR-2 + FR-5 shared selector — Q8 scope
 * reduction: one place defines "an unactioned advisory" so the read-only peek and the
 * ack verb cannot drift apart).
 *
 * An adam_advisory is RETIRED only by payload.actioned_at (the two-stage ACK, mirroring
 * lib/coordinator/adam-action-ack.cjs). read_at is DELIVERED (the coordinator saw it on a
 * render), NOT actioned. Pure-ish IO helpers — fail-soft for the display path, explicit
 * error returns for the mutate path. CommonJS so both .cjs verbs can require() it.
 *
 * @module lib/coordinator/adam-advisory-store
 */
'use strict';

const { groupMultiPartAdvisories } = require('./multi-part-reply.cjs');

const ADAM_ADVISORY_KIND = 'adam_advisory';
const BROADCAST_COORDINATOR = 'broadcast-coordinator';
// SD-LEO-FIX-SOLOMON-MULTI-PART-001: how far back resolveGroupForAdvisory looks for sibling
// parts of a series. Live multi-part replies arrive within ~1 minute of each other; 7 days
// is a generous safety margin, not a tuned value.
const GROUP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Read-only: unactioned advisories targeting the coordinator (or the broadcast sentinel).
 * Stamps NOTHING (the peek verb relies on this). Returns { rows, error }; rows=[] on error.
 *
 * @param {object} supabase
 * @param {string} coordinatorId - the active coordinator's session_id (may be null/absent)
 * @param {object} [opts] - { limit }
 * @returns {Promise<{rows:Array<object>, error:object|null}>}
 */
async function selectUnactionedAdvisories(supabase, coordinatorId, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 20;
  const targets = [coordinatorId, BROADCAST_COORDINATOR].filter(Boolean);
  let q = supabase
    .from('session_coordination')
    // SD-LEO-FIX-SOLOMON-MULTI-PART-001 (adversarial-review fix, PR #6191): target_session
    // is REQUIRED here — groupMultiPartAdvisories keys a series on it, and this selector
    // deliberately unions rows from TWO different targets (coordinatorId + the broadcast
    // sentinel). Omitting it left every row's target_session undefined, silently defeating
    // the cross-target collision guard groupMultiPartAdvisories' own tests assert.
    .select('id, sender_session, sender_type, target_session, subject, body, payload, read_at, created_at')
    .eq('payload->>kind', ADAM_ADVISORY_KIND)
    .is('payload->>actioned_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  q = targets.length <= 1 ? q.eq('target_session', targets[0] || BROADCAST_COORDINATOR) : q.in('target_session', targets);
  const { data, error } = await q;
  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

// QF-20260621-174: the unactioned backlog reached 80+ rows (mostly belt-countdown status
// relays), burying genuine action-required asks under the old LIMIT 20. This predicate lets
// the render path partition the lane so action-required advisories surface un-truncated.
// Matches an explicit reply request OR action-phrasing in the subject/body. PURE/TOTAL.
const ACTION_REQUIRED_RE =
  /action[\s-]?(required|requested)|please file|chairman[\s-]?priority|expects?[\s-]?reply|needs?\s+(a\s+)?(decision|reply|response)/i;

/**
 * Is this advisory one the coordinator must ACT on (vs a passive status relay)?
 * True when payload.expects_reply is set, or the subject/body uses action phrasing.
 * @param {object} row - a session_coordination advisory row
 * @returns {boolean}
 */
function isActionRequiredAdvisory(row) {
  if (!row || typeof row !== 'object') return false;
  const p = row.payload || {};
  if (p.expects_reply === true) return true;
  const text = [row.subject, row.body, p.body, p.subject]
    .filter((s) => typeof s === 'string')
    .join(' ');
  return ACTION_REQUIRED_RE.test(text);
}

/**
 * Fetch a single advisory row by id (for ack/reply resolution).
 * @returns {Promise<{row:object|null, error:object|null}>}
 */
async function fetchAdvisory(supabase, advisoryId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, target_session, subject, payload, read_at')
    .eq('id', advisoryId)
    .maybeSingle();
  return { row: data || null, error: error || null };
}

/**
 * SD-LEO-FIX-SOLOMON-MULTI-PART-001 (FR-3): resolve the full multi-part group a single
 * advisory row belongs to, by re-querying its (target_session, sender_session) sibling
 * rows from the last GROUP_LOOKBACK_MS and grouping them (multi-part-reply.cjs). Degrades
 * to the row's own singleton group when it carries no "N/M" series marker, no sibling
 * parts are found, or the lookup errors — never throws.
 * @param {object} supabase
 * @param {object} advisoryRow - must include {id, target_session, sender_session, subject}
 * @returns {Promise<object>} a group shape from groupMultiPartAdvisories
 */
async function resolveGroupForAdvisory(supabase, advisoryRow) {
  const singleton = {
    id: advisoryRow.id,
    memberIds: [advisoryRow.id],
    rows: [advisoryRow],
    isMultiPart: false,
    isComplete: true,
    total: 1,
  };
  if (!advisoryRow || !advisoryRow.target_session || !advisoryRow.sender_session) return singleton;
  try {
    const cutoffIso = new Date(Date.now() - GROUP_LOOKBACK_MS).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      // Scoped to payload->>kind=adam_advisory (adversarial-review fix, PR #6191) so an
      // unrelated row between the same session pair that happens to carry a numeric
      // "N/M"-shaped subject is never pulled into the group / stamped actioned_at.
      .eq('payload->>kind', ADAM_ADVISORY_KIND)
      .select('id, subject, body, payload, target_session, sender_session, created_at')
      .eq('target_session', advisoryRow.target_session)
      .eq('sender_session', advisoryRow.sender_session)
      .gte('created_at', cutoffIso)
      // DESCENDING (adversarial-review fix, PR #6191): ascending + limit(50) returned the
      // OLDEST 50 rows in the window, so a busy (target_session, sender_session) pair with
      // >50 rows in 7 days could silently exclude the CURRENT advisory's own sibling parts
      // (and even the advisory itself) — the exact high-volume case this function targets.
      // groupMultiPartAdvisories re-sorts by parsed part index internally, so input order
      // doesn't otherwise matter.
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return singleton;
    const groups = groupMultiPartAdvisories(data);
    return groups.find((g) => g.memberIds.includes(advisoryRow.id)) || singleton;
  } catch {
    return singleton;
  }
}

/**
 * SD-LEO-FIX-SOLOMON-MULTI-PART-001 (FR-3): stamp payload.actioned_at on EVERY member row
 * of a group (see resolveGroupForAdvisory) — never retire only part of a multi-part series.
 * Each row's payload differs, so each member is stamped with its OWN JSONB-merged payload
 * (mirrors stampActioned's per-row merge; never a single blanket update across ids).
 * @returns {Promise<{error: object|null}>} error is the FIRST failure encountered, if any
 */
async function stampActionedGroup(supabase, group, nowIso) {
  let firstError = null;
  for (const row of group.rows) {
    const { error } = await stampActioned(supabase, row, nowIso);
    if (error && !firstError) firstError = error;
  }
  return { error: firstError };
}

/**
 * Stamp payload.actioned_at on the advisory (JSONB merge — preserves existing keys).
 * This is the ONLY thing that retires an advisory. Idempotent (re-stamp is harmless).
 * @param {object} supabase
 * @param {object} advisoryRow - row with { id, payload }
 * @param {string} nowIso - ISO timestamp
 * @returns {Promise<{error:object|null}>}
 */
async function stampActioned(supabase, advisoryRow, nowIso) {
  const mergedPayload = Object.assign({}, advisoryRow.payload || {}, { actioned_at: nowIso });
  const { error } = await supabase
    .from('session_coordination')
    .update({ payload: mergedPayload })
    .eq('id', advisoryRow.id);
  return { error: error || null };
}

module.exports = {
  ADAM_ADVISORY_KIND,
  BROADCAST_COORDINATOR,
  selectUnactionedAdvisories,
  isActionRequiredAdvisory,
  fetchAdvisory,
  stampActioned,
  resolveGroupForAdvisory,
  stampActionedGroup,
};
