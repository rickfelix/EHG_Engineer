#!/usr/bin/env node
/**
 * Worker check-in handshake (worker-PULL, first-class + deterministic)
 * SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-2
 *
 * THE single worker check-in verb. One idempotent handshake that ALWAYS
 * resolves to exactly one action and NEVER asks the human:
 *
 *   1. resolve the active coordinator (lib/coordinator/resolve.cjs)
 *   2. confirm callsign (coordinator-push; reported, not demanded)
 *   3. register availability via session_coordination payload.kind=roll_call
 *      (NOT payload.signal_type — stays OFF the friction channel)  [idempotent]
 *   4. if already claiming an SD -> action=resume
 *   5. else pull a pending WORK_ASSIGNMENT and claim it via the claim_sd RPC
 *      -> action=claimed_assignment
 *   6. else self-claim the top of the sd:next queue (v_sd_next_candidates)
 *      -> action=self_claimed
 *   7. else -> action=idle (the /checkin skill then calls ScheduleWakeup; that
 *      is a HARNESS tool, NOT Node-callable, so we only RECOMMEND it here)
 *
 * Output is a single JSON object (parsed by the /checkin skill). The CLI never
 * reads stdin and never blocks on input — fail-open at every step.
 *
 * Usage: node scripts/worker-checkin.cjs            (CLAUDE_SESSION_ID from env)
 *        node scripts/worker-checkin.cjs --json      (same; JSON is the default)
 *        node scripts/worker-checkin.cjs --model <haiku|sonnet|opus|fable> --effort <low|medium|high|xhigh>
 *          (SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B FR-3: self-report model/effort at
 *          check-in; merged into claude_sessions.metadata and used to derive tier_rank for
 *          THIS check-in call. No-op — byte-identical to today — when both flags are absent.
 *          A chairman/coordinator-set metadata.effort_source='chairman' always wins over a
 *          worker's own --effort self-report.)
 */

const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { getCommsActivitySignals, computeAdaptiveCadence } = require('../lib/coordinator/adaptive-comms-cadence.cjs');
// SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-3c): canonical session_coordination insert
// choke point — routes both raw insert call sites below through the same validated path the
// coordinator's dispatch code uses (target-session validation; no-op for non-WORK_ASSIGNMENT rows).
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const ws = require('../lib/fleet/worker-status.cjs');
const { stampClaim } = require('../lib/fleet/claim-stamp.cjs');
// SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001: acquisition-time guard so a propose-only
// (non_fleet/role=adam) session never self-claims a build SD — the shared predicate
// the ESM claim-validity gate also uses (one source; no asymmetry).
const { isBuildForbiddenSession } = require('../lib/claim/build-forbidden-session.cjs');
const { ensureActiveBaseline } = require('../lib/fleet/ensure-active-baseline.cjs');
// SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: shared dispatch-eligibility predicate, also used by
// scripts/stale-session-sweep.cjs CLAIM_FIX (closes the self_claim-vs-sweep writer-consumer-asymmetry).
const { draftDepsSatisfied, baselinedCandidateEligible, classifyDispatchIneligibility, coordinatorReservation, isSeatBusyOnDirectedWork, parentLeadPending, liveClaimWriteFenceReason } = require('../lib/fleet/claim-eligibility.cjs');
// SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: canonical chairman-gated-hold predicate (shared
// with sd-next data-loaders + the coordinator dashboard so the sites can never drift).
const { isChairmanGatedQF } = require('../lib/fleet/qf-gated-hold.cjs');
// SD-ARCH-HOTSPOT-SD-START-001 FR-2: the CONVERGED dependency gate shared with scripts/sd-start.js
// (one resolution truth — deps array shapes + blocked_on_sd fold + sd_key-OR-id lookup). This
// consumer applies its native FAIL-CLOSED polarity via depsSatisfiedFromVerdict: skip on
// blocking, unresolved, AND query error — the exact draftDepsSatisfied semantics it replaces
// (with uuid-shaped refs now RESOLVING instead of dangling, a resolution-accuracy fix only).
const { evaluateClaimDependencyGate, depsSatisfiedFromVerdict } = require('../lib/claim/gates/dependency-gate.cjs');
// SD-ARCH-HOTSPOT-SD-START-001 FR-7: the SD-2 phase-1 dispatch-authorization polarity flip,
// flag-gated (two-flag ladder, absent=off=byte-identical) + OBSERVE-ONLY first. Wired on the
// SELF-CLAIM lane only (orphan-adopt + directed WORK_ASSIGNMENT are documented exemptions —
// coordinator-initiated lanes carry their own authorization; the phase-2 enforcement surface).
const dispatchAuth = require('../lib/claim/gates/dispatch-authorization.cjs');
// Resolve the mode ONCE per CLI pass (one-shot process) — prospective-testing D8.
let _dispatchAuthModePromise = null;
function getDispatchAuthMode() {
  if (!_dispatchAuthModePromise) _dispatchAuthModePromise = dispatchAuth.resolveDispatchAuthMode();
  return _dispatchAuthModePromise;
}
// SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3): WORK-DOWN-NEVER-UP on the PULL path.
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3): --model/--effort capture at check-in.
const { resolveWorkerTierRank, isTieringActive, normalizeModel, normalizeEffort, rankForModelEffort, ladderTopRank } = require('../lib/fleet/tier-ladder.cjs');
// SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): tier-aware "claimable-to-MY-rung" rollup.
const { claimableForTier, claimableForRepo } = require('../lib/fleet/tier-claimable.cjs');
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): backlog-gated downward claims. The fetcher is
// SHARED with lib/coordinator/dispatch.cjs's assertWorkerTierAllowed so the pull path (here) and
// the directed-dispatch path compute an IDENTICAL backlog verdict — never two re-derivations.
const { fetchLowerTierBacklogData, fetchFableWindowActive } = require('../lib/fleet/tier-backlog.cjs');
// SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: reuse the coordinator cron's pool + picker + ghost guard so
// check-in-time self-assign and the 5-min cron allocate identities identically (see assignFleetIdentityAtCheckin).
const { NATO, COLORS, nextAvailable, isTestSessionId, tierRankOf, pickCallsignForTier, callsignInTierBand } = require('./assign-fleet-identities.cjs');
// SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-3): stealer-side guard. The raw
// v_active_sessions.is_alive flag FREEZES stale between short-lived CLI invocations (each
// handoff.js/sd-start.js call starts+stops its own heartbeat interval) -- isSessionAlive() is
// the read-time liveness SSOT (also checks live OS PID via terminal_id, which stays accurate
// across those gaps). hasWip() is the belt-and-suspenders half: even a genuinely lapsed-TTL
// claim must not be stolen while the prior claimant still has real, unmerged work.
const { isSessionAlive } = require('../lib/fleet/session-liveness.cjs');
const { hasWip } = require('../lib/claim/wip-detector.cjs');
const { checkQfMoot, cancelMootQf } = require('../lib/fleet/retro-qf-moot-check.cjs');
// SD-ARCH-HOTSPOT-CHECKIN-001: resolveCheckin's rung ladder is now an explicit step pipeline.
// Steps live in lib/checkin/steps/ (VERBATIM moves of the former inline rungs) and receive their
// dependencies via ctx.helpers (CHECKIN_HELPERS below) — steps never require this file (circular).
const { runSteps } = require('../lib/checkin/pipeline.cjs');
const CHECKIN_STEPS = require('../lib/checkin/steps/index.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 3 — warn-only cap tripwire
// (mirrors scripts/fleet-dashboard.cjs). A read returning EXACTLY the PostgREST cap
// (1000; canonical constant POSTGREST_MAX_ROWS in lib/db/fetch-all-paginated.mjs — ESM,
// not require()-able here) is presumed silently truncated. Every other .select in this
// file is window-bounded by design (.limit(N<=100) with deterministic .order, a small
// .in() key list, or an .eq-single-row mutation predicate) — see
// scripts/audit/count-truncation-overrides.json for the per-site ledger. The one
// genuinely-unbounded read (the fleet-identity used-set seed in
// assignFleetIdentityAtCheckin) is NOT paginated: the chainable test stubs pinning that
// helper (worker-checkin-fleet-identity / -callsign-collision-fix / -metadata-race
// tests) have no .order()/.range() (the same constraint documented at
// stale-session-sweep.cjs:1015), the live-5-min-heartbeat session set is operationally
// tiny (~fleet size), and its worst truncation outcome (a duplicate callsign pick) is
// healed by the 5-min dedupeAssignedCallsigns cron pass by design — so it warns loud
// and proceeds fail-open instead.
function warnIfCapTruncated(rows, site) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 1000) {
    console.warn(`⚠️  [count-discipline] ${site}: fetch returned exactly 1000 rows (PostgREST cap) — result may be silently truncated`);
  }
  return list;
}

const ROLL_CALL_TTL_MS = 60 * 60 * 1000;     // availability row lives 1h
const ROLL_CALL_DEDUP_MS = 5 * 60 * 1000;    // don't re-register within 5m (idempotency)
// SD-LEO-INFRA-LOOP-RESUME-DELAY-SHORTEN-001: shortened from 1200 (20m) to 600 (10m) so a
// finished idle worker re-engages its /loop ~2x faster and the fleet stops looking idle.
// Trade-off: idle workers re-check roughly twice as often, a modest increase in /checkin DB
// chatter — but each idle check is a cheap idempotent roll_call (5m dedup), so the cost is
// small. NOT applied to the propose-only idle branch below, which keeps its own 1200 literal.
const DEFAULT_IDLE_WAKEUP_SECONDS = 600;      // ~10m, matches the tightened fleet idle cadence

// QF-20260703-476: bounded lookback for a "consumed but unactioned" WORK_ASSIGNMENT re-pull.
// A row can get read_at stamped by some other delivery path (poll, prior session) without ever
// being genuinely actioned (acknowledged_at still NULL, no claim recorded) -- an unreadOnly pull
// then hides it from the claim step forever. Bounding the re-pull to 24h avoids resurrecting a
// truly ancient, abandoned assignment while covering the observed hours-long stuck window.
const ASSIGNMENT_RECENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

// QF-20260703-780: closed allowlist of claim_sd RPC errors that mean "this target is
// PERMANENTLY unclaimable" (as opposed to a transient/retryable conflict like
// claimed_by_live_peer). The terminal/fitness pre-checks above only resolve
// strategic_directives_v2, so a QF-keyed or phantom/typo'd-SD-keyed WORK_ASSIGNMENT skips
// both purge branches and falls through here -- if the RPC itself then reports a terminal
// verdict, the message must still be acked or it re-fires every tick forever. CLOSED
// allowlist (never a denylist): claim_sd has gained new transient codes across recent
// migrations, and an unrecognized error must fail safe to "retry", not "silently purge".
const TERMINAL_CLAIM_ERRORS = new Set(['sd_terminal_status', 'sd_not_found']);

// SD-LEO-INFRA-WORKER-ANTI-PREMATURE-WINDDOWN-001 (Mode B, the DOMINANT wind-down failure 3/4):
// the enforceable lever. When a worker holds/just-claimed RANKED claimable work, this directive
// rides the check-in payload to kill the false "drained" feeling with data and to surface — AT the
// wind-down decision point — CLAUDE.md's already-FORBIDDEN non-pause-triggers. RELEASING claimable
// ranked work is NOT a valid wind-down; a too-large/design-heavy SD is DECOMPOSED (orchestrator
// path), never released; only a GENUINELY-BLOCKED SD may be deferred WITH A LOGGED REASON (the
// guardrail that preserves legitimate defer — e.g. a verified spec-conflict, never "scope/context").
function antiWinddownDirective(beltRankedClaimable) {
  const n = Number.isFinite(beltRankedClaimable) ? beltRankedClaimable : null;
  const depth = n && n > 0 ? `The belt has ${n} ranked claimable SD(s).` : 'You hold ranked claimable work.';
  return `ANTI-WIND-DOWN (Mode B): ${depth} Releasing claimable RANKED work to wind down is FORBIDDEN — "scope size / design-heaviness / chairman-gated / context length / session-tail / felt drained" are CLAUDE.md's explicitly-forbidden non-pause-triggers, NOT reasons to release. Build this SD; if it is too large/design-heavy, DECOMPOSE it into children (orchestrator path) — do not release. Only a GENUINELY-BLOCKED SD may be deferred, and only with a logged blocker reason (e.g. a verified spec-conflict). Otherwise keep working.`;
}
const SELF_CLAIM_CANDIDATE_LIMIT = 5;
const QF_CANDIDATE_LIMIT = 100;              // open quick_fixes to consider for self-claim
// QF-20260704-602 (groom addendum leg 2): severity rank for the self-claim picker sort.
// Unranked/unknown severities sort last (below 'low'), never ahead of a ranked item.
const QF_SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Pure: stable-sort open QFs so higher severity always comes first (critical > high >
 * medium > low > unranked), then by created_at ascending within the same severity.
 * Fixes the "medium self-claimed while a critical sat beside it" specimen (717/726) —
 * the picker was previously unordered by severity, purely filing-order (created_at).
 */
function sortQfCandidatesBySeverity(qfs) {
  return (qfs || []).slice().sort((a, b) => {
    const rankA = QF_SEVERITY_RANK[a?.severity] ?? 99;
    const rankB = QF_SEVERITY_RANK[b?.severity] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return Date.parse(a?.created_at || 0) - Date.parse(b?.created_at || 0);
  });
}
// QF-20260704-244 (leg 3 of the QF-lane fix family; legs 1-2 = QF-20260704-602): a CRITICAL
// open QF outranks SD self-claim, but tightly fenced against reverse starvation of the SD
// belt -- only 'critical' jumps (high/medium/low keep the existing SD-first order), only
// after sitting open long enough to give directed dispatch (leg 1) a chance to route it
// first, and at most ONE consecutive jump per worker (claude_sessions.metadata.
// last_claim_was_qf_jump gates the NEXT pull, not this one -- see isCriticalQfJumpEligible /
// the step-6-minus-1 block in runCheckin).
const CRITICAL_QF_JUMP_GRACE_MS = 10 * 60 * 1000;

/** Pure: is this QF eligible to jump ahead of SD self-claim (severity=critical, aged past grace)? */
function isCriticalQfJumpEligible(qf, nowMs) {
  if (!isAutoStartableQF(qf, nowMs)) return false;
  if (qf.severity !== 'critical') return false;
  const created = Date.parse(qf.created_at);
  if (!Number.isFinite(created)) return false;
  return (nowMs - created) >= CRITICAL_QF_JUMP_GRACE_MS;
}

const STALE_QF_DAYS = Number(process.env.SD_NEXT_QF_STALE_DAYS) || 3;  // verify-first freshness boundary (shared with sd-next display)
// SD-LEO-FEAT-WORKER-CHECKIN-SELF-001 (FR-2): gap before confirmRowGone's confirming read so it lands
// genuinely later than the first (defends a momentary stale-replica null). Env-overridable; tests set 0.
const CONFIRM_DELETE_GAP_MS = process.env.CHECKIN_CONFIRM_GAP_MS != null ? Number(process.env.CHECKIN_CONFIRM_GAP_MS) : 250;

// SD-REFILL-00BCYOYW: session-level self-claim opt-out. A long-lived WINDING-DOWN worker whose
// /loop directive declines reserved/staged/large/peer-owned SDs otherwise re-grabs the sd:next top
// every pass then releases it — a claim->release churn that makes a FRESH session briefly see the
// SD as CLAIMED and skip the reserved-pickup. A session marked metadata.self_claim===false (or
// metadata.availability==='idle_only') still does roll_call, resumes its own claim, honors directed
// WORK_ASSIGNMENTs and recovers its own stranded/orphaned work — but SKIPS the self_claim-from-
// sd:next path. STRICT: only `self_claim===false` or `availability==='idle_only'` disable it; any
// other/absent value leaves self-claim ENABLED (fail-toward-active — never silently park a worker).
function isSelfClaimDisabled(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  // SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001 FR-1: a coordinator can halt a SPECIFIC worker by
  // writing metadata.coordinator_stand_down===true to that worker's session (without the worker
  // self-setting). STRICT: only the explicit `true` disables — fail-toward-active for any other value.
  // SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 FR-4: an UNCLEARED probe quarantine (set by the sweep on a
  // prompt-blocked window) also disables self-claim. Availability control only — roll_call, resume
  // and directed WORK_ASSIGNMENTs stay honored. selfClearQuarantine (runCheckin step 2c-2) stamps
  // cleared_at BEFORE this gate is consulted, so a recovered window re-enters in the same pass.
  return metadata.self_claim === false
    || metadata.availability === 'idle_only'
    || metadata.coordinator_stand_down === true
    || isQuarantined(metadata)
    || isParked(metadata);
}

// SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 FR-4: pure — uncleared probe quarantine present?
function isQuarantined(metadata) {
  const q = metadata && typeof metadata === 'object' ? metadata.quarantine : null;
  return !!(q && typeof q === 'object' && !q.cleared_at);
}

// QF-20260705-347: durable PARK marker — the coordinator stamps metadata.parked_until (ISO)
// at park time and clears it at resume; a prose park-order WA alone is message-deaf (a parked
// session isn't reading anything). Availability control only — roll_call, resume and directed
// WORK_ASSIGNMENTs stay honored, same contract as the other isSelfClaimDisabled sub-checks.
function isParked(metadata) {
  const until = metadata && typeof metadata === 'object' && metadata.parked_until
    ? Date.parse(metadata.parked_until) : NaN;
  return Number.isFinite(until) && until > Date.now();
}

/**
 * SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 FR-4: self-clear an uncleared quarantine at checkin.
 * A checkin reaching the DB is BY DEFINITION resumed tool activity — the checkin's own Bash
 * call fired PostToolUse and moved last_tool_at — so no separate activity re-verification is
 * needed. The quarantine object is retained (cleared_at stamped) for history, never deleted.
 * Read-modify-write on FRESH metadata (QF-20260703-314 pattern) so concurrent identity/effort
 * writers aren't clobbered. Returns the metadata the caller should proceed with. Never throws.
 */
async function selfClearQuarantine(sb, sessionId, sessionMetadata) {
  try {
    if (!isQuarantined(sessionMetadata)) return sessionMetadata;
    const { data: freshRow } = await sb.from('claude_sessions')
      .select('metadata').eq('session_id', sessionId).maybeSingle();
    const freshMeta = (freshRow && freshRow.metadata) || sessionMetadata || {};
    if (!isQuarantined(freshMeta)) return freshMeta; // cleared concurrently
    const cleared = {
      ...freshMeta,
      quarantine: { ...freshMeta.quarantine, cleared_at: new Date().toISOString(), cleared_by: 'worker_checkin_self_clear' },
    };
    const { error } = await sb.from('claude_sessions').update({ metadata: cleared }).eq('session_id', sessionId);
    return error ? sessionMetadata : cleared;
  } catch {
    return sessionMetadata; // fail-open: worst case self-claim stays gated one more pass
  }
}

// SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001 FR-2: a coordinator can halt the WHOLE fleet via a
// global stand-down state in the EXISTING system_settings store (no migration). Honors a dedicated
// FLEET_STAND_DOWN key (mode overnight_reduction|keeper_only|venture_parked) OR the existing
// HARD_HALT_STATUS superset. FAIL-TOWARD-ACTIVE: a missing key, enabled false/absent, or any read
// error returns false (self_claim stays ENABLED) — never park the fleet on a transient DB issue.
async function isGlobalStandDownActive(sb) {
  try {
    const { data, error } = await sb.from('system_settings')
      .select('key, value_json')
      .in('key', ['FLEET_STAND_DOWN', 'HARD_HALT_STATUS']);
    if (error || !Array.isArray(data)) return false;
    return data.some((row) => row && row.value_json && row.value_json.enabled === true);
  } catch {
    return false;
  }
}
// Tier-3 risk keywords (CLAUDE.md Work Item Routing). Auto-self-claim is for small,
// low-risk QFs only. The sd-next display path excludes _escalate via a LIVE re-triage
// (runTriageGate, ESM); a .cjs can't run that pipeline, so we approximate parity with the
// PERSISTED routing_tier PLUS this keyword scan — holding risk-bearing QFs for the
// triage/human path. SD-LEO-INFRA-MAKE-OPEN-QFS-001 (SECURITY re-triage-parity advisory).
const TIER3_RISK_RE = /\b(auth|authentication|authorization|rls|payments?|credentials?|migration|schema|alter\s+table|create\s+table|drop\s+table)\b/i;

const SD_KEY_RE = /SD-[A-Z0-9]+(?:-[A-Z0-9]+)+/;

/**
 * Pure: extract the target SD key from a WORK_ASSIGNMENT row, trying the
 * structured payload first, then the subject/body text. Returns null if none.
 * Exported for unit testing.
 */
function extractSdFromAssignment(msg) {
  if (!msg) return null;
  const p = msg.payload || {};
  if (typeof p.assigned_sd === 'string' && p.assigned_sd) return p.assigned_sd;
  if (typeof p.sd_key === 'string' && p.sd_key) return p.sd_key;
  // QF-20260704-602: some dispatch paths emit a QF-specific directed assignment as
  // payload.qf_id instead of sd_key/assigned_sd (confirmed live on QF-20260704-726's
  // dispatch history: 4 of 6 WORK_ASSIGNMENTs carried ONLY qf_id, so this function
  // returned null and the entire directed-assignment branch below was silently
  // skipped -- no ack, no claim attempt -- until a later redispatch happened to use
  // sd_key instead). claim_sd itself is already QF-aware (p_sd_id LIKE 'QF-%'); the
  // gap was purely in this extraction step.
  if (typeof p.qf_id === 'string' && p.qf_id) return p.qf_id;
  // QF-20260707-650: same bug class, different field-name variant. A directed_dispatch payload
  // sometimes carries the QF key as payload.qf instead of qf_id (confirmed live on
  // QF-20260705-893's redispatch, session_coordination row 2a3cef4b) -- silently skipped this
  // extraction, no ack, no claim attempt, until manually diagnosed.
  if (typeof p.qf === 'string' && p.qf) return p.qf;
  if (Array.isArray(p.available_sds) && p.available_sds.length) return p.available_sds[0];
  // current_sd is what the worker is ALREADY on — only use it as a last resort
  // when nothing else names a target (an assignment can reference the same SD).
  const text = `${msg.subject || ''} ${msg.body || ''} ${p.body || ''}`;
  const m = text.match(SD_KEY_RE);
  if (m) return m[0];
  if (typeof p.current_sd === 'string' && p.current_sd) return p.current_sd;
  return null;
}

// SD-FDBK-FIX-WORKER-CHECK-SURFACES-001 (adversarial-review finding #2): the busy-worker resume
// surface (seam 1) must extract the target ONLY from the STRUCTURED directed fields, NOT the broad
// fallbacks extractSdFromAssignment uses. The stale-session-sweep emits a generic "next work
// available" WORK_ASSIGNMENT to EVERY busy claim-holder with payload {available_sds, current_sd}
// and no assigned_sd/sd_key (available_sds EXCLUDES the worker's own SD). extractSdFromAssignment
// would fall through to available_sds[0] and mislabel that queue pointer as a directed redirect for
// every busy worker (all converging on the same SD). The canonical dispatch resolver
// (lib/coordinator/dispatch.cjs) keys directed intent on payload.assigned_sd || payload.sd_key
// (|| row.target_sd, which getMessagesForSession does not project) — mirror that: directed iff a
// structured assigned_sd/sd_key is present. The generic sweep advisory is consumed elsewhere (the
// idle self-claim path / seam-2's neutral "Available SDs" render), never as a directed assignment.
function extractDirectedSd(msg) {
  if (!msg) return null;
  const p = msg.payload || {};
  if (typeof p.assigned_sd === 'string' && p.assigned_sd) return p.assigned_sd;
  if (typeof p.sd_key === 'string' && p.sd_key) return p.sd_key;
  return null;
}

// QF-20260705-914: an INFORMATIONAL sweep completion nudge ("Next work available when X
// completes") must never reach the step-5 assignment-claim path. Those rows name the
// worker's CURRENT sd in body/payload.current_sd, and extractSdFromAssignment's broad
// fallbacks turned them into a directed claim for the very QF the worker just released —
// a perpetual release->reclaim loop (live: QF-20260704-348, 2 cycles in 90s). The sweep
// now stamps payload.kind='completion_nudge' + informational:true; the subject-literal
// match keeps OLD-shape rows still inside ASSIGNMENT_RECENCY_WINDOW_MS inert too (the
// literal is owned by dispatchWorkAssignmentsIfAllowed in stale-session-sweep.cjs —
// keep the two in sync).
function isInformationalNudge(msg) {
  if (!msg) return false;
  const p = msg.payload || {};
  if (p.kind === 'completion_nudge' || p.informational === true) return true;
  return /^Next work available when /.test(msg.subject || '');
}

async function resolveTrack(sb, sdKey, fallback) {
  if (fallback) return fallback;
  try {
    // SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001: column is sd_id (holds the sd_key string), NOT sd_key.
    const { data } = await sb.from('sd_baseline_items').select('track').eq('sd_id', sdKey).maybeSingle();
    return (data && data.track) || 'STANDALONE';
  } catch {
    return 'STANDALONE';
  }
}

/** Attempt a claim via the canonical claim_sd RPC. Never throws. */
async function tryClaim(sb, sdKey, sessionId, track) {
  try {
    // QF-20260711-272: live coordinator-authority fence check at the claim-WRITE boundary —
    // covers EVERY checkin claim lane (resume_final, orphan-adopt, draft self-claim, directed
    // assignment) with one re-fetch, closing the stale-candidate-row race. Fail-closed.
    const fence = await liveClaimWriteFenceReason(sb, sdKey);
    if (fence) return { ok: false, error: `claim_fenced:${fence}` };
    const p_track = await resolveTrack(sb, sdKey, track);
    const { data, error } = await sb.rpc('claim_sd', { p_sd_id: sdKey, p_session_id: sessionId, p_track });
    if (error) return { ok: false, error: error.message };
    if (data && data.success === false) return { ok: false, error: data.error || 'claim_rejected', owner: data.claimed_by };
    await stampClaim(sb, sdKey, sessionId, 'env'); // fail-soft boundary instrumentation (SD-MAN-INFRA-SAME-TURN-NEXT-001 FR-3); identity always env here (hard-required at entry) — SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Register availability with an idempotent roll_call row. Never throws. */
async function registerRollCall(sb, { sessionId, coordinatorId, callsign, mySd }) {
  try {
    const C = ws.SESSION_COORDINATION_COLUMNS;
    const sinceIso = new Date(Date.now() - ROLL_CALL_DEDUP_MS).toISOString();
    const { data: recent } = await sb
      .from('session_coordination')
      .select(`${C.id}, ${C.createdAt}, ${C.payload}`)
      .eq(C.senderSession, sessionId)
      .gte(C.createdAt, sinceIso)
      .order(C.createdAt, { ascending: false })
      .limit(5);
    const dup = (recent || []).find(r => r.payload && r.payload.kind === ws.PAYLOAD_KINDS.ROLL_CALL);
    if (dup) return { id: dup.id, deduped: true };

    const payload = {
      kind: ws.PAYLOAD_KINDS.ROLL_CALL,   // discriminator on the INFO type — NOT signal_type
      sender_callsign: callsign || null,
      sd_key: mySd || null,
      available: !mySd,
      repo: process.cwd(),
    };
    const { data, error } = await insertCoordinationRow(sb, {
      sender_session: sessionId,
      sender_type: 'worker',
      target_session: coordinatorId || 'broadcast-coordinator',
      message_type: 'INFO',
      subject: `[ROLL_CALL] ${callsign || 'unassigned'} ${mySd ? 'working ' + mySd : 'available'}`,
      body: null,
      payload,
      expires_at: new Date(Date.now() + ROLL_CALL_TTL_MS).toISOString(),
    }, { select: 'id', single: true });
    if (error) return { id: null, error: error.message };
    return { id: data && data.id, deduped: false };
  } catch (e) {
    return { id: null, error: e.message };
  }
}

async function ackMessage(sb, id, opts = {}) {
  try {
    const now = new Date().toISOString();
    // FR-3 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): an ADAM-role session must never
    // auto-ack a DIRECTIVE kind from the checkin path — stamp read_at only (DELIVERED) and
    // leave acknowledged_at for genuine Adam processing. Kind-allowlist (imported
    // ws.DIRECTIVE_KINDS, never duplicated) per the QF-20260610-545 lesson; WORK_ASSIGNMENT
    // message_type counts as a directive even without payload.kind.
    const { role = null, kind = null, messageType = null } = opts;
    const isDirective = (kind && ws.DIRECTIVE_KINDS.includes(kind)) || messageType === 'WORK_ASSIGNMENT';
    if (role === 'adam' && isDirective) {
      await sb.from('session_coordination').update({ read_at: now }).eq('id', id);
      return;
    }
    await sb.from('session_coordination').update({ read_at: now, acknowledged_at: now }).eq('id', id);
  } catch { /* best-effort */ }
}

// SD-LEO-INFRA-WORKER-INBOX-PUSH-DELIVERY-001 (FR-1): is this a coordinator->worker PUSH the
// worker must SEE on /checkin (beyond WORK_ASSIGNMENT)? COACHING is its own message_type; advisory
// INFO carries payload.kind. EXCLUDED: friction signals (payload.signal_type), the worker's own
// roll_call ping, WORK_ASSIGNMENT (surfaced as pending_work_assignment), and SET_IDENTITY (FR-2).
function isCoordinatorPush(m) {
  if (!m) return false;
  const p = m.payload || {};
  // Exclude OUTBOUND friction signals (worker->coordinator, top-level signal_type) — but NOT inbound
  // coordinator->worker notifications that merely ECHO signal_type as context (e.g. a SIGNAL_RESOLVED
  // row carries {signal_resolved:true, signal_type}); those ARE push the worker must see. (adversarial-
  // review finding: the bare signal_type guard re-created the very blindness this SD closes.)
  if (p.signal_type && !p.signal_resolved) return false;
  if (p.kind === ws.PAYLOAD_KINDS.ROLL_CALL) return false; // the worker's own availability ping
  const mt = m.message_type;
  if (mt === 'WORK_ASSIGNMENT' || mt === 'SET_IDENTITY') return false; // handled elsewhere (pending_work_assignment / callsign)
  // Surface ALL coordinator->worker push the worker would otherwise miss: COACHING + every
  // self-targeted INFO (advisory: coordinator_reply/adam_advisory/plain announcement; AND directive:
  // coordinator_request/coordinator_reminder — those are exactly the rows a blind /checkin missed).
  // The caller bounded-acks advisory rows but NEVER auto-acks DIRECTIVE_KINDS (they need genuine action).
  return mt === 'COACHING' || mt === 'INFO';
}

// FR-1 + FR-3: surface UNCONSUMED (acknowledged_at IS NULL) coordinator push targeting this session
// as coordinator_messages[], and make /checkin the AUTHORITATIVE, NON-DRAINING, bounded delivery
// point (its JSON is the worker's decision input — unlike the ephemeral PostToolUse render the RCA
// flagged). Per row: first authoritative delivery stamps read_at only (DELIVERED) → re-surfaces once
// (single-missed-render guard); a SECOND delivery of an ADVISORY (non-directive, non-adam) row stamps
// acknowledged_at → CONSUMED (bounded, no infinite re-surface). DIRECTIVE_KINDS are never auto-acked
// here (genuine action stamps acknowledged_at — mirrors ackMessage / the read-ack split). Fail-open.
async function surfaceCoordinatorMessages(sb, sessionId, { role = null } = {}) {
  let rows = [];
  try {
    rows = await ws.getMessagesForSession(sb, sessionId, { unackedOnly: true });
  } catch { return []; }
  const push = (rows || []).filter(isCoordinatorPush);
  const now = new Date().toISOString();
  const out = [];
  for (const m of push) {
    const p = m.payload || {};
    const kind = p.kind || null;
    const isDirective = !!(kind && ws.DIRECTIVE_KINDS.includes(kind));
    // SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1: chairman_directive is in DIRECTIVE_KINDS,
    // so isDirective is true → it is NEVER auto-acked here (waits for the per-role ack via
    // scripts/ack-chairman-directive.cjs). Surface a first-class flag so the checkin JSON marks it.
    const isChairmanDirective = kind === 'chairman_directive';
    // QF-20260703-672: coordinator_reply/work_assignment writers put content in payload.body only —
    // the top-level body column stays null for those kinds. Fall back to payload so /checkin's JSON
    // (the worker's actual decision input) carries the real text instead of forcing a side DB query.
    out.push({ id: m.id, message_type: m.message_type, kind, chairman_directive: isChairmanDirective, subject: m.subject || p.subject || null, body: m.body || p.body || null, created_at: m.created_at });
    try {
      if (!m.read_at) {
        // first authoritative delivery — mark DELIVERED, leave unacked so it re-surfaces once
        await sb.from('session_coordination').update({ read_at: now }).eq('id', m.id);
      } else if (!isDirective && role !== 'adam') {
        // advisory row already delivered once → CONSUMED (bounded); directives wait for genuine action
        await sb.from('session_coordination').update({ acknowledged_at: now }).eq('id', m.id);
      }
    } catch { /* best-effort: the surfacing in `out` already happened */ }
  }
  return out.reverse(); // present oldest-first (chronological reading order)
}

// FR-2: re-hydrate the worker callsign from the durable SET_IDENTITY row when claude_sessions.metadata
// lost it (callsign goes null after a release/sweep). Persists it back to metadata so it survives the
// NEXT sweep. Fail-open: no SET_IDENTITY row → returns null (never fabricates a callsign).
async function rehydrateCallsign(sb, sessionId, currentMeta) {
  try {
    const { data } = await sb.from('session_coordination')
      .select('payload, created_at')
      .eq('target_session', sessionId)
      .eq('message_type', 'SET_IDENTITY')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const cs = data && data.payload && data.payload.callsign;
    if (!cs) return null;
    // QF-20260705-609: refuse to resurrect `cs` when THIS session's own already-read
    // claude_sessions.metadata.fleet_identity.callsign already disagrees with it -- a re-band
    // self-heal (assignFleetIdentityAtCheckin) can write the NEW callsign to claude_sessions
    // successfully while its own SET_IDENTITY dispatch fails silently (fail-open, "cron
    // re-emits within 5 min"). Until that re-emit lands, this stale session_coordination row
    // still names the OLD, already-vacated callsign; rehydrating it here would silently revert
    // the session to a label it already gave up (chairman-observed live 2026-07-05 morning,
    // operationally remedied via assign-fleet-identities --force). This is a self-consistency
    // check (does MY canonical record still agree with `cs`), distinct from QF-20260703-665's
    // fleet-wide uniqueness check below (does someone ELSE hold `cs`).
    const myCurrentCallsign = currentMeta && currentMeta.fleet_identity && currentMeta.fleet_identity.callsign;
    if (myCurrentCallsign && myCurrentCallsign !== cs) return null;
    // QF-20260703-665 (a): refuse to resurrect a callsign a DIFFERENT live session currently
    // holds -- a stale SET_IDENTITY row can name an identity long since reassigned elsewhere
    // (live-repro: Echo ccdd0c1c resurrected while another session already held it). Fail-open
    // on a lookup fault: proceed with the pre-fix behavior rather than leave the worker nameless.
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: holder } = await sb.from('claude_sessions')
        .select('session_id')
        .neq('session_id', sessionId)
        .gte('heartbeat_at', fiveMinAgo)
        .neq('status', 'terminated')
        .filter('metadata->fleet_identity->>callsign', 'eq', cs)
        .limit(1)
        .maybeSingle();
      if (holder) return null;
    } catch { /* fail-open -- uniqueness check unavailable, fall through to legacy rehydrate */ }
    const prevFi = (currentMeta && currentMeta.fleet_identity) || {};
    const color = (data.payload && data.payload.color) || prevFi.color || null;
    const display_name = (data.payload && data.payload.display_name) || `${cs} | idle`;
    try {
      const meta = { ...(currentMeta || {}), fleet_identity: { ...prevFi, callsign: cs, color, display_name } };
      await sb.from('claude_sessions').update({ metadata: meta }).eq('session_id', sessionId);
    } catch { /* best-effort persist; the in-memory return still re-hydrates this response */ }
    return cs;
  } catch { return null; }
}

/**
 * Run the full handshake. Pure-ish: takes an injected supabase client + session
 * id so it is unit-testable without env/network. Returns the resolution object
 * (the same object printed as JSON by the CLI). NEVER throws, NEVER reads stdin.
 */
/**
 * Pure predicate: is this quick_fixes row safe to AUTO-start via the worker
 * self-claim path? Mirrors (inverts) the verify-first gate in
 * scripts/modules/sd-next/display/quick-fixes.js. Re-implemented INLINE because
 * worker-checkin.cjs is CommonJS and that module is ESM (package.json
 * type:module), so it cannot be require()d here. SD-LEO-INFRA-MAKE-OPEN-QFS-001.
 */
function isAutoStartableQF(qf, nowMs) {
  if (!qf || qf.status !== 'open') return false;
  if (qf.pr_url || qf.commit_sha) return false;        // already in PR/commit (verify-first / merge-race guard)
  // SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: quick_fixes.factory_lane is the structured
  // "coordinator-dispatch only, not worker-self-claimable" marker (replaces the pre-fix free-text
  // "FACTORY-LANE:" convention buried in description, which this predicate could not see -- live
  // incident: QF-20260712-481 self-claimed despite being factory-lane). Fail-closed: any truthy
  // value excludes; only exactly false (the column default) allows self-claim.
  if (qf.factory_lane) return false;
  if (qf.routing_tier != null && Number(qf.routing_tier) >= 3) return false;  // persisted Tier-3 -> full SD, not auto-QF
  if (TIER3_RISK_RE.test(qf.title || '')) return false;                        // risk-keyword drift -> hold for triage/human
  // SD-LEO-FIX-QUICK-FIXES-NEEDS-001: durable time-gated defer -- a QF genuinely not ready
  // yet (e.g. needs a clean 24h observation window) stays status='open' but is ineligible
  // for claim until not_before passes. Prevents the same worker re-claiming it every cycle.
  if (qf.not_before) {
    const notBefore = Date.parse(qf.not_before);
    if (Number.isFinite(notBefore) && notBefore > nowMs) return false;
  }
  // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: chairman-gated hold (owner='chairman' +
  // release_condition) -- the QF-508/QF-970 class whose APPLY awaits a chairman condition.
  // Stays status='open' but is false open work for a worker: exclude until released via
  // scripts/release-chairman-gated-qf.js. Visible on the coordinator surface, never lost.
  if (isChairmanGatedQF(qf)) return false;
  const created = qf.created_at ? Date.parse(qf.created_at) : NaN;
  if (!Number.isFinite(created)) return false;
  const ageDays = (nowMs - created) / (24 * 60 * 60 * 1000);
  return ageDays < STALE_QF_DAYS;                       // exclude stale/verify-first QFs
}

/**
 * Self-claim tier for open quick_fixes — sourced ONLY here because
 * v_sd_next_candidates is SD-only. Sits strictly BELOW the SD self-claim loop
 * and ABOVE the idle return, so SD work is always preferred. Reuses the
 * already-QF-aware claim_sd RPC via tryClaim() (no new RPC/schema); claim_sd is
 * the authoritative race/liveness arbiter (it refuses a live foreign holder ->
 * tryClaim ok:false -> we skip to the next QF). Returns a self_claimed_qf result
 * or null (caller then falls through to idle). Never throws (fail-open).
 * SD-LEO-INFRA-MAKE-OPEN-QFS-001.
 */
async function selfClaimQuickFix(sb, sessionId, base, sessionModel) {
  try {
    // factory_lane is a staged, not-yet-applied column
    // (database/migrations/20260713_quick_fixes_factory_lane.sql). The comment here previously
    // assumed a missing column fails this SELECT soft per-row; it actually fails the WHOLE
    // multi-column select (error 42703, data:null), which the caller never checked -- a total
    // self-claim outage fleet-wide, not graceful degradation (QF-20260720-763, live-verified:
    // every checkin returned action:idle with claimable QFs sitting open). Retry once without
    // factory_lane specifically on that error code -- qf.factory_lane then comes back undefined,
    // which isAutoStartableQF's `if (qf.factory_lane)` truthy-check already treats identically to
    // the column's own DEFAULT false, so behavior is unchanged once the column eventually lands
    // (self-heals with no follow-up code change). The pragma below MUST stay on the same physical
    // line as .select( -- schema-reference-extract.mjs's pragmaAt() only checks the line
    // containing the .select( match itself.
    const QF_CANDIDATE_COLUMNS = 'id, status, pr_url, commit_sha, created_at, routing_tier, title, description, severity, not_before, factory_lane, owner, release_condition'; // schema-lint-disable-line: factory_lane staged, see comment above
    let { data: qfs, error: qfErr } = await sb
      .from('quick_fixes')
      .select(QF_CANDIDATE_COLUMNS)
      .eq('status', 'open')
      .is('pr_url', null)
      .is('commit_sha', null)
      .order('created_at', { ascending: true })
      .limit(QF_CANDIDATE_LIMIT);
    if (qfErr && qfErr.code === '42703') {
      ({ data: qfs } = await sb
        .from('quick_fixes')
        .select(QF_CANDIDATE_COLUMNS.replace(', factory_lane', ''))
        .eq('status', 'open')
        .is('pr_url', null)
        .is('commit_sha', null)
        .order('created_at', { ascending: true })
        .limit(QF_CANDIDATE_LIMIT));
    }
    const nowMs = Date.now();
    // SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (C-QF-SEAM): the QF path was the model-blind gap —
    // isAutoStartableQF has no capability check, so a Fable seat could always fall through to
    // general QFs (the observed 2026-07-16 recurrence). Same fence as the SD axis, same SSOT
    // module; no-op unless the session model is restricted (fable). Fenced QFs are surfaced
    // via base.work_class_fenced, never silently skipped (C-STARVE observability).
    const { workClassIneligibilityReason, deriveWorkClass } = require('../lib/fleet/work-class.cjs');
    for (const qf of sortQfCandidatesBySeverity(qfs)) {
      if (!isAutoStartableQF(qf, nowMs)) continue;
      const wcReason = typeof sessionModel === 'string' ? workClassIneligibilityReason(qf, sessionModel) : null;
      if (wcReason) {
        if (!base.work_class_fenced) base.work_class_fenced = [];
        base.work_class_fenced.push({ qf: qf.id, reason: wcReason, derived_class: deriveWorkClass(qf) });
        continue;
      }
      // SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-2: claim-time moot-recheck for
      // auto-promoted retro action-item QFs -- if the SD explicitly named in
      // this QF's description already completed/cancelled, the referenced
      // work is stale; auto-cancel and move on rather than let a worker burn
      // a claim cycle discovering "nothing to do" (the QF-20260713-800 class).
      const mootCheck = await checkQfMoot(sb, qf);
      if (mootCheck.moot) {
        await cancelMootQf(sb, qf.id, mootCheck.sdKey, mootCheck.status);
        continue;
      }
      const claimed = await tryClaim(sb, qf.id, sessionId);
      if (claimed.ok) {
        return {
          ...base,
          action: 'self_claimed_qf',
          qf: qf.id,
          message: `Self-claimed quick-fix ${qf.id} from the open-QF queue. Load it: node scripts/read-quick-fix.js ${qf.id} — then run the /quick-fix workflow (implement <=50 LOC on branch qf/${qf.id}, run tests, then node scripts/complete-quick-fix.js ${qf.id}). Do NOT run sd-start.js for a QF. On completion, re-run /checkin.`,
        };
      }
    }
  } catch { /* fail-open -> caller returns idle */ }
  return null;
}

// SD-FDBK-FEAT-WORKER-CHECKIN-SELF-001: un-baselined-draft self-claim tier.
const DRAFT_CANDIDATE_LIMIT = 10;

// ── Coordinator dispatch-rank ordering (SRE duty 6, operator 2026-06-10) ──
// The coordinator's backlog-ordering pass (scripts/coordinator-backlog-rank.mjs) persists
// metadata.dispatch_rank (+ dispatch_rank_at) on claimable leaf SDs: critical-path-first, then
// priority, then age. Self-claim honors a FRESH rank so "what gets done first" is
// coordinator-driven by default instead of correction-by-dispatch. Stale (> TTL) or absent ranks
// are ignored — the tier's existing order stands. Fail-open: any error → original order.
const DISPATCH_RANK_TTL_MS = 60 * 60 * 1000; // ranking loop runs ~10-15min; 1h staleness cutoff

/** Pure: stable-sort items by a rank map (lower rank first); unranked keep relative order. */
function orderByRankMap(items, keyOf, rankMap) {
  if (!rankMap || rankMap.size === 0) return items;
  return items.slice().sort((a, b) =>
    (rankMap.get(keyOf(a)) ?? Infinity) - (rankMap.get(keyOf(b)) ?? Infinity));
}

/**
 * Pure: stable-sort so fleet_critical=true items come FIRST (STALE-PROOF — independent of the
 * dispatch_rank TTL), then by the dispatch rank map (lower first), then input order.
 * SD-LEO-INFRA-FLEET-CRITICAL-CLAIM-PATH-001: propagates fleet_critical to the WORKER self-claim
 * decision. #5063 ranked fleet_critical SDs correctly coordinator-side (the WRITER), but this worker
 * claim path only honored dispatch_rank (and only while fresh), so a fleet_critical SD whose
 * dispatch_rank was stale/absent stayed buried under lower-ranked REFILLs across idle-worker cycles.
 */
function orderByFleetCriticalThenRank(items, keyOf, rankMap, fleetCriticalSet, priorityMap) {
  const fc = fleetCriticalSet instanceof Set ? fleetCriticalSet : new Set();
  const rm = rankMap instanceof Map ? rankMap : new Map();
  const pm = priorityMap instanceof Map ? priorityMap : new Map();
  if (fc.size === 0 && rm.size === 0 && pm.size === 0) return items;
  return items.slice().sort((a, b) => {
    const af = fc.has(keyOf(a)) ? 0 : 1;
    const bf = fc.has(keyOf(b)) ? 0 : 1;
    if (af !== bf) return af - bf;                       // fleet_critical first (stale-proof)
    const ar = rm.get(keyOf(a)) ?? Infinity;
    const br = rm.get(keyOf(b)) ?? Infinity;
    if (ar !== br) return ar - br;                       // then fresh dispatch_rank
    // SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001 FR-3: when dispatch_rank is stale/absent for BOTH
    // (equal Infinity), fall back to SD priority so a high-priority SD is not buried under low-priority
    // REFILLs overnight. Unknown priority sorts last in the tier; input order is the final tie-break.
    return (pm.get(keyOf(a)) ?? Infinity) - (pm.get(keyOf(b)) ?? Infinity);
  });
}

/**
 * Fetch the coordinator's dispatch signals for the candidate keys and order by them. Fail-open.
 * Honors BOTH metadata.fleet_critical (STALE-PROOF top priority — SD-LEO-INFRA-FLEET-CRITICAL-CLAIM-
 * PATH-001) and a fresh metadata.dispatch_rank (TTL-bounded tie-break). Both live in the SAME single
 * metadata read, so honoring fleet_critical adds NO extra query.
 */
async function sortByDispatchRank(sb, items, keyOf) {
  try {
    const keys = (items || []).map(keyOf).filter(Boolean);
    if (keys.length < 2) return items || [];
    const { data } = await sb.from('strategic_directives_v2')
      .select('sd_key, priority, metadata').in('sd_key', keys);
    const rankMap = new Map();
    const fleetCriticalSet = new Set();
    const priorityMap = new Map(); // FR-3: stale-proof SD-priority tier (single read, no extra query)
    const now = Date.now();
    for (const r of (data || [])) {
      const m = r.metadata || {};
      // fleet_critical is a STALE-PROOF claim signal: it lifts the SD to the top of the worker pool
      // regardless of dispatch_rank freshness, so a fleet_critical SD is never buried by REFILLs.
      if (m.fleet_critical === true) fleetCriticalSet.add(r.sd_key);
      if (m.dispatch_rank != null && m.dispatch_rank_at
          && (now - new Date(m.dispatch_rank_at).getTime()) < DISPATCH_RANK_TTL_MS) {
        rankMap.set(r.sd_key, Number(m.dispatch_rank));
      }
      const pr = PRIORITY_RANK[String(r.priority || '').toLowerCase()];
      if (pr != null) priorityMap.set(r.sd_key, pr);
    }
    return orderByFleetCriticalThenRank(items, keyOf, rankMap, fleetCriticalSet, priorityMap);
  } catch { return items || []; } // fail-open: ordering must never break self-claim
}
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

// SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: draftDepsSatisfied + baselinedCandidateEligible were
// EXTRACTED to ../lib/fleet/claim-eligibility.cjs (required above) so the worker-PULL self_claim path
// (here) and the coordinator/sweep-PUSH CLAIM_FIX path (scripts/stale-session-sweep.cjs) share ONE
// eligibility predicate. CLAIM_FIX previously lacked the orchestrator-parent + dep-blocked guard the
// self_claim path had (SD-FDBK-FIX-WORKER-SELF-CLAIM-001) — a PAT-WRITER-CONSUMER-ASYMMETRY that let
// coordinator-push route an orchestrator PARENT onto a worker. Self_claim behavior here is unchanged:
// baselinedCandidateEligible(sb, sdKey) still returns false for orchestrator parents, dep-blocked SDs,
// not-found, and on any query error (conservative skip).

/**
 * Self-claim tier for claimable UN-BASELINED draft SDs. v_sd_next_candidates is built from
 * sd_baseline_items, so a newly-created DRAFT SD that isn't baselined yet is INVISIBLE to step 6
 * — and draft is the normal LEAD starting state, so the bulk of the belt was structurally
 * unclaimable (every /checkin returned "nothing claimable" with a loaded queue). Sits strictly
 * BELOW the baselined SD loop (step 6) and ABOVE the QF tier (step 6.5), so baselined/prioritized
 * SDs still win and SD work still beats QFs. Excludes orchestrator PARENTS (auto-complete on
 * children — never dispatch) and dependency-blocked SDs. Reuses tryClaim()/claim_sd (the
 * race/liveness arbiter). Returns a self_claimed result or null. Never throws (fail-open).
 * SD-FDBK-FEAT-WORKER-CHECKIN-SELF-001.
 */
/**
 * Fetch the ordered un-baselined draft candidate pool WITHOUT claiming
 * (QF-20260610-986). Extracted from selfClaimDraftSd so the merged step-6 tier
 * can rank-sort baselined + draft candidates in ONE pool — the old sequential
 * tiers meant a coordinator dispatch_rank could NEVER lift a draft above any
 * baselined candidate (witnessed live: rank-0 critical draft skipped for
 * rank-5 baselined mediums; feedback dc87039d).
 */
async function fetchDraftCandidates(sb) {
  const { data: drafts } = await sb
    .from('strategic_directives_v2')
    // metadata feeds the shared classifyDispatchIneligibility gate (the requires_human_action axis);
    // sd_type already selected for the existing orchestrator exclusion. target_application added for
    // the SD-LEO-INFRA-WORKER-CLAIM-TIME-001 claim-time repo-match fitness axis.
    // SD-REFILL-00SO4HZY: + parent_sd_id so the draft self-claim path can apply the parent-LEAD gate
    // (an orchestrator child whose parent has not passed LEAD must not be claimed -> wasted PLAN cycles).
    .select('sd_key, status, sd_type, priority, created_at, dependencies, metadata, target_application, parent_sd_id')
    .in('status', ['draft', 'active'])
    .is('claiming_session_id', null)
    .neq('sd_type', 'orchestrator')
    .order('created_at', { ascending: true })
    .limit(DRAFT_CANDIDATE_LIMIT);
  // priority-first; oldest-first within a priority (stable sort preserves the created_at order).
  return (drafts || []).slice().sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  );
}

/**
 * SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-1): a FOURTH self-claim candidate source,
 * the NEWEST-N counterpart of fetchDraftCandidates. fetchDraftCandidates is a single created_at-ASC
 * .limit(DRAFT_CANDIDATE_LIMIT=10) window = the OLDEST 10 drafts only, and fetchFleetCriticalCandidates
 * is gated on metadata fleet_critical=true. So a fresh NON-fleet_critical draft that is a genuine fit
 * for an idle worker but sits at draft age-position 11+ (10+ older drafts ahead of it by age) is in
 * NEITHER window and has NO direct source — it starves across idle-worker cycles until enough older
 * drafts drain (the exact starvation class #5268 fixed for fleet_critical, left open for everything
 * else). This source fetches the NEWEST DRAFT_CANDIDATE_LIMIT drafts (created_at DESC) so a fresh
 * fit-draft is claimable regardless of age position.
 *
 * ADDITIVE-ONLY: an EXACT mirror of fetchDraftCandidates except the created_at order is DESC. SAME
 * columns (so a newest-window entry carries everything the downstream eligibility + fitness gates read),
 * SAME positive status allowlist / claiming_session_id-null / neq-orchestrator guards, SAME
 * DRAFT_CANDIDATE_LIMIT and priority-first stable sort. Never claims here — the caller UNIONs these into
 * the merged step-6 pool (deduped by sd_key), so each routes through the COMPLETE eligibility SSOT +
 * claim path unchanged. The explicit .order + .limit means the bounded fetch is never a SILENT
 * truncation (the same hard-requirement pattern #5268 established). Exported for the FR-2 regression test.
 */
async function fetchNewestDraftCandidates(sb) {
  const { data: drafts } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, status, sd_type, priority, created_at, dependencies, metadata, target_application, parent_sd_id')
    .in('status', ['draft', 'active'])
    .is('claiming_session_id', null)
    .neq('sd_type', 'orchestrator')
    .order('created_at', { ascending: false })   // NEWEST-N — the only difference from fetchDraftCandidates
    .limit(DRAFT_CANDIDATE_LIMIT);
  // priority-first; newest-first within a priority (stable sort preserves the created_at DESC order).
  return (drafts || []).slice().sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  );
}

/**
 * SD-LEO-INFRA-SELF-CLAIM-WINDOW-FLEET-CRITICAL-001 (FR-1): a THIRD self-claim candidate source.
 * The fleet_critical reorder (sortByDispatchRank -> orderByFleetCriticalThenRank) can only LIFT a
 * fleet_critical SD that is already in the merged step-6 pool — but that pool is built from two
 * fleet_critical-BLIND windows: v_sd_next_candidates (SELF_CLAIM_CANDIDATE_LIMIT, no fleet-aware order)
 * and fetchDraftCandidates (created_at-ASC, DRAFT_CANDIDATE_LIMIT, draft/active). A claimable
 * fleet_critical SD sitting OUTSIDE both windows (witnessed live at view position 20 + draft 13/13) is
 * never in the pool, so the reorder has nothing to lift and the SD starves. This source fetches
 * UNCLAIMED fleet_critical SDs DIRECTLY by metadata flag, bypassing the view + both windows.
 *
 * Hard requirements (each guards a re-seeded bug class):
 *  - POSITIVE status allowlist status IN ('draft','active') mirroring fetchDraftCandidates:498 — NOT a
 *    negative denylist (a .not(status,in,(completed,cancelled,deferred)) denylist admits
 *    blocked/archived/superseded/pending_approval, which neither classifyDispatchIneligibility nor the
 *    claim_sd terminal guard reject -> a pending_approval fleet_critical SD that never passed LEAD would
 *    be surfaced, pass eligibility, pass claim_sd, and wrongly start EXEC).
 *  - DETERMINISTIC .order(priority then created_at) so the bounded fetch is never a SILENT truncation
 *    (the very no-order-limit class this SD fixes).
 *  - STRICT-boolean predicate (FR-3): the DB-side metadata->>fleet_critical text-match returns 'true'
 *    for BOTH a JSON boolean true AND a JSON string 'true', but the lift (sortByDispatchRank) only
 *    lifts strict m.fleet_critical === true. JS-filter to === true so a string 'true' is not
 *    surfaced-but-not-lifted (in the pool yet never fleet-prioritized).
 * Selects the same columns as fetchDraftCandidates so an injected entry carries what the downstream
 * eligibility gates read. Never claims here — the caller unions these into the merged pool so each
 * routes through the COMPLETE eligibility SSOT + claim path. Exported for the FR-4 regression tests.
 */
async function fetchFleetCriticalCandidates(sb) {
  const { data: rows } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, status, sd_type, priority, created_at, dependencies, metadata, target_application, parent_sd_id')
    .eq('metadata->>fleet_critical', 'true')                 // DB text-match: admits boolean true AND string 'true'
    .in('status', ['draft', 'active'])                       // POSITIVE allowlist (never a denylist)
    .is('claiming_session_id', null)
    .neq('sd_type', 'orchestrator')
    .order('priority', { ascending: true })                  // deterministic — never a silent truncation
    .order('created_at', { ascending: true })
    .limit(DRAFT_CANDIDATE_LIMIT);
  // FR-3 reconcile: keep only STRICT boolean true so a string 'true' is not surfaced-but-not-lifted
  // (matches the lift's `m.fleet_critical === true` in sortByDispatchRank), then priority-first stable
  // sort mirroring fetchDraftCandidates (the DB order is a hint; the JS sort is authoritative).
  return (rows || [])
    .filter((r) => r.metadata && r.metadata.fleet_critical === true)
    .slice()
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
}

/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B (FR-1): a FIFTH self-claim candidate source.
 * sortByDispatchRank/orderByFleetCriticalThenRank can only REORDER an item already in the merged
 * pool — it cannot inject one. A claimable SD the coordinator HAS ranked (metadata.dispatch_rank
 * set) but that sits outside every existing window (not in the baselined view, not in the oldest-10
 * or newest-10 draft windows, not fleet_critical) is therefore invisible to self-claim even though
 * it is ranked — the coordinator's own ranking work (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A)
 * is wasted for it. This source fetches UNCLAIMED SDs directly by "has a dispatch_rank", bypassing
 * the age windows, mirroring fetchFleetCriticalCandidates's shape.
 *
 * The `.not(...)` filter is a DB-side hint only (Postgres/PostgREST honors it; some in-memory test
 * doubles no-op unimplemented filters) — the JS-side `!= null` re-filter below is authoritative,
 * matching this file's established fleet_critical-source pattern. Numeric dispatch_rank sort is
 * done in JS (not via DB `.order()`) because ordering a jsonb/text extraction lexically would sort
 * "10" before "2" — the DB `.order('created_at')` below is only a deterministic tiebreak hint.
 */
async function fetchRankedCandidates(sb) {
  const { data: rows } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, status, sd_type, priority, created_at, dependencies, metadata, target_application, parent_sd_id')
    .not('metadata->dispatch_rank', 'is', null)               // DB-side hint: has a dispatch_rank
    .in('status', ['draft', 'active'])                        // POSITIVE allowlist (never a denylist)
    .is('claiming_session_id', null)
    .neq('sd_type', 'orchestrator')
    .order('created_at', { ascending: true })                 // deterministic tiebreak — never a silent truncation
    .limit(DRAFT_CANDIDATE_LIMIT);
  // Authoritative JS filter (mirrors the fleet_critical source's DB-hint + JS-authoritative pattern):
  // keep only rows with a real dispatch_rank, then sort numerically ascending (lowest rank first).
  return (rows || [])
    .filter((r) => r.metadata && r.metadata.dispatch_rank != null)
    .slice()
    .sort((a, b) => Number(a.metadata.dispatch_rank) - Number(b.metadata.dispatch_rank));
}

/** Per-row claim attempt for an un-baselined draft candidate (shared by the merged
 *  step-6 tier and the legacy selfClaimDraftSd wrapper). Returns a result or null. */
async function tryClaimDraftCandidate(sb, sessionId, base, d, tierCtx = {}) {
  // SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001: same shared classifier the baselined candidate-view
  // tier (step 6) and the coordinator/sweep PUSH path use — the un-baselined draft tier must not
  // self-claim a test-fixture phantom (SD-DEMO-*/SD-TEST-*) or a requires_human_action SD.
  // SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): pass {cwd} so an SD that is unfit for THIS checkout
  // (repo mismatch / closed premise / missing precondition) is skipped before claiming.
  // SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3): tierCtx adds worker_tier_rank +
  // tiering_active so a below-rung worker skips above-rung drafts (WORK-DOWN-NEVER-UP).
  if (classifyDispatchIneligibility(d, { cwd: process.cwd(), ...tierCtx }) !== null) return null;
  // SD-ARCH-HOTSPOT-SD-START-001 FR-2: converged shared gate (fail-closed polarity preserved).
  if (!depsSatisfiedFromVerdict(await evaluateClaimDependencyGate(sb, d))) return null; // skip dependency-blocked
  // SD-REFILL-00SO4HZY: skip an orchestrator child whose parent has not yet passed LEAD (a worker would
  // otherwise drive PLAN then hit the hard EXEC-transition block). Fail-open inside parentLeadPending.
  if (await parentLeadPending(sb, d)) return null;
  if (await isSdInFlight(sb, d.sd_key, sessionId)) return null; // dedup: started or live-foreign-held
  // SD-ARCH-HOTSPOT-SD-START-001 FR-7 (D8 placement): AFTER every other gate, immediately
  // BEFORE the claim write — so the observe-mode WOULD-DENY set equals exactly the set
  // enforce mode would block. Observe NEVER blocks; enforce refuses (dormant until the
  // backfill-verified cutover flips the enforce flag).
  const authVerdict = await dispatchAuth.evaluateDispatchAuthorization(d, sb, { mode: await getDispatchAuthMode() });
  if (authVerdict.would_deny) {
    console.log(dispatchAuth.formatWouldDenyLine(d.sd_key, authVerdict, 'checkin_self_claim'));
    await dispatchAuth.recordWouldDenyEvidence(sb, d.sd_key, authVerdict, 'checkin_self_claim', d);
  }
  if (!authVerdict.authorized) return null; // enforce mode: born-un-authorized SD skipped
  const claimed = await tryClaim(sb, d.sd_key, sessionId);
  if (claimed.ok) {
    return {
      ...base,
      action: 'self_claimed',
      sd: d.sd_key,
      // FR-1: a draft claim is still ranked claimable work — carry the anti-wind-down directive so the
      // worker builds/decomposes it rather than rationalizing a release (base.belt_ranked_claimable was
      // set by the step-6 merged pool before this is called; default 0 if the draft path ran standalone).
      message: `Self-claimed ${d.sd_key} (un-baselined draft) from the SD belt. Run: node scripts/sd-start.js ${d.sd_key}. ${antiWinddownDirective(base.belt_ranked_claimable)}`,
    };
  }
  return null;
}

async function selfClaimDraftSd(sb, sessionId, base) {
  try {
    const ordered = await fetchDraftCandidates(sb);
    // duty-6: a fresh coordinator dispatch_rank overrides the local priority order (rank already
    // encodes priority as its tie-break); unranked/stale rows keep the order above. Fail-open.
    const ranked = await sortByDispatchRank(sb, ordered, (d) => d.sd_key);
    for (const d of ranked) {
      const result = await tryClaimDraftCandidate(sb, sessionId, base, d);
      if (result) return result;
    }
  } catch { /* fail-open -> caller continues to QF/idle */ }
  return null;
}

// SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001: recover SDs STRANDED at pending_approval/LEAD_FINAL
// with the claim cleared. RECURRING bug (2nd occurrence): a worker reaches LEAD_FINAL (PLAN-TO-LEAD
// accepted, gates passed, retro exists, PR usually merged) then RELEASES its claim and goes idle
// WITHOUT running the final LEAD-FINAL-APPROVAL handoff. The SD is then one step from shipped but
// un-completable: self-claim skips pending_approval (only draft/active), and a coordinator running
// `handoff.js execute LEAD-FINAL-APPROVAL` from main with the claim cleared FAILS the claim-validity
// worktree-isolation gate (lib/claim-validity-gate.js: claiming_session_id must match + cwd in the
// worktree). The ONLY reliable unblock today is a human window-pasting `sd-start` in a worker. This
// tier AUTOMATES that: re-claim the stranded SD so a worker re-attaches the worktree (sd-start) and
// runs LEAD-FINAL-APPROVAL with a VALID matching claim — the gate then passes. Idempotent (a re-strand
// is simply re-recovered next checkin). Highest self-claim priority: finishing a near-shipped SD beats
// starting new work. Fail-open; returns a resume_final result or null.
const STRANDED_CANDIDATE_LIMIT = 5;
// Only recover SDs that have been parked a while, so we never race a worker mid-finalize (the brief
// window between a transition and the next handoff). A genuinely stranded SD sits indefinitely.
const STRANDED_MIN_AGE_MS = 5 * 60 * 1000;

async function recoverStrandedFinal(sb, sessionId, base) {
  try {
    const cutoffIso = new Date(Date.now() - STRANDED_MIN_AGE_MS).toISOString();
    const { data: stranded } = await sb
      .from('strategic_directives_v2')
      .select('sd_key, status, current_phase, updated_at')
      .eq('status', 'pending_approval')
      .eq('current_phase', 'LEAD_FINAL')
      .is('claiming_session_id', null)
      .lt('updated_at', cutoffIso)            // parked > STRANDED_MIN_AGE_MS — not a mid-finalize race
      .order('updated_at', { ascending: true }) // oldest stranded first
      .limit(STRANDED_CANDIDATE_LIMIT);
    for (const sd of (stranded || [])) {
      const claimed = await tryClaim(sb, sd.sd_key, sessionId);
      if (claimed.ok) {
        return {
          ...base,
          action: 'resume_final',
          sd: sd.sd_key,
          message: `Recovered stranded SD ${sd.sd_key} (was pending_approval/LEAD_FINAL with claim cleared — one handoff from shipped). Re-attach + finish: node scripts/sd-start.js ${sd.sd_key}, then node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.sd_key}. If PR_MERGE_VERIFICATION blocks, merge the PR first (gh pr merge), then re-run.`,
        };
      }
    }
  } catch { /* fail-open -> caller continues to normal self-claim */ }
  return null;
}

// SD-FDBK-INFRA-ORPHAN-ADOPTION-WORKER-001: adopt ORPHANED in_progress SDs (zero active claims).
// A session reaped mid-build (worktree + commits intact) leaves its SD in_progress with
// claiming_session_id NULL — invisible to EVERY other tier: step 4 needs claude_sessions.sd_key,
// step 5.7 only covers pending_approval/LEAD_FINAL, and step 6's isSdInFlight guard skips any SD
// past LEAD (the exact bug: the orphan IS past LEAD, so checkin idled while sd:next flagged
// LOCAL_ACTIVITY; recovery was a human-driven manual claim_sd — witnessed 2026-06-10 adopting
// SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001). This tier mirrors recoverStrandedFinal: age-guarded
// query, shared eligibility classifier, live-holder probe, claim_sd as the final race arbiter,
// fail-open, idempotent (a re-strand is re-adopted next checkin).
//
// Sweep interaction (validated, do NOT re-introduce a destructive reset): the stale-session
// sweep's phantom-detect (QF-20260426-SWEEP-PHANTOM-DETECT) targets the same zero-claim
// in_progress population but RESETS it to draft/LEAD — gated by assertSweepHandoffGate, which
// SKIPS any SD with an accepted handoff past LEAD. So the mid-build orphans this tier adopts
// survive the sweep, and LEAD-phase no-commit orphans the sweep resets are picked up by the
// draft tier (6.25) instead. Disjoint dispositions, no race.
//
// NOTE: isSdInFlight is deliberately NOT reused here — its phase!=LEAD leg would veto every
// orphan by definition; only its live-foreign-holder leg applies (inlined below). claim_sd
// independently refuses live peers (already_claimed / claimed_by_live_peer) and terminal
// statuses ({completed,cancelled,deferred} — in_progress is claimable), so the probe is
// defense-in-depth, not the sole guard.
// SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-3): shared foreign-session lookup.
// Fail-open on any lookup error (never blocks a caller on a guard error -- the pre-existing
// claim_sd TTL check still arbitrates as the backstop).
async function foreignSessionForSd(sb, sdKey, mySessionId) {
  const { data: sessions } = await sb
    .from('v_active_sessions')
    .select('session_id, is_alive, heartbeat_at, heartbeat_age_seconds, terminal_id, current_branch')
    .eq('sd_key', sdKey)
    .neq('session_id', mySessionId)
    .limit(1);
  return sessions && sessions[0];
}

// Used by isSdInFlight's dedup guard: is a foreign session CURRENTLY, actively pointed at this SD
// right now? No WIP requirement -- a peer that just started (no commits/PR yet) still legitimately
// owns the in-flight work, so self-claim must not race it. Swaps the raw, frequently-stale
// v_active_sessions.is_alive read for isSessionAlive() (see foreignClaimantBlocksSteal's comment
// for why the raw flag under-protects). Fail-open: any error -> false -> never blocks.
// isSessionAliveFn is injectable (defaults to the real isSessionAlive) so tests can pin the
// decision logic without depending on live-PID/heartbeat state.
async function isForeignSessionLive(sb, sdKey, mySessionId, isSessionAliveFn = isSessionAlive) {
  try {
    const session = await foreignSessionForSd(sb, sdKey, mySessionId);
    if (!session) return false;
    return isSessionAliveFn(session).alive;
  } catch {
    return false;
  }
}

// Used by adoptOrphanInProgress's TTL-LAPSED steal decision: a lapsed claim TTL is NECESSARY but
// not SUFFICIENT to steal -- also require the prior claimant to be dead OR WIP-less. Distinct from
// isForeignSessionLive above: this is specifically the "is this genuinely abandoned" question for
// an already-stale claim, not the "is someone actively working on this right now" dedup question.
// isSessionAliveFn/hasWipFn are injectable (default to the real implementations) so tests can pin
// the decision logic without depending on live-PID/heartbeat state or real git/gh subprocesses.
async function foreignClaimantBlocksSteal(sb, sdKey, mySessionId, isSessionAliveFn = isSessionAlive, hasWipFn = hasWip) {
  try {
    const session = await foreignSessionForSd(sb, sdKey, mySessionId);
    if (!session) return false; // no foreign session record at all -> nothing to protect
    const { alive } = isSessionAliveFn(session);
    if (!alive) return false; // dead -> steal proceeds

    let worktreePath = null;
    try {
      const { data: cs } = await sb
        .from('claude_sessions')
        .select('worktree_path')
        .eq('session_id', session.session_id)
        .maybeSingle();
      worktreePath = cs && cs.worktree_path;
    } catch { /* fail-open on the worktree lookup -> hasWip still checks branch/PR */ }

    const wip = hasWipFn(worktreePath, session.current_branch, null, { repoRoot: process.cwd() });
    return wip.hasWip; // live AND has WIP -> refuse; live but WIP-less -> steal proceeds
  } catch {
    return false; // fail-open: never block a steal on a guard error
  }
}

const ORPHAN_CANDIDATE_LIMIT = 5;
// One full claim-TTL window (claimGuard TTL = 15 min): a mid-transition worker whose claim
// briefly clears is never raced; sweep claim-clears also refresh updated_at, deferring adoption
// one window past the clear. A genuine orphan sits indefinitely — the delay is safe.
const ORPHAN_MIN_AGE_MS = 15 * 60 * 1000;

async function adoptOrphanInProgress(sb, sessionId, base) {
  try {
    const cutoffIso = new Date(Date.now() - ORPHAN_MIN_AGE_MS).toISOString();
    const { data: orphans } = await sb
      .from('strategic_directives_v2')
      // sd_key/sd_type/metadata feed classifyDispatchIneligibility; current_phase feeds the
      // resume message (advisory — sd-start reads the live phase authoritatively on attach).
      // target_application added for the SD-LEO-INFRA-WORKER-CLAIM-TIME-001 claim-time repo-match
      // axis so a repo-mismatched orphan is not adopted into the wrong checkout.
      // parent_sd_id added (SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001): feeds the parentLeadPending
      // guard below so a CHILD orphan whose orchestrator parent is still pre-LEAD is not adopted.
      .select('sd_key, sd_type, status, current_phase, metadata, updated_at, target_application, parent_sd_id')
      .eq('status', 'in_progress')
      .is('claiming_session_id', null)
      .neq('sd_type', 'orchestrator')         // parents are in_progress/no-claim BY DESIGN while children run
      .lt('updated_at', cutoffIso)            // parked > one claim-TTL window — not a mid-transition race
      .order('updated_at', { ascending: true }) // oldest orphan first
      .limit(ORPHAN_CANDIDATE_LIMIT);
    for (const sd of (orphans || [])) {
      // Shared classifier (same predicate as the draft tier + coordinator sweep): orchestrator
      // (redundant with .neq — harmless), test-fixture keys (SD-DEMO-*/SD-TEST-*), and
      // metadata.requires_human_action all skip. SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): {cwd}
      // adds the claim-time fitness axes so a repo-mismatched orphan is not adopted here.
      if (classifyDispatchIneligibility(sd, { cwd: process.cwd() }) !== null) continue;
      // SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001: parent-lifecycle guard. classifyDispatchIneligibility
      // excludes orchestrator-parents/test-fixtures/human-action/live-held but NOT a CHILD whose
      // orchestrator parent is still pre-LEAD — adopting one only burns PLAN cycles before the hard
      // 'child cannot enter EXEC until parent completes LEAD' block, then re-orphans (witnessed:
      // ...ASSESSMENT-001-A re-adopted twice under a draft/LEAD parent). Reuse the same shared
      // predicate the self-claim + draft tiers apply (evaluateDispatchEligibility). Fails open.
      if (await parentLeadPending(sb, sd)) continue;
      // Live-foreign-holder probe (the half-write case: SD-side claim cleared but a LIVE session
      // still points at it via claude_sessions.sd_key). SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-
      // WIP-GUARD-001 (FR-3): the raw is_alive flag alone under-protects (it FREEZES stale between
      // short-lived CLI invocations) -- foreignClaimantBlocksSteal() additionally requires the
      // live claimant to have real WIP before refusing. Fail-open: probe errors don't block.
      if (await foreignClaimantBlocksSteal(sb, sd.sd_key, sessionId)) continue;
      const claimed = await tryClaim(sb, sd.sd_key, sessionId);
      if (claimed.ok) {
        return {
          ...base,
          action: 'resume_orphan',
          sd: sd.sd_key,
          message: `Adopted ORPHANED in_progress SD ${sd.sd_key} (zero active claims — prior session reaped mid-build; worktree/commits likely intact). Re-attach + continue: node scripts/sd-start.js ${sd.sd_key} (re-attaches the existing worktree / resumes from the pushed branch), then continue the handoff chain from its live phase (currently ${sd.current_phase || 'unknown'} — sd-start reads the authoritative phase). On completion, re-run /checkin.`,
        };
      }
    }
  } catch { /* fail-open -> caller continues to normal self-claim */ }
  return null;
}

/**
 * Dedup guard: should this SD candidate be SKIPPED by self-claim because it is already
 * being built? v_sd_next_candidates only filters completed/cancelled/deferred and
 * selfClaimDraftSd only filters claiming_session_id IS NULL, so both can surface an SD
 * another session is mid-build on; claim_sd's 900s guard misses long-build heartbeat
 * lapses (auto_stale_takeover). Returns true to SKIP when the SD is (a) past LEAD
 * (started — current_phase != 'LEAD'; phase only advances on an ACCEPTED handoff, so this
 * avoids the rejected-first-handoff false positive that raw handoff-row presence has) OR
 * (b) held by a LIVE foreign session (isForeignSessionLive — the isSessionAlive-guarded check,
 * SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 FR-3; deliberately NO WIP requirement
 * here — this is the "is someone actively working on this right now" dedup question, not the
 * TTL-lapsed steal question adoptOrphanInProgress's foreignClaimantBlocksSteal answers. A peer
 * that just started (no commits/PR yet) still legitimately owns the in-flight work). Fails OPEN
 * (any error -> false -> never blocks self_claim). SD-FDBK-FIX-SELF-CLAIM-DEDUP-001.
 */
async function isSdInFlight(sb, sdKey, mySessionId) {
  try {
    // (a) already started past the initial draft
    const { data: sd } = await sb
      .from('strategic_directives_v2')
      .select('current_phase')
      .eq('sd_key', sdKey)
      .maybeSingle();
    // QF-20260621-219 (PART 2): LEAD_APPROVAL is an INITIAL (claimable) phase too, not in-flight.
    // The current_phase column DEFAULT is 'LEAD_APPROVAL', so a brand-new never-touched
    // auto-refilled draft sits at LEAD_APPROVAL and was wrongly skipped here BEFORE claim_sd — the
    // eligible belt looked full but 0% claimable (chairman-escalated claim-stall). Phase only
    // advances past these on an ACCEPTED handoff, so LEAD and LEAD_APPROVAL are equivalent
    // un-started states for claimability.
    if (sd && sd.current_phase && sd.current_phase !== 'LEAD' && sd.current_phase !== 'LEAD_APPROVAL') return true;
    // (b) a live foreign session already holds it (no WIP requirement -- see isForeignSessionLive's
    // comment for why this differs from adoptOrphanInProgress's TTL-lapsed steal guard).
    if (await isForeignSessionLive(sb, sdKey, mySessionId)) return true;
  } catch { /* fail-open: never block self_claim on a guard error */ }
  return false;
}

/**
 * FR-2 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): CAS-guarded clear of a stale claim that
 * points at a terminal/parked SD. Mirrors lib/claim-validity-gate.js:351-355. Two writes, each
 * guarded by THIS session_id so it can NEVER clobber a peer that legitimately took over:
 *   (1) claude_sessions — co-null sd_key + worktree_path + worktree_branch TOGETHER
 *       (the ck_claude_sessions_worktree_state_consistency constraint rejects a partial clear);
 *   (2) strategic_directives_v2 — clear is_working_on / active_session_id / claiming_session_id.
 * Never throws (fail-open): a failure just leaves the stale pointer, and self-claim still proceeds.
 */
async function selfHealStaleClaim(sb, sessionId, sdKey) {
  try {
    await sb.from('claude_sessions')
      .update({ sd_key: null, worktree_path: null, worktree_branch: null })
      .eq('session_id', sessionId)
      .eq('sd_key', sdKey); // CAS: only while this session still points at this SD
  } catch { /* fail-open */ }
  try {
    await sb.from('strategic_directives_v2')
      .update({ is_working_on: false, active_session_id: null, claiming_session_id: null })
      .eq('sd_key', sdKey)
      .eq('claiming_session_id', sessionId); // CAS: only while the SD is still ours
  } catch { /* fail-open */ }
}

/**
 * SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001: the authoritative query — does strategic_directives_v2
 * (the same columns sd:next and the coordinator read) say THIS session holds a live, unworked claim?
 * claude_sessions.sd_key is only ever a cache of this; this is the source of truth. Fail-open (null on
 * any error) so a query hiccup never turns a checkin into action=error.
 * @returns {Promise<string|null>} the sd_key of the owned claim, or null
 */
async function findOwnSdClaim(sb, sessionId) {
  try {
    const { data, error } = await sb.from('strategic_directives_v2')
      .select('sd_key')
      .eq('claiming_session_id', sessionId)
      .eq('is_working_on', true)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data ? data.sd_key : null;
  } catch { return null; }
}

/**
 * SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001: converge the claude_sessions.sd_key CACHE onto the
 * authoritative SD-side claim just found by findOwnSdClaim. Only ever writes sd_key — never touches
 * worktree_path/worktree_branch (ck_claude_sessions_worktree_state_consistency only rejects
 * sd_key=NULL with a non-null worktree column; sd_key=NOT-NULL with a null worktree column, the
 * state this write produces on a never-attached session, is always valid). CAS-guarded to a NULL
 * cache so this can never clobber a concurrent legitimate claim on the session row. Uses .select()
 * so the caller can detect a silent 0-row no-op (the CAS lost a race) instead of assuming success.
 * @returns {Promise<boolean>} true if the cache write is confirmed (readback returned a row)
 */
async function healOwnClaimPointer(sb, sessionId, sdKey) {
  try {
    const { data, error } = await sb.from('claude_sessions')
      .update({ sd_key: sdKey })
      .eq('session_id', sessionId)
      .is('sd_key', null) // CAS: only while the cache is still empty
      .select('session_id');
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

// SD-LEO-FEAT-WORKER-CHECKIN-SELF-001 (FR-1/FR-2): confirm a claimed row was HARD-DELETED before we
// release the claim on it. Returns true ONLY when TWO consecutive reads both find the row absent — a
// single eventual-consistency null must NEVER release a LIVE claim (observed live: a transient read
// returned null for an SD that still existed). A read ERROR returns false (fail-open: preserve the
// claim — exactly today's behaviour). Exported for unit tests.
async function confirmRowGone(sb, table, col, key) {
  try {
    const r1 = await sb.from(table).select(col).eq(col, key).maybeSingle();
    if (r1 && r1.error) return false;       // read error -> fail-open, do not release
    if (r1 && r1.data) return false;        // present -> not gone
    // Brief gap so the confirming read lands genuinely LATER — a confirming read fired on the same
    // tick/connection can repeat a momentary stale-replica null; a small delay lets it catch up
    // (adversarial review: same-replica back-to-back reads under-defend a lagging window).
    if (CONFIRM_DELETE_GAP_MS > 0) await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELETE_GAP_MS));
    const r2 = await sb.from(table).select(col).eq(col, key).maybeSingle(); // confirm
    // Fail-CLOSED on a malformed/absent r2: release ONLY when r2 is a well-formed result with no data
    // AND no error. A misbehaving client returning undefined must PRESERVE the claim, not drop it.
    return !!(r2 && !r2.data && !r2.error); // gone only if the confirming read is clean AND empty
  } catch { return false; }                 // any throw -> fail-open (preserve resume)
}

// SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: assign a fleet identity (NATO callsign + color) to a
// freshly-claimed worker AT check-in, instead of up to ~5 minutes later when the coordinator cron
// scripts/assign-fleet-identities.cjs next runs (it is the ONLY other writer of fleet_identity).
//
// Optimistic self-assign: read the live used-set, pick the next free callsign/color with the SAME
// pool/picker the cron uses, read-modify-merge our own claude_sessions.metadata, then emit a
// SET_IDENTITY message (the coordination-inbox hook writes .claude/fleet-identity-<csid>.json from
// it, which is what the statusline actually renders — see .claude/statusline.cjs). Concurrency is
// best-effort only: two simultaneous check-ins can pick the same callsign; the existing 5-min
// dedupeAssignedCallsigns cron pass (heartbeat-DESC, newest-wins) heals that duplicate exactly as it
// heals post-rotation collisions today. NEVER throws — any failure leaves the worker nameless (named
// by the next cron pass), never an action=error. Returns { callsign, color } or null.
//
// Caller (runCheckin wrapper) guarantees: a real claim is held and the worker has no callsign yet,
// and the session_id is not a test/ghost id. This helper additionally enforces the coordinator
// exclusion and is idempotent (adopts a complete identity the cron set in the race window).
async function assignFleetIdentityAtCheckin(sb, sessionId, claimSd) {
  try {
    // Re-read our row: source of metadata to merge (read-modify-merge — NEVER clobber), the
    // coordinator guard, and adoption of any identity assigned by the cron since the caller's read.
    const { data: cur } = await sb.from('claude_sessions')
      .select('metadata').eq('session_id', sessionId).maybeSingle();
    const myMeta = (cur && cur.metadata) || {};
    if (myMeta.is_coordinator === true) return null; // coordinators stay nameless in the worker pool (QF-20260508-648)
    // SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 (FR-4): role sessions (Adam/Solomon) run the fleet but
    // are NOT worker-pool members. Adam short-circuits to action=idle — exactly what the FR-1-relaxed
    // gate now names — so exclude them here at the authoritative metadata read too.
    if (myMeta.role === 'adam' || myMeta.role === 'solomon') return null;
    // FR-4: widen the ghost guard to the shared isFixtureSession superset so *-probe-* / QF-TEST-*
    // sessions (which the narrow isTestSessionId prefix list misses, bug 7b59dac8) never burn a pool
    // slot on an idle check-in. Fail-open: if the .mjs import fails, the gate's isTestSessionId
    // pre-filter + the role/coordinator guards above still apply — naming NEVER becomes action=error.
    try {
      const { isFixtureSession } = await import('../lib/fleet/session-predicates.mjs');
      if (isFixtureSession(sessionId)) return null;
    } catch { /* superset unavailable — retained isTestSessionId pre-filter still guards */ }
    const existing = myMeta.fleet_identity;
    // QF-20260627-108: idempotent ONLY when the existing callsign is in this worker's tier band
    // (effort-encoded SoT). A wrong-band callsign (e.g. a tier-2 worker still holding "Bravo") falls
    // through to re-derive, so check-in self-heals to the scheme just like the cron.
    if (existing && existing.callsign && existing.color
        && callsignInTierBand(existing.callsign, tierRankOf({ metadata: myMeta }))) {
      return { callsign: existing.callsign, color: existing.color };
    }
    // QF-20260703-665 (b): a re-band (existing callsign present but wrong tier band) is about to
    // vacate its current label. Stamp it below so OTHER sessions' next self-assign reserves it for
    // a grace window instead of an instant free-for-all claim (the "3x Charlie" collision class) --
    // reuses the reserveParkedIdentities parked-label pattern from assign-fleet-identities.cjs.
    const vacating = (existing && existing.callsign) ? existing.callsign : null;
    // Seed used-sets from currently-live assigned identities so we pick a FREE slot (not blindly Alpha).
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: live } = await sb.from('claude_sessions')
      .select('session_id, metadata')
      .gte('heartbeat_at', fiveMinAgo)
      .neq('status', 'terminated');
    // FR-6 batch 3: cap tripwire, not pagination — see warnIfCapTruncated's header for why
    // (test-stub chain constraint + tiny live set + cron-healed collision worst case).
    const liveRows = warnIfCapTruncated(live, 'claude_sessions (fleet-identity used-set seed)');
    const usedCallsigns = new Set(), usedColors = new Set();
    for (const r of liveRows) {
      if (!r || r.session_id === sessionId) continue;
      const id = r.metadata && r.metadata.fleet_identity;
      if (id && id.callsign) usedCallsigns.add(id.callsign);
      if (id && id.color) usedColors.add(id.color);
      const vac = r.metadata && r.metadata.fleet_identity_vacated;
      if (vac && vac.callsign && vac.vacated_at >= fiveMinAgo) usedCallsigns.add(vac.callsign);
    }
    const callsign = pickCallsignForTier(tierRankOf({ metadata: myMeta }), usedCallsigns);
    const color = nextAvailable(COLORS, usedColors);
    // display_name parity with the cron: assign-fleet-identities.cjs labels with `worker.sd_id`, a
    // column that does NOT exist on claude_sessions (it selects sd_key), so its label is ALWAYS
    // 'idle'. We match `${callsign} | idle` so the cron's 5-min refresh loop sees no mismatch and
    // never churns the row. The statusline reads callsign/color only, so the label is user-invisible.
    const display_name = `${callsign} | idle`;
    const metadata = {
      ...myMeta,
      fleet_identity: { color, callsign, display_name, assigned_at: new Date().toISOString() },
      ...(vacating ? { fleet_identity_vacated: { callsign: vacating, vacated_at: new Date().toISOString() } } : {}),
    };
    const { error } = await sb.from('claude_sessions').update({ metadata }).eq('session_id', sessionId);
    if (error) return null;
    // Emit SET_IDENTITY so the coordination-inbox hook writes the per-session statusline file. This is
    // the mechanism that makes the name VISIBLE; still fail-open — a message failure leaves the DB
    // identity authoritative and the next cron refresh re-emits the message.
    try {
      await insertCoordinationRow(sb, {
        target_session: sessionId,
        target_sd: claimSd || null,
        message_type: 'SET_IDENTITY',
        subject: `Identity: ${callsign} (${color})`,
        body: `The coordinator assigned you callsign "${callsign}" with color "${color}" at check-in. Your statusline will update automatically.`,
        payload: { color, callsign, display_name },
        sender_type: 'coordinator',
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      });
    } catch { /* best-effort: cron re-emits within 5 min */ }
    return { callsign, color };
  } catch { return null; }
}

// Public check-in entrypoint: resolve the action, then name an identity-less worker before returning
// so the SAME response reports the callsign. Naming is a thin fail-open wrapper over resolveCheckin so
// it covers ALL paths at one site, without threading naming through each return.
//
// SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 (FR-1): name a worker on ARRIVAL — every SUCCESSFUL
// (non-error) check-in INCLUDING action=idle — not only when it holds a claim. Naming is an arrival
// property of a fleet member, not a reward for holding work (a freshly-swapped fleet was looking
// half-anonymous). Idempotent via !result.callsign; the coordinator / role (adam|solomon) / fixture
// exclusions live in the isTestSessionId pre-filter + assignFleetIdentityAtCheckin. claimedId is null
// for an idle arrival and flows through cleanly (SET_IDENTITY target_sd becomes null).
async function runCheckin(sb, sessionId, opts = {}) {
  const result = await resolveCheckin(sb, sessionId, opts);
  try {
    const claimedId = result && (result.sd || result.qf); // SD actions carry .sd; a QF self-claim carries .qf; null when idle
    if (
      result &&
      result.action !== 'error' &&        // FR-1: name on any SUCCESSFUL action (incl. idle)
      !result.callsign &&                 // already named -> nothing to do (idempotent)
      !isTestSessionId(sessionId)         // cheap ghost/test pre-filter (QF-20260528-581); helper widens to isFixtureSession
    ) {
      const assigned = await assignFleetIdentityAtCheckin(sb, sessionId, claimedId || null);
      if (assigned && assigned.callsign) result.callsign = assigned.callsign;
    }
  } catch { /* fail-open: naming must NEVER turn a check-in into action=error */ }
  // SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C (FR-4): when this tick actually skipped one
  // or more belt candidates due to an active coordinator reservation, make that explicit in the
  // top-level message regardless of which step ultimately resolved the tick (self_claimed,
  // self_claimed_qf, idle, ...) -- an autonomous LLM worker reading only `message` must not
  // mistake a deliberate fence for a stuck/broken belt and file a false RCA / `/signal stuck`.
  // Purely additive: no new action value, absent/empty reservation_fences_skipped is a no-op.
  try {
    if (result && Array.isArray(result.reservation_fences_skipped) && result.reservation_fences_skipped.length && typeof result.message === 'string') {
      const skippedKeys = result.reservation_fences_skipped.map((f) => f.sd).join(', ');
      result.message = `${result.message} [Reservation fence: ${skippedKeys} skipped this tick by an active coordinator reservation — deliberate, working as intended, no action needed.]`;
    }
  } catch { /* fail-open: message augmentation must NEVER turn a check-in into action=error */ }
  return result;
}

/**
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3, FR-7): read-modify-merge a worker's
 * --model/--effort self-report into its session metadata. Pure (no I/O) — the caller
 * persists the result. Returns { metadata, changed } where `changed` is false (and
 * `metadata` is the UNTOUCHED input) when both cliModel and cliEffort are absent (TR-2:
 * byte-identical no-op) OR when the merge would not actually alter any field (idempotent
 * diff-guard — a repeated identical call never re-writes the same values).
 *
 * effort_source='chairman' (or any coordinator-stamped source other than the worker's own
 * self-report) WINS over a worker's --effort flag — effort is not reliably self-detectable
 * by the worker LLM, so an authoritative external stamp is never silently overwritten.
 * Self-report only fills metadata.effort when effort_source is unset or already
 * 'worker_self_report'. model has no analogous protection (models ARE reliably
 * self-reportable).
 *
 * @param {object|null} sessionMetadata current claude_sessions.metadata (may be null)
 * @param {{ model?: string|null, effort?: string|null }} cli parsed --model/--effort
 * @returns {{ metadata: object|null, changed: boolean }}
 */
function mergeCheckinModelEffort(sessionMetadata, { model: cliModel = null, effort: cliEffort = null } = {}) {
  if (!cliModel && !cliEffort) return { metadata: sessionMetadata, changed: false }; // TR-2 no-op

  const current = sessionMetadata || {};
  const next = { ...current };
  let changed = false;

  if (cliModel) {
    const normalized = normalizeModel(cliModel);
    if (next.model !== normalized) { next.model = normalized; changed = true; }
  }

  if (cliEffort) {
    const effortSource = current.effort_source;
    const chairmanWins = effortSource && effortSource !== 'worker_self_report';
    if (!chairmanWins) {
      const normalized = normalizeEffort(cliEffort);
      if (next.effort !== normalized) { next.effort = normalized; changed = true; }
      if (next.effort_source !== 'worker_self_report') { next.effort_source = 'worker_self_report'; changed = true; }
    }
  }

  if (changed) {
    const finalModel = next.model || current.model;
    const finalEffort = next.effort || current.effort;
    if (finalModel && finalEffort) {
      // QF-20260705-394: rankForModelEffort now returns the STATIC-ladder dense rank
      // (ladder-bounded by construction), so it is stamped UNCLAMPED. The old
      // clamp() bound it to the process-cached live top rank — a live-shrunk cache
      // (K=3 fleet) collapsed a fable/xhigh self-report to 3, below statically-stamped
      // min_tier_rank=4 SDs, clobbering coordinator rank stamps on every checkin.
      const rank = rankForModelEffort(finalModel, finalEffort);
      if (next.tier_rank !== rank) next.tier_rank = rank;
    }
  }

  return changed ? { metadata: next, changed: true } : { metadata: sessionMetadata, changed: false };
}

async function resolveCheckin(sb, sessionId, { getCoordinator = getActiveCoordinatorId, model: cliModel = null, effort: cliEffort = null } = {}) {
  // 1. resolve coordinator (fail-open to null -> broadcast)
  let coordinatorId = null;
  try { coordinatorId = await getCoordinator(sb); } catch { coordinatorId = null; }

  // 2. confirm callsign + current claim
  let callsign = null, mySd = null, sessionRole = null, sessionMetadata = null;
  try {
    const { data } = await sb.from('claude_sessions').select('metadata, sd_key').eq('session_id', sessionId).maybeSingle();
    if (data) {
      sessionMetadata = data.metadata || null;
      callsign = (data.metadata && (data.metadata.fleet_identity?.callsign || data.metadata.callsign)) || null;
      mySd = data.sd_key || null;
      // FR-3 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): role feeds the ackMessage
      // Adam-directive guard (Adam sessions never auto-ack directive kinds via checkin).
      sessionRole = (data.metadata && data.metadata.role) || null;
    }
  } catch { /* fail-open */ }

  const ctx = {
    sb,
    sessionId,
    opts: { cliModel, cliEffort },
    coordinatorId,
    callsign,
    mySd,
    sessionRole,
    sessionMetadata,
    base: null,
    helpers: CHECKIN_HELPERS,
  };
  return runSteps(CHECKIN_STEPS, ctx);
}

/**
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3): parse --model <value> / --effort <value>
 * from argv. Pure, no validation beyond presence — normalizeModel/normalizeEffort in
 * mergeCheckinModelEffort handle unknown-value conservative-UP mapping. Absent flags
 * resolve to null (the TR-2 no-op signal). Exported for tests.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ model: string|null, effort: string|null }}
 */
function parseCheckinArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };
  return { model: get('--model'), effort: get('--effort') };
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: 'CLAUDE_SESSION_ID env var required (set by the SessionStart hook).' }, null, 2));
    process.exit(1);
  }
  const { model: cliModel, effort: cliEffort } = parseCheckinArgs(process.argv.slice(2));
  let sb;
  try {
    sb = ws.getServiceClient();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: `supabase client unavailable: ${e.message}` }, null, 2));
    process.exit(1);
  }
  const result = await runCheckin(sb, sessionId, { model: cliModel, effort: cliEffort });
  console.log(JSON.stringify(result, null, 2));
}

// SD-ARCH-HOTSPOT-CHECKIN-001: dependency injection for the lib/checkin/steps/* pipeline.
// Steps destructure what they need from ctx.helpers instead of require()ing this file (which
// would be circular). Every name below is either defined above in this file or imported at the
// top (imports are referenced directly — never re-derived).
const CHECKIN_HELPERS = { ws, tryClaim, ackMessage, extractSdFromAssignment, extractDirectedSd, isInformationalNudge, classifyDispatchIneligibility, coordinatorReservation, isSeatBusyOnDirectedWork, registerRollCall, rehydrateCallsign, selfClearQuarantine, mergeCheckinModelEffort, recoverStrandedFinal, adoptOrphanInProgress, isSelfClaimDisabled, isGlobalStandDownActive, isBuildForbiddenSession, ensureActiveBaseline, isCriticalQfJumpEligible, tryClaimDraftCandidate, baselinedCandidateEligible, isSdInFlight, selfClaimQuickFix, selfHealStaleClaim, findOwnSdClaim, healOwnClaimPointer, confirmRowGone, surfaceCoordinatorMessages, fetchDraftCandidates, fetchNewestDraftCandidates, fetchFleetCriticalCandidates, fetchRankedCandidates, sortByDispatchRank, resolveWorkerTierRank, isTieringActive, fetchLowerTierBacklogData, ladderTopRank, fetchFableWindowActive, claimableForTier, claimableForRepo, getCommsActivitySignals, computeAdaptiveCadence, antiWinddownDirective, ASSIGNMENT_RECENCY_WINDOW_MS, TERMINAL_CLAIM_ERRORS, QF_CANDIDATE_LIMIT, SELF_CLAIM_CANDIDATE_LIMIT, DEFAULT_IDLE_WAKEUP_SECONDS };

module.exports = { extractSdFromAssignment, extractDirectedSd, isInformationalNudge, tryClaim, registerRollCall, ackMessage, isCoordinatorPush, surfaceCoordinatorMessages, rehydrateCallsign, runCheckin, resolveCheckin, assignFleetIdentityAtCheckin, selfClaimQuickFix, isAutoStartableQF, sortQfCandidatesBySeverity, QF_SEVERITY_RANK, isCriticalQfJumpEligible, CRITICAL_QF_JUMP_GRACE_MS, selfClaimDraftSd, fetchDraftCandidates, fetchNewestDraftCandidates, fetchFleetCriticalCandidates, fetchRankedCandidates, tryClaimDraftCandidate, draftDepsSatisfied, baselinedCandidateEligible, recoverStrandedFinal, adoptOrphanInProgress, isSelfClaimDisabled, isQuarantined, isParked, selfClearQuarantine, isGlobalStandDownActive, isSdInFlight, isForeignSessionLive, foreignClaimantBlocksSteal, selfHealStaleClaim, findOwnSdClaim, healOwnClaimPointer, confirmRowGone, orderByRankMap, orderByFleetCriticalThenRank, sortByDispatchRank, DISPATCH_RANK_TTL_MS, PRIORITY_RANK, SD_KEY_RE, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS, antiWinddownDirective, mergeCheckinModelEffort, parseCheckinArgs };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    process.exit(1);
  });
}
