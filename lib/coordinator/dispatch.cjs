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
const crypto = require('crypto');
// SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-1): the shared SSOT dispatch-
// ineligibility classifier, mirror-killed into assertSdDispatchable below.
const { classifyDispatchIneligibility } = require('../fleet/claim-eligibility.cjs');
// QF-20260709-053: no circular-require risk (adam-identity.cjs has zero requires of its own).
const { getActiveAdamId } = require('./adam-identity.cjs');
// SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: send-time target-drain warn at THE choke point —
// every send path (adam-advisory, solomon-advisory, worker-signal, coordinator dispatch)
// already routes through insertCoordinationRow, so the kind-vs-drain-set contract lives here
// once instead of per-file. None of these requires dispatch.cjs back (no cycle).
const { warnIfUndrainedKind } = require('../fleet/worker-status.cjs');
const { getActiveSolomonId } = require('./solomon-identity.cjs');
const { getActiveCoordinatorId } = require('./resolve.cjs');

// Sentinel target → role, for the target-drain warn. 'broadcast' (all roles) resolves to
// null: no single drain set applies, so the check stays silent.
const SENTINEL_ROLES = Object.freeze({
  'broadcast-coordinator': 'coordinator',
  'broadcast-solomon': 'solomon',
  'broadcast-adam': 'adam',
});

/**
 * Resolve the ROLE a target_session will be drained by: caller hint > sentinel map >
 * POSITIVE role-identity match (adam/solomon/coordinator resolvers, all fail-open).
 * A UUID matching none of the three named roles resolves to null, NOT 'worker' — a
 * transiently-unresolvable Adam/Solomon must never be misclassified into a mis-warn
 * (warn-only contract: precision over recall). Coordinator→worker senders that KNOW
 * their target is a worker say so via opts.targetRoleHint (dispatchToWorker defaults
 * it). Null keeps the warn helper silent (fail-open; SEND-TIME-TARGET-001 TR-3).
 * @private
 */
// Adversarial-review fix (PR #6170): the three identity resolutions are memoized with a
// short TTL so an unhinted burst of UUID-targeted sends pays ~one lookup trio, not one per
// send, on the fleet's hottest write path. 60s is far shorter than any real role-identity
// churn (coordinator/Adam/Solomon identities change on session start/stop, minutes apart).
const ROLE_IDS_TTL_MS = 60_000;
let _roleIdsCache = { at: 0, ids: null };

async function resolveTargetRole(supabase, target, targetRoleHint) {
  if (targetRoleHint) return String(targetRoleHint).toLowerCase();
  if (!target || typeof target !== 'string') return null;
  if (SENTINEL_ROLES[target]) return SENTINEL_ROLES[target];
  if (target === 'broadcast' || !isFullUuid(target)) return null;
  try {
    if (!_roleIdsCache.ids || (Date.now() - _roleIdsCache.at) > ROLE_IDS_TTL_MS) {
      const [adamId, solomonId, coordinatorId] = await Promise.all([
        getActiveAdamId(supabase, {}).catch(() => null),
        getActiveSolomonId(supabase, {}).catch(() => null),
        getActiveCoordinatorId(supabase).catch(() => null),
      ]);
      _roleIdsCache = { at: Date.now(), ids: { adamId, solomonId, coordinatorId } };
    }
    const { adamId, solomonId, coordinatorId } = _roleIdsCache.ids;
    if (target === adamId) return 'adam';
    if (target === solomonId) return 'solomon';
    if (target === coordinatorId) return 'coordinator';
    return null;
  } catch {
    return null;
  }
}

// QF-20260710-750 (closure-map line 39): a claude_sessions ROW existing is not the same as the
// session being LIVE -- a row persists long after its process ends. 10min mirrors the SAME
// heartbeat-freshness cutoff stale-session-sweep.cjs already treats as canonical "alive"
// elsewhere (its liveCutoff), not a new invention. Deliberately NOT is_alive (documented stale-
// false-read trap) and NOT a wider window like 30min (coordinator-self-review.mjs's solicitation
// query used exactly that laxer window, which is why review requests kept reaching sessions whose
// median lifespan (~9min) had already elapsed by dispatch time).
const LIVE_HEARTBEAT_CUTOFF_MS = 10 * 60_000;

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
    .select('session_id, heartbeat_at')
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
  // QF-20260710-750: the row EXISTS but may be a dead addressee (session ended, row never
  // cleaned up) — check heartbeat freshness, not just row presence. A missing heartbeat_at
  // (real rows always have one; only an incomplete lookup would lack it) fails OPEN — matching
  // this module's established fail-open-on-unconfirmed / fail-closed-only-on-CONFIRMED-violation
  // posture (see assertWorkerTierAllowed above) — rather than treating absence as certain death.
  const hbAgeMs = data.heartbeat_at ? (Date.now() - Date.parse(data.heartbeat_at)) : null;
  if (hbAgeMs !== null && hbAgeMs > LIVE_HEARTBEAT_CUTOFF_MS) {
    const msg = `[dispatch] REFUSED insert: target_session ${target} exists but heartbeat is stale `
      + `(${Math.round(hbAgeMs / 60000)}min old, cutoff ${Math.round(LIVE_HEARTBEAT_CUTOFF_MS / 60000)}min) `
      + `— would dead-letter to a dead addressee. Re-target to a live worker UUID or a sentinel.`;
    logger && logger.error && logger.error(msg);
    const e = new Error(msg);
    e.code = 'DISPATCH_TARGET_STALE';
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
// QF-20260719-702: 'closed' added — same missing-terminal-status gap class as
// lib/checkin/steps/resume.cjs:62 (QF-20260719-406).
const TERMINAL_QF_STATUSES = Object.freeze(new Set(['completed', 'cancelled', 'escalated', 'closed']));

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
  let status, found, metadata, sdType, targetApplication;
  try {
    if (isQf) {
      const { data, error } = await supabase.from('quick_fixes').select('status').eq('id', sdKey).maybeSingle();
      if (error) throw error;
      found = !!data; status = data && data.status;
    } else {
      // SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001 / SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001:
      // also fetch metadata + sd_type + target_application so the mirror-killed classifier call
      // below runs in the SAME lookup (no extra query path).
      const { data, error } = await supabase.from('strategic_directives_v2').select('status, metadata, sd_type, target_application').eq('sd_key', sdKey).maybeSingle();
      if (error) throw error;
      found = !!data; status = data && data.status; metadata = data && data.metadata;
      sdType = data && data.sd_type; targetApplication = data && data.target_application;
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
  // SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-1, mirror-kill): the directed-dispatch path
  // previously hand-re-implemented ONLY the needs_coordinator_review axis (SD-LEO-INFRA-NEEDS-
  // COORDINATOR-REVIEW-HOLD-001), silently missing every other fail-open axis the self-claim/sweep
  // path already refuses via classifyDispatchIneligibility (co_author_pending, not_before,
  // one_way_door, test_clone_build_tree, unactionable_venture_remediation, ...). Route through the
  // SAME shared classifier instead of re-implementing a subset. ctx is intentionally undefined —
  // directed-assign has no worker-tier context, and the classifier's tier/fitness blocks are
  // explicitly no-ops when ctx is falsy, so this call can only ever ADD a refusal, never remove one.
  // sd_terminal/sd_deferred are excluded here since the explicit terminal check above already threw
  // a more specific DISPATCH_SD_TERMINAL error for those cases.
  if (!isQf) {
    const verdict = classifyDispatchIneligibility(
      { sd_key: sdKey, sd_type: sdType, metadata, target_application: targetApplication, status },
      undefined
    );
    if (verdict && verdict !== 'sd_terminal' && verdict !== 'sd_deferred') {
      const e = new Error(`[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} is dispatch-ineligible (${verdict}) — mirrors the self-claim/sweep path's classifyDispatchIneligibility verdict.`);
      e.code = 'DISPATCH_SD_INELIGIBLE';
      e.verdict = verdict;
      logger && logger.error && logger.error(e.message);
      throw e;
    }
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

// Bounded FIFO audit trail (FR-4): oldest entries drop first once the cap is hit.
const MODEL_TIER_DECISIONS_CAP = 20;
// FR-3: how far back a prior sub_agent_execution_results row counts as "evidence gathered".
const EVIDENCE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-2/FR-3/FR-4): stamp an ADVISORY
 * payload.model_recommendation (+criterion/+reason) on WORK_ASSIGNMENT rows at this same
 * choke point, sibling to stampEffortRecommendation. Composes with door_class (read via the
 * target SD's metadata) rather than extending it — recommendModelTier's own R5 shortcut
 * consumes door_class directly. FR-3: a fable-tier recommendation with no resolvable evidence
 * reference (payload.evidence_packet, or a recent sub_agent_execution_results row for the SD)
 * is flagged model_recommendation_evidence_missing. FR-4: every non-null recommendation is also
 * appended to the target SD's metadata.model_tier_decisions[] (FIFO-capped at 20) as a durable
 * per-SD audit trail. Fail-soft throughout: any lookup/classify/write error leaves the row
 * unchanged and never blocks dispatch. Nothing gates on any of these fields.
 * @private
 */
async function stampModelRecommendation(supabase, row, logger = console) {
  try {
    if (row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (payload.model_recommendation) return; // caller already decided
    const sdKey = payload.assigned_sd || payload.sd_key || row.target_sd || null;
    if (!sdKey || /^QF-/.test(sdKey)) return; // QFs are tightly-specified by construction — not scored

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('title, description, scope, key_changes, sd_type, metadata, current_phase')
      .eq('sd_key', sdKey)
      .maybeSingle();
    if (!sd) return;

    const { recommendModelTier } = require('../fleet/model-recommendation.cjs');
    const rec = recommendModelTier({
      title: sd.title,
      description: sd.description,
      scope: sd.scope,
      key_changes: sd.key_changes,
      sd_type: sd.sd_type,
      metadata: sd.metadata,
    });

    const newPayload = { ...payload, model_recommendation: rec.tier, model_recommendation_criterion: rec.criterion, model_recommendation_reason: rec.reason };

    // FR-3: evidence-first check — only meaningful for a fable-tier recommendation.
    if (rec.tier === 'fable') {
      let evidenceFound = Boolean(payload.evidence_packet);
      if (!evidenceFound) {
        try {
          const sinceIso = new Date(Date.now() - EVIDENCE_LOOKBACK_MS).toISOString();
          const { data: evidenceRows } = await supabase
            .from('sub_agent_execution_results')
            .select('id')
            .eq('sd_id', sdKey)
            .gte('created_at', sinceIso)
            .limit(1);
          evidenceFound = Array.isArray(evidenceRows) && evidenceRows.length > 0;
        } catch { /* fail-open: an evidence-lookup fault never blocks the flag from resolving false */ }
      }
      if (!evidenceFound) newPayload.model_recommendation_evidence_missing = true;
    }

    row.payload = newPayload;

    // FR-4: fire-and-forget audit trail on the target SD — never blocks dispatch on failure.
    try {
      const existing = Array.isArray(sd.metadata && sd.metadata.model_tier_decisions) ? sd.metadata.model_tier_decisions : [];
      const entry = { at: new Date().toISOString(), criterion: rec.criterion, tier: rec.tier, reason: rec.reason, dispatch_row_id: row.id || null };
      const trimmed = [...existing, entry].slice(-MODEL_TIER_DECISIONS_CAP);
      await supabase
        .from('strategic_directives_v2')
        .update({ metadata: { ...(sd.metadata || {}), model_tier_decisions: trimmed } })
        .eq('sd_key', sdKey);
    } catch (e) {
      logger && logger.warn && logger.warn(`[dispatch] model_tier_decisions audit-trail write skipped: ${e.message}`);
    }

    // FR-5: ride along on the door_routing_ledger (fire-and-forget, inert unless
    // DOOR_ROUTING_ENABLED — see lib/fleet/door-constants.cjs). The ledger's door column has a
    // NOT NULL CHECK(one_way|two_way) constraint, so this only fires when the SD already carries
    // a classified door_class; an unclassified SD has nothing valid to log against that
    // constraint and is silently skipped (not a gap — door_class stamping is a separate, already
    // pre-cutover-inert mechanism).
    const doorForLedger = sd.metadata && sd.metadata.door_class && sd.metadata.door_class.door;
    if (doorForLedger) {
      try {
        const { writeDoorRoutingLedger, funnelPositionForPhase } = require('../fleet/door-routing-ledger.cjs');
        void writeDoorRoutingLedger(supabase, {
          work_key: sdKey,
          door: doorForLedger,
          model_id: rec.tier,
          r_criterion: rec.criterion,
          funnel_position: funnelPositionForPhase(sd.current_phase),
        }, logger);
      } catch (e) {
        logger && logger.warn && logger.warn(`[dispatch] FR-5 ledger write skipped: ${e.message}`);
      }
    }
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] model recommendation skipped: ${e.message}`);
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
    const { isTieringActive, resolveWorkerTierRank, resolveRoutingScore, capabilityScore } = require('../fleet/tier-ladder.cjs');
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
    // FR-4.3 (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-D): dispatch tiering's routing score
    // resolves through the ONE doctrine seam. Shape comes from the SD's problem_shape stamp
    // when present; an unstamped SD (all of today's) or an unbound reference table makes the
    // seam return the static capabilityScore, so the rank comparison below is unchanged until
    // child C binds trusted rows. A graded divergence is surfaced as a breadcrumb ONLY — a
    // graded→rank binding is deliberately not invented here (single-doctrine guard).
    const declared = sess.metadata || {};
    const shape = (sd && sd.metadata && sd.metadata.problem_shape) || null;
    const routingScore = await resolveRoutingScore({ supabase, shape, model: declared.model, effort: declared.effort });
    if (shape && routingScore !== capabilityScore(declared.model, declared.effort)) {
      logger && logger.info && logger.info(
        `[dispatch] graded routing score ${routingScore} for ${sdKey} (${shape}/${declared.model}/${declared.effort}) — rank stamps remain authoritative until a graded→rank binding ships`
      );
    }
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
 * Door-routing gate + delegate stamp (SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 FR-3).
 * Sibling of assertWorkerTierAllowed at the same choke point, same posture: INERT
 * unless DOOR_ROUTING_ENABLED (the Tuesday cutover flag — off means dispatch behavior
 * is byte-identical to today); fail-OPEN on any read fault; fail-CLOSED only on a
 * CONFIRMED one_way-door-to-below-top-rank determination. For two_way items, stamps
 * payload.delegate_model (from the target worker's declared model, validated against
 * DELEGATE_TIERS) beside effort_recommendation — the delegate builds through the
 * IDENTICAL gate set (tier changes WHO builds, never what evidence ships).
 * Exported for the TS-3/TS-5 fixture tests.
 */
async function assertDoorRoutingAllowed(supabase, row, logger = console) {
  try {
    const { DOORS, DELEGATE_TIERS, isDoorRoutingEnabled } = require('../fleet/door-constants.cjs');
    if (!isDoorRoutingEnabled()) return; // pre-cutover: byte-identical dispatch (TS-5 inertness)
    if (!row || row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sdKey = payload.assigned_sd || payload.sd_key || row.target_sd || null;
    if (!sdKey || /^QF-/.test(sdKey)) return; // QFs are tier-1/2 by construction (two_way-shaped)

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .maybeSingle();
    const doorClass = sd && sd.metadata && sd.metadata.door_class;
    const door = doorClass && typeof doorClass === 'object' ? doorClass.door : null;
    if (door !== DOORS.ONE_WAY && door !== DOORS.TWO_WAY) return; // unstamped -> fail-open

    const { ladderTopRank, resolveWorkerTierRank } = require('../fleet/tier-ladder.cjs');
    const { data: sess } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', row.target_session)
      .maybeSingle();
    if (!sess) return; // sentinel/unknown target -> fail-open (assertValidTarget vetted real ones)

    // FR-4 seam: every routed (non-refused) item writes one fire-and-forget ledger
    // row at dispatch-stamp time — the writer never throws and never blocks.
    const { writeDoorRoutingLedger } = require('../fleet/door-routing-ledger.cjs');
    const workerRank = resolveWorkerTierRank(sess); // ledger telemetry only — NOT the exclusivity input
    const declared = sess.metadata && typeof sess.metadata.model === 'string'
      ? sess.metadata.model.toLowerCase().trim() : null;

    if (door === DOORS.ONE_WAY) {
      // EXCLUSIVITY CHECKS THE MODEL, NOT THE RANK (adversarial finding A): static
      // rank 4 is shared by fable and opus/high+, and resolveWorkerTierRank defaults
      // UNSTAMPED sessions UP to top — the conservative-UP posture that is safe for
      // WORK-DOWN-NEVER-UP is inverted-dangerous for an exclusivity gate. Here the
      // unknown direction fails CLOSED: only an explicitly-declared fable session
      // may take a one-way door. Deliberate divergence from the sibling's
      // degrade-to-1 escape: irreversible work WAITS for Fable rather than routing
      // down — the refusal is loud so the coordinator can escalate (design doc §gate).
      // REVISIT-IF(condition=delegate capability attestation ships) owner=coordinator provenance=SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 note=name-keyed exclusivity is the safe interim; generalize to attested-capability gating (bitter-lesson: name lists cap the system at today's lineup) once attestation exists
      if (declared !== 'fable') {
        const reasons = Array.isArray(doorClass.reasons) ? doorClass.reasons.join(', ') : 'unspecified';
        const e = new Error(
          `[dispatch] REFUSED WORK_ASSIGNMENT: ${sdKey} is a ONE-WAY door (${reasons}) — Fable-exclusive. `
          + `Target worker's declared model is '${declared || 'UNDECLARED'}' (exclusivity fails CLOSED on unknown). `
          + `Irreversible work never delegates; it waits for a fable session.`
        );
        e.code = 'DISPATCH_ONE_WAY_DOOR';
        throw e;
      }
      void writeDoorRoutingLedger(supabase, { work_key: sdKey, door, tier_rank: workerRank, model_id: declared }, logger);
      return; // declared-fable target: proceed; one_way carries no delegate stamp
    }

    // two_way: stamp the delegate model beside effort_recommendation. A caller-preset
    // delegate_model is RE-VALIDATED against DELEGATE_TIERS (adversarial finding F) —
    // an invalid preset is replaced, never honored verbatim.
    const fallback = String(process.env.DELEGATE_DEFAULT_MODEL || 'sonnet').toLowerCase();
    const delegate = DELEGATE_TIERS.includes(declared) ? declared
      : (DELEGATE_TIERS.includes(fallback) ? fallback : 'sonnet');
    if (row.payload && typeof row.payload === 'object') {
      const preset = row.payload.delegate_model;
      if (preset == null) {
        row.payload = { ...row.payload, delegate_model: delegate };
      } else if (!DELEGATE_TIERS.includes(String(preset).toLowerCase())) {
        logger && logger.warn && logger.warn(`[dispatch] door-routing: caller-preset delegate_model '${preset}' not in DELEGATE_TIERS — replaced with '${delegate}'`);
        row.payload = { ...row.payload, delegate_model: delegate };
      }
    }
    void writeDoorRoutingLedger(supabase, {
      work_key: sdKey, door, delegate_model: (row.payload && row.payload.delegate_model) || delegate, tier_rank: workerRank,
    }, logger);
  } catch (e) {
    if (e && e.code === 'DISPATCH_ONE_WAY_DOOR') throw e; // fail CLOSED on a confirmed violation
    logger && logger.warn && logger.warn(`[dispatch] door-routing check skipped (fail-open): ${e.message}`);
  }
}

/**
 * Validated session_coordination insert. The INTENDED choke point coordinator-side
 * inserts route through — though some producers (notably the stale-session-sweep cron)
 * still insert raw and therefore call assertSdDispatchable directly. Validates
 * row.target_session, refuses terminal/non-existent targets, then performs the insert.
 *
 * SD-LEO-INFRA-SESSION-COORDINATION-LANE-001 (corrected census, superseding any prior
 * "92 raw sites" estimate): a full call-site census found 34 PRODUCTION raw insert sites
 * (i.e. NOT routed through this function) — 7 already on-contract (target_session
 * resolver-sourced despite bypassing this choke point), 27 migratable (nearly all
 * worker-addressed or broadcast sends, which is OUTSIDE the Solomon-advisory clause-(a)
 * "role-addressed sends resolve only through the identity resolvers" scope — workers are
 * not singleton roles), 8 exempt (test fixtures / archived dead code under
 * scripts/archive/one-time/). This function itself does NOT enforce that row.target_session
 * came from a resolver — it only validates the target EXISTS (assertValidTarget /
 * assertSdDispatchable). The genuine remaining clause-(a) risk class is a CALLER sourcing
 * row.target_session from an ECHOED row field (row.target_session / msg.target_session /
 * row.sender_session) rather than a fresh getActiveAdamId/getActiveSolomonId/
 * getActiveCoordinatorId call. The new no-echoed-session-coordination-target lint (added by
 * this SD) is a narrow AST pattern match — it catches a DIRECT `target_session: row.xxx`
 * member-expression in the object literal, not an indirect echo through an intermediate
 * variable. Verified sites: lib/coordinator/relay-queue.cjs and
 * scripts/hooks/coordination-inbox.cjs both had a direct echo (target_session:
 * row.sender_session / msg.sender_session) and are now cited via eslint-disable-next-line
 * no-echoed-session-coordination-target, pending a follow-up investigation into their
 * interaction with the already-shipped periodic stale-identity reconciliation sweep before a
 * runtime fix is safe. lib/coordinator/reply-class.cjs:151 and
 * lib/coordinator/adam-action-ack.cjs:288 echo the SAME underlying field but through an
 * intermediate variable (`const target = row.target_session; ... target_session: target`) —
 * a real instance of the same bug class that the new lint does NOT catch by design (accepts
 * false negatives over false positives, mirroring no-raw-session-coordination-insert.js's own
 * pragmatic approach); both are documented here as a known, uncited gap for a future lint
 * enhancement or manual fix. One census finding was itself
 * corrected on manual review: coordinator-self-review.mjs's adamParticipants loop is an
 * intentional multi-recipient broadcast solicitation (poll every live Adam-role-shaped
 * session for feedback), not a single-role-targeting bug — collapsing it to one
 * getActiveAdamId() call would break the intended multi-participant behavior, so it is NOT
 * treated as a clause-(a) violation. Clause (e) (unified read_at/acknowledged_at
 * consumption semantics across every role inbox) was deferred to a follow-on SD — see
 * docs/protocol/coordinator-adam-comms.md lines ~115-129 for the current, only-partially-
 * unified state.
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
  // QF-20260703-885: payload.kind='work_assignment' REQUIRES message_type='WORK_ASSIGNMENT'.
  // The claim path (worker-checkin.cjs) surfaces pending assignments ONLY on top-level
  // message_type==='WORK_ASSIGNMENT' — a dispatch typed message_type=INFO with
  // payload.kind='work_assignment' is invisible to it and also silently bypasses the
  // WORK-DOWN-NEVER-UP tier guard in assertWorkerTierAllowed below. Fail-closed (refuse,
  // don't auto-correct) so a mistyped dispatch is caught at write time, not discovered as a
  // worker sitting idle on addressed-but-invisible work.
  if (row.payload && typeof row.payload === 'object' && row.payload.kind === 'work_assignment'
      && row.message_type !== 'WORK_ASSIGNMENT') {
    const e = new Error(
      `[dispatch] payload.kind='work_assignment' requires message_type='WORK_ASSIGNMENT' (got '${row.message_type}') — refusing mistyped assignment dispatch.`
    );
    e.code = 'DISPATCH_WORK_ASSIGNMENT_TYPE_MISMATCH';
    throw e;
  }
  // QF-20260709-053: an Adam-directed send whose payload.kind is untyped/unknown falls into the
  // reader-side "orphan" class (scripts/adam-advisory.cjs isOrphanedAdamRow) — flagged but never
  // drained, a silent-drop risk under 30-min throttled ticks. Refuse at send time instead of
  // tolerating it reader-side, mirroring the work_assignment guard above. Fail-open on lookup
  // error (never block a send on a transient Adam-identity-resolution fault).
  try {
    const activeAdamId = await getActiveAdamId(supabase, {});
    if (activeAdamId && row.target_session === activeAdamId && row.payload && typeof row.payload === 'object') {
      const { isReplyRow, isAdamInboxRow, EXCLUDED_KINDS } = require('../../scripts/adam-advisory.cjs');
      const kind = row.payload.kind;
      const isExcluded = kind != null && EXCLUDED_KINDS.includes(kind);
      if (!isReplyRow(row) && !isAdamInboxRow(row) && !isExcluded) {
        const e = new Error(
          `[dispatch] Adam-directed send with untyped/unknown payload.kind='${kind}' refused — not in ADAM_INBOX_KINDS/EXCLUDED_KINDS and not a reply. Use a typed kind (see scripts/adam-advisory.cjs ADAM_INBOX_KINDS) or route via a handler-owned lane.`
        );
        e.code = 'DISPATCH_UNTYPED_ADAM_KIND';
        throw e;
      }
    }
  } catch (e) {
    if (e && e.code === 'DISPATCH_UNTYPED_ADAM_KIND') throw e; // fail CLOSED on a confirmed violation
    logger && logger.warn && logger.warn(`[dispatch] Adam-inbox-kind check skipped (fail-open): ${e.message}`);
  }
  await assertValidTarget(supabase, row.target_session, logger);
  // SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: refuse to dispatch a terminal/non-existent SD before the
  // insert (mirrors claim_sd's terminal guard — fails CLOSED on terminal/not-found, open on a DB hiccup).
  await assertSdDispatchable(supabase, row, logger);
  // SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-4): the SECOND tier enforcement point —
  // directed dispatch BYPASSES claim-eligibility by design, so WORK-DOWN-NEVER-UP also lives here.
  await assertWorkerTierAllowed(supabase, row, logger);
  // SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 (FR-3): door gate + delegate stamp — inert
  // unless DOOR_ROUTING_ENABLED (Tuesday cutover flag), same fail-open/fail-closed posture
  // as the tier check above.
  await assertDoorRoutingAllowed(supabase, row, logger);
  await stampEffortRecommendation(supabase, row, logger);
  // SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-2/FR-3/FR-4): advisory model-tier stamp,
  // sibling to the effort stamp above — same choke point, same fail-soft posture.
  await stampModelRecommendation(supabase, row, logger);
  // FR-2 (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C): stamp the protocol version on every row
  // through the choke point so a stale long-lived-singleton reader can detect a skew instead of
  // silently misreading it. Only stamps INTO an existing payload object — never invents one (some
  // rows are payload-less by design) — and never overwrites a caller-supplied stamp.
  if (row.payload && typeof row.payload === 'object' && row.payload.protocol_comms_version == null) {
    row.payload = { ...row.payload, protocol_comms_version: PROTOCOL_COMMS_VERSION };
  }
  // QF-20260705-514: INFO/coordinator_update/coordinator_fence/coordinator_feedback_disposition
  // sends routinely omit payload.correlation_id (unlike WORK_ASSIGNMENT senders, who conventionally
  // include one), leaving those rows unreplyable — no thread anchor for the recipient. Stamp one
  // in at this single choke point so every sender inherits it; never overwrite a caller-supplied id.
  if (row.payload && typeof row.payload === 'object' && row.payload.correlation_id == null) {
    row.payload = { ...row.payload, correlation_id: crypto.randomUUID() };
  }
  // SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 FR-5: canonical sender_type stamp.
  // Solomon e72dad97 found sender_type stamped ad hoc per caller — role-addressed queries and
  // drain logic guessed at sender identity. When the caller OMITTED sender_type and the
  // sender_session IS the active coordinator, stamp 'coordinator' at this single choke point
  // (same precedent as the correlation_id stamp above: fill-if-absent, NEVER overwrite a
  // caller-supplied value). Fail-open: an unresolvable coordinator leaves the row untouched.
  if (row.sender_type == null && row.sender_session) {
    try {
      const { getActiveCoordinatorId } = require('./resolve.cjs');
      const activeCoord = await getActiveCoordinatorId(supabase);
      if (activeCoord && activeCoord === row.sender_session) {
        row.sender_type = 'coordinator';
      }
    } catch { /* fail-open: stamping is best-effort, never blocks a send */ }
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
  // SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: kind-vs-target-drain-set contract. WARN-ONLY —
  // a mismatch never blocks the insert (warn→reject tightening is an explicit follow-on after
  // burn-in). Fires only on a CONFIDENT mismatch: resolvable target role + a non-terminal
  // payload.kind absent from that role's DRAIN_SETS entry (lib/fleet/worker-status.cjs).
  // Callers that know their target's role statically pass opts.targetRoleHint (e.g.
  // adam-advisory `--to solomon` → 'solomon') so a UUID target needs no identity lookup.
  try {
    const kind = row.payload && typeof row.payload === 'object' ? row.payload.kind : null;
    if (kind) {
      const targetRole = await resolveTargetRole(supabase, row.target_session, opts.targetRoleHint);
      warnIfUndrainedKind({ targetRole, kind, log: (logger && logger.warn) || console.warn });
    }
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] target-drain check skipped (fail-open): ${e.message}`);
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
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: a whole-thread replay must never be
  // silently capped at the PostgREST 1000-row max (callers replay the conversation and act on
  // it) — paginate to completion. Same {data,error} contract as before: [] pages aggregate to
  // data, any page error surfaces as {data:null, error}.
  try {
    const _fap = await import('../db/fetch-all-paginated.mjs');
    const data = await _fap.fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('*')
      .eq('payload->>topic_id', topicId)
      .order('created_at')
      .order('id')); // unique-key tiebreaker for stable pagination
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: (e && e.message) || String(e) } };
  }
}

/**
 * Thin convenience wrapper for coordinator→worker dispatch. Same guarantees as
 * insertCoordinationRow; exists so call sites read intentionally.
 */
async function dispatchToWorker(supabase, row, opts = {}) {
  // SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: this wrapper IS the coordinator→worker intent,
  // so it carries the 'worker' role hint for the target-drain warn (resolveTargetRole never
  // infers 'worker' from a UUID — positive identity matches only). Caller-supplied hint wins;
  // ?? (not spread-order) so a caller's conditional `targetRoleHint: undefined` idiom cannot
  // silently clobber the default (adversarial-review fix, PR #6170).
  return insertCoordinationRow(supabase, row, { ...opts, targetRoleHint: opts.targetRoleHint ?? 'worker' });
}

module.exports = {
  FULL_UUID_RE,
  SENTINEL_TARGETS,
  SENTINEL_ROLES,
  isFullUuid,
  isSentinelTarget,
  assertValidTarget,
  resolveTargetRole,
  insertCoordinationRow,
  getThreadByTopicId,
  dispatchToWorker,
  stampEffortRecommendation,
  stampModelRecommendation, // SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 — exported for TS-4/TS-5/TS-6 fixtures
  isTerminalSdStatus,
  isTerminalQfStatus,
  assertSdDispatchable,
  assertWorkerTierAllowed,
  assertDoorRoutingAllowed, // SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 — exported for TS-3/TS-5 fixtures
};
