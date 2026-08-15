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
const { CORRECTION_KIND_SET, DISPOSITION_KIND } = require('./message-kinds.cjs');
const { MAX_PARTS } = require('./multi-part-reply.cjs');
const crypto = require('crypto');
// SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-1): the shared SSOT dispatch-
// ineligibility classifier, mirror-killed into assertSdDispatchable below.
const { classifyDispatchIneligibility } = require('../fleet/claim-eligibility.cjs');
// SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): the SHARED target registry, also used by
// the worker side. Five sites in this file each carried their own inline field list, in three
// mutually disagreeing orders — a row could be resolvable to one and invisible to another. The
// registry is now shared; the ORDERS are not (each site keeps its own PROFILE), because imposing
// one global order changed 26 of 70 already-resolving live rows when it was tried.
// LEAF import: this module requires neither this file nor worker-checkin.cjs, so no cycle forms.
const { resolveAssignmentTargetKey, describeUnreadableAssignment } = require('../fleet/assignment-target.cjs');

/**
 * FR-2 rollout switch. Observe-only unless explicitly promoted, per the Observe-Only-First
 * protocol default: a new enforcement logs violations for a calibration window, and promotion
 * to binding requires an evidenced review of that window's output.
 * @returns {boolean} true when the target-resolvability guard should REFUSE rather than warn
 */
function isAssignmentTargetGuardBinding() {
  return String(process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD || '').toLowerCase() === 'block';
}
// QF-20260709-053: no circular-require risk (adam-identity.cjs has zero requires of its own).
const { getActiveAdamId } = require('./adam-identity.cjs');
// SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: send-time target-drain warn at THE choke point —
// every send path (adam-advisory, solomon-advisory, worker-signal, coordinator dispatch)
// already routes through insertCoordinationRow, so the kind-vs-drain-set contract lives here
// once instead of per-file. None of these requires dispatch.cjs back (no cycle).
// SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B / FR-3: the warn check itself is now dynamically
// imported from lib/fleet/drain-set-registry.js at the call site (registry-reader repoint).
const { getActiveSolomonId } = require('./solomon-identity.cjs');
const { getActiveCoordinatorId } = require('./resolve.cjs');
// SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3): shared premise-freshness contract — the same
// module the claim-time reader (lib/checkin/steps/directed-assignment.cjs) consumes, so the
// write-side detection and the read-side verdict can never disagree on what counts as an
// instruction body. LEAF import: premise-freshness.cjs requires nothing.
const { hasInstructionBody } = require('../coordination/premise-freshness.cjs');

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
  // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): 'dispatchGuard' profile reproduces this
  // site's precedence exactly (target_sd -> sd_key -> current_sd -> assigned_sd) and appends the
  // newly-taught locations last, so delegation is additive here too.
  const sdKey = resolveAssignmentTargetKey(row, { profile: 'dispatchGuard' });
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
    // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): 'dispatchStamp' profile — same
    // precedence as the inline chain it replaces (assigned_sd -> sd_key -> target_sd).
    const sdKey = resolveAssignmentTargetKey(row, { profile: 'dispatchStamp' });
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
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3): premise-measurement contract at this same
 * choke point, sibling to stampEffortRecommendation. An instruction body (payload.instruction /
 * apply / body / steps) carries factual premises a worker will act on, and until this SD nothing
 * on the dispatch path bounded or even recorded WHEN those premises were measured — every
 * 'freshness' check here measures the RECIPIENT, never the claim inside the instruction.
 *
 * WHAT THIS STAMP DOES — normalization only, never fabrication:
 *   - an unparseable premise_measured_at is STRIPPED (with a loud warn): absent reads as
 *     UNVERIFIED at claim-time, which is the safe direction; parseable garbage reading as
 *     anything at all is not.
 *   - an instruction body with NO stamp is warned about but passed through unstamped. It is
 *     DELIBERATELY NOT defaulted to now: this function runs at SEND time, and a send-time stamp
 *     certifies only that the message is new — exactly the false comfort this defect is made of.
 *     The read side (lib/checkin/steps/directed-assignment.cjs) treats the absence as
 *     unverified and surfaces RE-VERIFY-BEFORE-EXECUTING to the worker.
 * The freshness VERDICT is computed at claim-time, never persisted here — a persisted verdict
 * would itself go stale, which is the defect class this FR closes.
 * @private
 */
function stampPremiseMeasurement(row, logger = console) {
  try {
    if (row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : null;
    if (!payload || !hasInstructionBody(payload)) return;
    const raw = payload.premise_measured_at;
    if (raw == null) {
      logger && logger.warn && logger.warn('[dispatch] WORK_ASSIGNMENT carries an instruction body with NO premise_measured_at — the worker will be told to RE-VERIFY before executing. If the premise was just measured, stamp the MEASUREMENT time (never the send time).');
      return;
    }
    if (!Number.isFinite(Date.parse(raw))) {
      const { premise_measured_at: _dropped, ...rest } = payload;
      row.payload = rest;
      logger && logger.warn && logger.warn(`[dispatch] premise_measured_at ${JSON.stringify(raw)} is unparseable — stripped so the worker treats the premise as UNVERIFIED rather than trusting a garbage stamp.`);
    }
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] premise measurement stamp skipped: ${e.message}`);
  }
}

/**
 * FR-2 (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001) — turn a PREEMPT dispatch to a BUSY seat into
 * a real claim instead of a text notice.
 *
 * THE PROBLEM THIS CLOSES: lib/checkin/steps/resume.cjs returns as soon as a seat holds a live
 * non-terminal claim, ABOVE every acquisition tier. So a directed assignment to a busy seat is only
 * SURFACED as prose (resume.cjs:135-139) and no claim ever lands. Worse, ASSIGNMENT_RECENCY_WINDOW_MS
 * bounds both the resume peek and the directed-assignment pull, so an assignment to a seat that holds
 * its claim past that window ages out of BOTH and becomes permanently invisible.
 *
 * THE MECHANISM: write metadata.release_request onto the SD the seat currently holds. The existing
 * consumer (lib/checkin/steps/release-request.cjs, pipeline position 4.5 — ABOVE resume) honours it
 * at the seat's next boundary, so the seat becomes claim-free BY DESIGN and the ordinary
 * directed-assignment tier then claims the new SD unmodified. No ladder reorder, so rule 7a holds.
 *
 * SCOPED TO PREEMPT ON PURPOSE. An unscoped producer wired to EVERY dispatch would cause routine
 * involuntary releases of in-flight work — the same harm the resume short-circuit exists to prevent,
 * merely one tick later. Routine dispatches keep today's text-surfacing behaviour byte-for-byte.
 * The release itself is still WIP-gated at the consumer (FR-3), so this can never discard work.
 *
 * Fail-soft, like its sibling stamps: any lookup error leaves the dispatch unchanged. Never
 * overwrites an existing release_request (a live one is already pending; re-stamping would reset it).
 * @private
 */
async function stampReleaseRequest(supabase, row, logger = console) {
  try {
    if (row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (payload.preempt !== true) return;          // scoped: preempt/critical only
    if (!row.target_session) return;

    const assignedSd = resolveAssignmentTargetKey(row, { profile: 'dispatchStamp' });
    if (!assignedSd) return;

    const { data: seat } = await supabase
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', row.target_session)
      .maybeSingle();
    const heldSd = seat && seat.sd_key;
    if (!heldSd) return;                            // seat is free — the normal path already works
    if (heldSd === assignedSd) return;              // already holds it; nothing to release

    const { data: held } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata')
      .eq('sd_key', heldSd)
      .maybeSingle();
    if (!held) return;
    if (held.metadata && held.metadata.release_request) return; // one already pending

    await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          ...(held.metadata || {}),
          release_request: {
            requested_by: 'coordinator:preempt_dispatch',
            requested_at: new Date().toISOString(),
            reason: `preempt dispatch of ${assignedSd}`,
            ttl_minutes: 60,
          },
        },
      })
      .eq('id', held.id);

    row.payload = { ...payload, release_requested_on: heldSd };
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] release_request stamp skipped: ${e.message}`);
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
async function stampModelRecommendation(supabase, row, logger = console, mergeMetadataKeysFn = null) {
  try {
    if (row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (payload.model_recommendation) return; // caller already decided
    // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): 'dispatchStamp' profile — same
    // precedence as the inline chain it replaces (assigned_sd -> sd_key -> target_sd).
    const sdKey = resolveAssignmentTargetKey(row, { profile: 'dispatchStamp' });
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
    // QF-20260720-597: this used to read sd.metadata, spread it whole, and full-blob
    // .update({ metadata: {...} }) — a TOCTOU race that silently RESURRECTS a hold flag
    // (needs_coordinator_review / requires_human_action) a concurrent coordinator clear
    // already flipped false between this read and this write. mergeMetadataKeys() writes
    // ONLY model_tier_decisions via an atomic JSONB `||` merge, touching no other key.
    try {
      const existing = Array.isArray(sd.metadata && sd.metadata.model_tier_decisions) ? sd.metadata.model_tier_decisions : [];
      const entry = { at: new Date().toISOString(), criterion: rec.criterion, tier: rec.tier, reason: rec.reason, dispatch_row_id: row.id || null };
      const trimmed = [...existing, entry].slice(-MODEL_TIER_DECISIONS_CAP);
      const mergeFn = mergeMetadataKeysFn || (await import('./safe-metadata-merge.mjs')).mergeMetadataKeys;
      await mergeFn(sdKey, { model_tier_decisions: trimmed });
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
/**
 * QF-20260719-662: WORK_ASSIGNMENT must target a FLEET WORKER, never a role singleton.
 * Live incident 17:08Z: WORK_ASSIGNMENT b8eb6111 dispatched to Adam's session inserted
 * cleanly (assertValidTarget vets aliveness, not role) and sat invisible to every claim
 * path — Adam's drain excludes work_assignment handling. Reuses the CANONICAL claim-side
 * predicate lib/claim/build-forbidden-session.cjs isBuildForbiddenSession (non_fleet /
 * role=adam / is_coordinator) — this is exactly the "symmetric guard" that module's
 * header anticipated; never a second hand-rolled role list. Fail-OPEN on lookup faults
 * and sentinel/unknown targets; fail-CLOSED only on a CONFIRMED non-fleet target —
 * the same posture as assertWorkerTierAllowed at this choke.
 * @private
 */
/**
 * Refuse an unauthorized fleet kill-switch row at the choke.
 * SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-2 / SECURITY condition C1.
 *
 * WHY THIS IS AT THE CHOKE AND NOT LEFT TO THE WRITER. "Only the governed writer may produce this
 * row" cannot be enforced by a provenance marker — any raw caller can copy a marker. The only
 * enforceable reading is that the AUTHORIZATION ITSELF is checked here, so it holds no matter who
 * calls. Before this, kill-switch-writer.cjs was advisory: it refused unauthorized callers who chose
 * to use it, while a direct insertCoordinationRow call with a kill payload sailed through.
 *
 * WHY IT FAILS CLOSED, unlike its siblings at this choke. assertFleetAssignmentTarget and
 * assertWorkerTierAllowed fail OPEN on lookup faults, because a misrouted work assignment is
 * recoverable and a dispatch outage is worse. The opposite holds here: refusing a legitimate kill
 * switch costs one retry by an operator who is present and watching, while admitting a forged one
 * disables a fleet-wide safety enforcement for every seat. A control primitive is exactly the case
 * where "fail open so we never block" is the wrong instinct.
 *
 * The authorization decision is IMPORTED from kill-switch-writer.cjs rather than restated, so the
 * choke and the writer cannot drift into disagreeing about who may fire the switch. (No cycle: the
 * writer takes insertCoordinationRow as an injected dependency and never requires this module.)
 * @private
 */
async function assertKillSwitchAuthorized(supabase, row, logger = console) {
  const payload = (row && row.payload) || {};
  const { KILL_SWITCH_KIND, evaluateActor, defaultResolveActiveCoordinator } = require('./kill-switch-writer.cjs');
  if (payload.kind !== KILL_SWITCH_KIND) return;

  const fail = (detail, code) => {
    const e = new Error(
      `[dispatch] REFUSED fleet kill switch: ${detail}. This row disables a fleet-wide safety `
      + 'enforcement for every seat; it must be produced through lib/coordinator/kill-switch-writer.cjs '
      + 'by the ACTIVE COORDINATOR, with an actor and a reason.',
    );
    e.code = code || 'DISPATCH_KILL_SWITCH_UNAUTHORIZED';
    throw e;
  };

  if (!payload.actor || !String(payload.actor).trim()) fail('no actor on the payload', 'DISPATCH_KILL_SWITCH_NO_ACTOR');
  if (!payload.reason || !String(payload.reason).trim()) fail('no reason on the payload', 'DISPATCH_KILL_SWITCH_NO_REASON');

  let session = null;
  let activeId = null;
  try {
    activeId = await defaultResolveActiveCoordinator(supabase);
    const { data } = await supabase
      .from('claude_sessions')
      .select('session_id, status, heartbeat_at, metadata')
      .eq('session_id', String(payload.actor).trim())
      .maybeSingle();
    session = data || null;
  } catch (e) {
    // Even a lookup fault refuses here — see the fail-closed rationale above. Logged so an operator
    // can tell "refused because unauthorized" from "refused because I could not check".
    logger && logger.warn && logger.warn(`[dispatch] kill-switch authorization could not be established: ${e.message}`);
    fail(`authorization could not be established (${e.message})`, 'DISPATCH_KILL_SWITCH_UNVERIFIABLE');
  }

  const verdict = evaluateActor(session, Date.now(), activeId);
  if (!verdict.ok) fail(verdict.detail, `DISPATCH_KILL_SWITCH_${verdict.code}`);
}

async function assertFleetAssignmentTarget(supabase, row, logger = console) {
  try {
    if (!row || row.message_type !== 'WORK_ASSIGNMENT') return;
    const { data: sess } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', row.target_session)
      .maybeSingle();
    if (!sess) return; // sentinel/unknown target -> fail-open (assertValidTarget already vetted real ones)
    const { isBuildForbiddenSession } = require('../claim/build-forbidden-session.cjs');
    if (isBuildForbiddenSession(sess.metadata)) {
      const md = sess.metadata || {};
      const why = md.is_coordinator === true ? 'is_coordinator' : (md.role ? `role=${md.role}` : 'non_fleet');
      const e = new Error(
        `[dispatch] REFUSED WORK_ASSIGNMENT: target ${String(row.target_session).slice(0, 8)} is a non-fleet `
        + `role singleton (${why}) — its drain never claims work_assignment rows, so the assignment would sit `
        + `invisible to every claim path (incident b8eb6111). Dispatch to a fleet worker instead.`
      );
      e.code = 'DISPATCH_NON_FLEET_TARGET';
      throw e;
    }
  } catch (e) {
    if (e && e.code === 'DISPATCH_NON_FLEET_TARGET') throw e; // fail CLOSED on a confirmed violation
    logger && logger.warn && logger.warn(`[dispatch] fleet-target check skipped (fail-open): ${e.message}`);
  }
}

async function assertWorkerTierAllowed(supabase, row, logger = console) {
  try {
    if (!row || row.message_type !== 'WORK_ASSIGNMENT') return;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): 'dispatchStamp' profile — same
    // precedence as the inline chain it replaces (assigned_sd -> sd_key -> target_sd).
    const sdKey = resolveAssignmentTargetKey(row, { profile: 'dispatchStamp' });
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
    // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1): 'dispatchStamp' profile — same
    // precedence as the inline chain it replaces (assigned_sd -> sd_key -> target_sd).
    const sdKey = resolveAssignmentTargetKey(row, { profile: 'dispatchStamp' });
    if (!sdKey || /^QF-/.test(sdKey)) return; // QFs are tier-1/2 by construction (two_way-shaped)

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .maybeSingle();
    const doorClass = sd && sd.metadata && sd.metadata.door_class;
    const door = doorClass && typeof doorClass === 'object' ? doorClass.door : null;
    if (door !== DOORS.ONE_WAY && door !== DOORS.TWO_WAY) return; // unstamped -> fail-open

    const { ladderTopRank, resolveWorkerTierRank, declaredSeatFamily } = require('../fleet/tier-ladder.cjs');
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
    // SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-3: `declaredRaw` stays the verbatim
    // stored value (diagnostics + ledger provenance), while every ROUTING decision
    // below keys off `declared`, the resolved FAMILY. These used to be the same
    // string only because the check-in writer coarsened the model to a bare family
    // before storing it; now that the exact API id is persisted, an exact-match on
    // 'fable' would refuse a genuine 'claude-fable-5' seat and an exact-match against
    // DELEGATE_TIERS would silently demote 'claude-opus-5[1m]' to sonnet.
    // declaredSeatFamily prefers metadata.model_family and falls back to resolving
    // the family out of metadata.model for rows written before this SD. It returns
    // null for an id naming no known family, so the fail-CLOSED behavior below is
    // preserved exactly — only the field being compared changed, never the direction.
    const declaredRaw = sess.metadata && typeof sess.metadata.model === 'string'
      ? sess.metadata.model.toLowerCase().trim() : null;
    const declared = declaredSeatFamily(sess.metadata);

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
          + `Target worker's declared model is '${declaredRaw || 'UNDECLARED'}' (resolved family: `
          + `'${declared || 'UNRESOLVED'}'; exclusivity fails CLOSED on unknown). `
          + `Irreversible work never delegates; it waits for a fable session.`
        );
        e.code = 'DISPATCH_ONE_WAY_DOOR';
        throw e;
      }
      // Ledger the EXACT stored id, not the resolved family — this row is the
      // provenance record, and recording 'fable' for a 'claude-fable-5' seat would
      // reproduce in the ledger the very version-blindness this SD removes.
      void writeDoorRoutingLedger(supabase, { work_key: sdKey, door, tier_rank: workerRank, model_id: declaredRaw }, logger);
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
/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-2 — refuse a further answer on a correlation
 * that already carries a terminal disposition.
 *
 * FAIL POSTURE, split deliberately (this file already mixes both, so it must be stated rather than
 * inferred): fail-CLOSED on a genuine disposed-correlation match — that is the whole point — and
 * fail-OPEN on the guard's OWN internal error. A bug in this guard must never block a send.
 *
 * THE THREE EXEMPTIONS ARE LOAD-BEARING. PLAN's review found that this FR as first written was a
 * safety regression no test in the repo would have caught, and each exemption prevents a specific
 * documented failure:
 *
 *  (1) via='cc_originator' — ensureOriginatorCc re-enters THIS SAME choke with THE SAME correlation
 *      AFTER the primary insert. A lock without this exemption refuses that leg, ensureOriginatorCc's
 *      own catch swallows the throw, and main() still prints its success line and exits 0. That is
 *      verbatim QF-20260705-488, the incident where the chairman had to hand-relay a verdict: a
 *      disposition that reports success while its originator never receives it.
 *
 *  (2) correction kinds — a wrong disposition must stay retractable, or this guard permanently
 *      freezes the first verdict written, right or wrong (SD-...-CORRECTION-DELIVERY-PATH-001-C).
 *      Keyed on CORRECTION_KINDS, never on MESSAGE_KINDS — see message-kinds.cjs for why that
 *      distinction is the difference between a working lock and a silently self-exempting one.
 *
 *  (3) in-flight parts — FR-1 makes ordered parts of ONE logical message share a correlation. Without
 *      this, the lock refuses part 2 onward and cancels FR-1 outright. FR-1 and FR-2 genuinely
 *      contradict, and FR-1 yields first; the resolution lives in this predicate, not in prose.
 *
 * @throws {Error} code DISPATCH_CORRELATION_DISPOSED when the correlation is already disposed
 */
/**
 * Is this payload a part of a BOUNDED ordered series?
 *
 * SECURITY sub-agent finding (EXEC review, evidence aa192915), and it was right. The first version of
 * exemption (3) tested only `part_index != null && part_total > 1`, which made the exemption
 * unbounded: any sender could bypass the disposition lock forever, on any correlation, by stamping
 * every message `--part 1/2` — never once using a documented correction path. MAX_PARTS was enforced
 * at the CLI and in buildAdvisoryPayload, but NOT here, and this guard is the security control.
 *
 * That is the same mistake buildAdvisoryPayload's own comment warns about — "a bound checked only at
 * the outermost layer is not a bound" — made one layer further out. The ceiling is re-validated here,
 * at the choke, against the shared MAX_PARTS constant. A malformed or over-wide pair is NOT exempt,
 * so it falls through to the lock rather than past it: the failure direction is refuse, not admit.
 */
function isBoundedSeriesPart(p) {
  if (p.part_index == null || p.part_total == null) return false;
  const pi = Number(p.part_index);
  const pt = Number(p.part_total);
  if (!Number.isInteger(pi) || !Number.isInteger(pt)) return false;
  return pi >= 1 && pt > 1 && pi <= pt && pt <= MAX_PARTS;
}

async function assertCorrelationNotDisposed(supabase, row, logger = console) {
  try {
    const p = row && typeof row.payload === 'object' ? row.payload : null;
    if (!p) return;
    const corr = p.correlation_id;
    if (!corr) return;
    if (p.via === 'cc_originator') return;                         // (1)
    if (CORRECTION_KIND_SET.has(p.message_kind)) return;           // (2)
    if (isBoundedSeriesPart(p)) return;                            // (3)

    const { data, error } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('payload->>correlation_id', String(corr))
      .eq('payload->>message_kind', DISPOSITION_KIND)
      .limit(1);
    // Queried on payload->>, not the bare column: the session_coordination.correlation_id column is
    // populated on 6.5% of rows and written by nothing in the repo, so a column-keyed lookup here
    // would find nothing and the guard would be inert while reading as enforced.
    if (error) {
      logger && logger.warn && logger.warn(`[dispatch] disposition check skipped (fail-open): ${error.message}`);
      return;
    }
    if (Array.isArray(data) && data.length > 0) {
      const err = new Error(`DISPATCH_CORRELATION_DISPOSED: correlation ${corr} already carries a terminal disposition (row ${data[0].id}). Send a retraction/amend/supersede to revise it.`);
      err.code = 'DISPATCH_CORRELATION_DISPOSED';
      throw err;
    }
  } catch (e) {
    if (e && e.code === 'DISPATCH_CORRELATION_DISPOSED') throw e; // fail CLOSED on a confirmed match
    logger && logger.warn && logger.warn(`[dispatch] disposition check skipped (fail-open): ${e.message}`);
  }
}

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
  // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-2): sibling of the guard above — that one
  // refuses a MISTYPED assignment, this one refuses an UNREADABLE one. A WORK_ASSIGNMENT exists
  // solely to carry a target; if no site can resolve one, the row is inert by construction. It
  // inserts cleanly, the worker's directed branch is skipped in silence, and the coordinator
  // reads the non-pickup as worker capacity. Measured: 46 of 121 live assignments were inert,
  // and because the check-in step takes a single unacked assignment, each one shadowed every
  // later good dispatch to that seat.
  //
  // Placed here deliberately — after the type-lint, BEFORE assertValidTarget — so a malformed
  // row costs no DB round-trip.
  //
  // OBSERVE-ONLY BY DEFAULT, per the Observe-Only-First protocol section. A brand-new refusal
  // must not mass-fail in-flight traffic on day one, and there is a concrete calibration
  // question here: 9 of those 46 rows are coordinator PROSE typed as WORK_ASSIGNMENT (subjects
  // like "VOID — DO NOT git stash"). Binding this immediately would start rejecting a live
  // messaging habit. The observe window measures that volume before anything blocks; promotion
  // to binding requires reviewing its output, and is the deliberate decision PLAN flagged.
  // The verdict itself lives in the shared module because this is NOT the only writer —
  // stale-session-sweep.cjs inserts raw by design. One function, two call sites; a second copy
  // of the rule would be this SD's own defect one layer up.
  const unreadable = describeUnreadableAssignment(row);
  if (unreadable) {
    const msg = `[dispatch] WORK_ASSIGNMENT has no resolvable target — ${unreadable.detail}. A worker cannot claim this row; it would insert cleanly and be skipped in silence.`;
    if (isAssignmentTargetGuardBinding()) {
      const e = new Error(msg + ' Refusing (DISPATCH_ASSIGNMENT_TARGET_UNRESOLVABLE).');
      e.code = 'DISPATCH_ASSIGNMENT_TARGET_UNRESOLVABLE';
      e.candidates = unreadable.candidates;
      throw e;
    }
    logger && logger.warn && logger.warn(JSON.stringify({
      event: 'dispatch.assignment_target_unresolvable',
      mode: 'observe_only',
      ambiguous: unreadable.ambiguous,
      candidates: unreadable.candidates,
      payload_keys: unreadable.payloadKeys,
      target_session: row.target_session,
      subject: String(row.subject || '').slice(0, 120),
      detail: unreadable.detail
    }));
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
  // SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 (FR-2 / SECURITY C1): the fleet kill switch is a
  // CONTROL PRIMITIVE on this bus, so its authorization is enforced HERE rather than trusted to the
  // caller. Without this, kill-switch-writer.cjs was advisory: a lint-legal raw call to this choke
  // still wrote an unauthorized, unattributed kill row, which is the exact hole FR-2 exists to close.
  //
  // ORDERED BEFORE assertValidTarget DELIBERATELY. An unauthorized attempt to disable fleet-wide
  // enforcement is a more important thing to surface than a malformed target, so it must not be
  // masked by a shape error. I placed it AFTER on the first pass and a behavioural probe showed the
  // consequence: every kill row died on DISPATCH_TARGET_INVALID first, so the guard could never fire
  // — a guard sitting behind a check that rejects everything it guards, which is the exact defect
  // class this SD exists to remove. Found by running the real path; the unit tests could not see it
  // because they call the guard's inputs directly.
  await assertKillSwitchAuthorized(supabase, row, logger);
  await assertValidTarget(supabase, row.target_session, logger);
  // QF-20260719-662: refuse WORK_ASSIGNMENT to a non-fleet role singleton (Adam/Solomon/coordinator).
  // assertValidTarget checks aliveness but not ROLE, so an assignment to a propose-only session
  // inserted cleanly and sat invisible to every claim path (live incident b8eb6111 → Adam c514430f).
  await assertFleetAssignmentTarget(supabase, row, logger);
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
  // SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001 (FR-2): a PREEMPT dispatch to a BUSY seat writes a
  // release_request on the SD that seat holds, so the existing position-4.5 consumer frees the seat
  // at its next boundary and the ordinary directed-assignment tier can actually claim. Without this
  // the dispatch is only prose and, past the recency window, vanishes entirely. Preempt-scoped and
  // fail-soft; routine dispatches are byte-identical to before.
  await stampReleaseRequest(supabase, row, logger);
  // SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3): premise-measurement normalization for
  // instruction-carrying WORK_ASSIGNMENTs — strips an unparseable premise_measured_at (absent
  // reads as UNVERIFIED at claim-time, garbage must not read as anything) and warns when an
  // instruction body ships with no measurement stamp. NEVER defaults the stamp to send time.
  stampPremiseMeasurement(row, logger);
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
  // payload.kind absent from that role's recognized set. Callers that know their target's role
  // statically pass opts.targetRoleHint (e.g. adam-advisory `--to solomon` → 'solomon') so a
  // UUID target needs no identity lookup.
  // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B / FR-3: repointed onto the registry-reader
  // (lib/fleet/drain-set-registry.js) instead of reading worker-status.cjs's DRAIN_SETS
  // constant directly. WARN behavior is UNCHANGED — the registry-reader fails open to that
  // same DRAIN_SETS constant while role_drain_sets remains unapplied (STAGED).
  try {
    const kind = row.payload && typeof row.payload === 'object' ? row.payload.kind : null;
    if (kind) {
      const targetRole = await resolveTargetRole(supabase, row.target_session, opts.targetRoleHint);
      const { warnIfUndrainedKindViaRegistry } = await import('../fleet/drain-set-registry.js');
      await warnIfUndrainedKindViaRegistry({ supabase, targetRole, kind, log: (logger && logger.warn) || console.warn });
    }
  } catch (e) {
    logger && logger.warn && logger.warn(`[dispatch] target-drain check skipped (fail-open): ${e.message}`);
  }
  // QF-20260724-635: mirror payload.body into the top-level body column when the caller only
  // set payload.body -- readers of session_coordination.body (e.g. Adam's inbox) get NULL
  // otherwise, rendering coordinator->Adam sends body-empty. Fill-if-absent, never overwrites
  // a caller-supplied top-level body (same precedent as the correlation_id/sender_type stamps
  // above).
  if (row.body == null && row.payload && typeof row.payload === 'object' && row.payload.body != null) {
    row.body = row.payload.body;
  }
  // QF-20260728-246: mirror the OTHER direction too -- row.body into payload.body when the
  // caller only set the top-level column. Coordinator-side senders (identity updates,
  // [COORD->ADAM] sends, hourly reviews, status-or-release audits) commonly set only row.body;
  // any reader keyed on payload.body (e.g. the coordinator's own redelivery path) got silently
  // empty rows (measured live: 58/90 recent sender_type='coordinator' rows were body-column-only).
  // Same fill-if-absent precedent as the mirror above, opposite direction.
  if (row.body != null && row.payload && typeof row.payload === 'object' && row.payload.body == null) {
    row.payload = { ...row.payload, body: row.body };
  }
  // QF-20260728-246: mirror payload.correlation_id into the top-level correlation_id column
  // (fill-if-absent). Every sender already treats payload.correlation_id as canonical (measured
  // live: 5207/5224 rows carry it there and nowhere else), so the column is effectively dead --
  // a reader keyed on it misses nearly the entire table. Never overwrites a caller-supplied
  // column value.
  if (row.correlation_id == null && row.payload && typeof row.payload === 'object' && row.payload.correlation_id != null) {
    row.correlation_id = row.payload.correlation_id;
  }
  // FR-2: the LAST guard before the write. Placed at the shared choke so both senders and every
  // other caller inherit it — a per-sender check would leave the other sender unguarded.
  await assertCorrelationNotDisposed(supabase, row, logger);
  let q = supabase.from('session_coordination').insert(row);
  if (select) {
    q = q.select(select);
    if (single) q = q.single();
  }
  const res = await q;
  // QF-20260725-367: FAIL LOUDLY ON AN ENUM VIOLATION, matching this function's own precedent.
  // THE ASYMMETRY WAS THE DEFECT, NOT THE TYPO: fed an unknown TARGET this helper already throws
  // DISPATCH_TARGET_UNKNOWN and names the problem exactly; fed an invalid message_type it returned
  // id=null, threw nothing, and inserted nothing. Three FENCE_NOTICE sends were silently discarded
  // — and one of them was the re-send of a PR merge HOLD, i.e. the safety mechanism was itself the
  // lost payload. The underlying Postgres error is perfectly clear ("invalid input value for enum
  // coordination_message_type"); this helper was swallowing a real error, not failing to produce one.
  //
  // WHY THE MISTAKE IS NATURAL AND WILL RECUR: fence_notice IS legitimate — as a payload.kind (it is
  // in DIRECTIVE_KINDS) — but NOT as a message_type. The two fields accept different vocabularies and
  // share plausible names, so only the silence makes it undetectable.
  //
  // THE CLASS, named so it is recognisable elsewhere: A FAILURE THAT RETURNS EMPTY-OR-NULL INSTEAD OF
  // RAISING IS INDISTINGUISHABLE FROM A LEGITIMATE EMPTY RESULT, so it is found only by someone who
  // independently verifies. This one was caught solely because the coordinator reads rows back after
  // sending. The same class bit PostgREST selects naming a nonexistent column, where the query errors,
  // the caller reads data as empty, and a false negative is reported with confidence.
  //
  // Deliberately scoped to the enum-violation class rather than throwing on every insert error, so
  // callers that legitimately inspect {data, error} for transient faults keep today's behaviour.
  if (res && res.error && /invalid input value for enum/i.test(res.error.message || '')) {
    const e = new Error(
      `[dispatch] session_coordination insert REFUSED — ${res.error.message}. `
      + `(message_type='${row.message_type}'; note that a value like 'fence_notice' is a valid payload.kind but NOT a valid message_type — the two fields take different vocabularies.) `
      + `Previously this returned id=null and dropped the row silently.`
    );
    e.code = 'DISPATCH_INVALID_MESSAGE_TYPE';
    e.cause = res.error;
    throw e;
  }
  return res;
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
  stampReleaseRequest, // SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001 FR-2 — exported for unit fixtures
  stampPremiseMeasurement, // SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-3 — exported for unit fixtures
  isTerminalSdStatus,
  isTerminalQfStatus,
  assertSdDispatchable,
  assertFleetAssignmentTarget, // QF-20260719-662 — exported for the choke-guard unit fixtures
  assertWorkerTierAllowed,
  assertDoorRoutingAllowed, // SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 — exported for TS-3/TS-5 fixtures
  assertCorrelationNotDisposed, // SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 FR-2 — exported for the choke-guard fixtures
};
