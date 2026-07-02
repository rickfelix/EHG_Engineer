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
const ws = require('../lib/fleet/worker-status.cjs');
const { stampClaim } = require('../lib/fleet/claim-stamp.cjs');
// SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001: acquisition-time guard so a propose-only
// (non_fleet/role=adam) session never self-claims a build SD — the shared predicate
// the ESM claim-validity gate also uses (one source; no asymmetry).
const { isBuildForbiddenSession } = require('../lib/claim/build-forbidden-session.cjs');
const { ensureActiveBaseline } = require('../lib/fleet/ensure-active-baseline.cjs');
// SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: shared dispatch-eligibility predicate, also used by
// scripts/stale-session-sweep.cjs CLAIM_FIX (closes the self_claim-vs-sweep writer-consumer-asymmetry).
const { draftDepsSatisfied, baselinedCandidateEligible, classifyDispatchIneligibility, parentLeadPending } = require('../lib/fleet/claim-eligibility.cjs');
// SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3): WORK-DOWN-NEVER-UP on the PULL path.
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3): --model/--effort capture at check-in.
const { resolveWorkerTierRank, isTieringActive, normalizeModel, normalizeEffort, rankForModelEffort, clamp: clampTierRank } = require('../lib/fleet/tier-ladder.cjs');
// SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): tier-aware "claimable-to-MY-rung" rollup.
const { claimableForTier } = require('../lib/fleet/tier-claimable.cjs');
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): backlog-gated downward claims. The fetcher is
// SHARED with lib/coordinator/dispatch.cjs's assertWorkerTierAllowed so the pull path (here) and
// the directed-dispatch path compute an IDENTICAL backlog verdict — never two re-derivations.
const { fetchLowerTierBacklogData } = require('../lib/fleet/tier-backlog.cjs');
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

const ROLL_CALL_TTL_MS = 60 * 60 * 1000;     // availability row lives 1h
const ROLL_CALL_DEDUP_MS = 5 * 60 * 1000;    // don't re-register within 5m (idempotency)
// SD-LEO-INFRA-LOOP-RESUME-DELAY-SHORTEN-001: shortened from 1200 (20m) to 600 (10m) so a
// finished idle worker re-engages its /loop ~2x faster and the fleet stops looking idle.
// Trade-off: idle workers re-check roughly twice as often, a modest increase in /checkin DB
// chatter — but each idle check is a cheap idempotent roll_call (5m dedup), so the cost is
// small. NOT applied to the propose-only idle branch below, which keeps its own 1200 literal.
const DEFAULT_IDLE_WAKEUP_SECONDS = 600;      // ~10m, matches the tightened fleet idle cadence

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
const QF_CANDIDATE_LIMIT = 25;               // open quick_fixes to consider for self-claim
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
  return metadata.self_claim === false
    || metadata.availability === 'idle_only'
    || metadata.coordinator_stand_down === true;
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
    const p_track = await resolveTrack(sb, sdKey, track);
    const { data, error } = await sb.rpc('claim_sd', { p_sd_id: sdKey, p_session_id: sessionId, p_track });
    if (error) return { ok: false, error: error.message };
    if (data && data.success === false) return { ok: false, error: data.error || 'claim_rejected', owner: data.claimed_by };
    await stampClaim(sb, sdKey, sessionId); // fail-soft boundary instrumentation (SD-MAN-INFRA-SAME-TURN-NEXT-001 FR-3)
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
    const { data, error } = await sb
      .from('session_coordination')
      .insert({
        sender_session: sessionId,
        sender_type: 'worker',
        target_session: coordinatorId || 'broadcast-coordinator',
        message_type: 'INFO',
        subject: `[ROLL_CALL] ${callsign || 'unassigned'} ${mySd ? 'working ' + mySd : 'available'}`,
        body: null,
        payload,
        expires_at: new Date(Date.now() + ROLL_CALL_TTL_MS).toISOString(),
      })
      .select('id')
      .single();
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
    out.push({ id: m.id, message_type: m.message_type, kind, chairman_directive: isChairmanDirective, subject: m.subject || null, body: m.body || null, created_at: m.created_at });
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
  if (qf.routing_tier != null && Number(qf.routing_tier) >= 3) return false;  // persisted Tier-3 -> full SD, not auto-QF
  if (TIER3_RISK_RE.test(qf.title || '')) return false;                        // risk-keyword drift -> hold for triage/human
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
async function selfClaimQuickFix(sb, sessionId, base) {
  try {
    const { data: qfs } = await sb
      .from('quick_fixes')
      .select('id, status, pr_url, commit_sha, created_at, routing_tier, title')
      .eq('status', 'open')
      .is('pr_url', null)
      .is('commit_sha', null)
      .order('created_at', { ascending: true })
      .limit(QF_CANDIDATE_LIMIT);
    const nowMs = Date.now();
    for (const qf of (qfs || [])) {
      if (!isAutoStartableQF(qf, nowMs)) continue;
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
  if (!(await draftDepsSatisfied(sb, d))) return null; // skip dependency-blocked
  // SD-REFILL-00SO4HZY: skip an orchestrator child whose parent has not yet passed LEAD (a worker would
  // otherwise drive PLAN then hit the hard EXEC-transition block). Fail-open inside parentLeadPending.
  if (await parentLeadPending(sb, d)) return null;
  if (await isSdInFlight(sb, d.sd_key, sessionId)) return null; // dedup: started or live-foreign-held
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
      .select('sd_key, sd_type, status, current_phase, metadata, updated_at, target_application')
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
    // Seed used-sets from currently-live assigned identities so we pick a FREE slot (not blindly Alpha).
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: live } = await sb.from('claude_sessions')
      .select('session_id, metadata')
      .gte('heartbeat_at', fiveMinAgo)
      .neq('status', 'terminated');
    const usedCallsigns = new Set(), usedColors = new Set();
    for (const r of (live || [])) {
      if (!r || r.session_id === sessionId) continue;
      const id = r.metadata && r.metadata.fleet_identity;
      if (id && id.callsign) usedCallsigns.add(id.callsign);
      if (id && id.color) usedColors.add(id.color);
    }
    const callsign = pickCallsignForTier(tierRankOf({ metadata: myMeta }), usedCallsigns);
    const color = nextAvailable(COLORS, usedColors);
    // display_name parity with the cron: assign-fleet-identities.cjs labels with `worker.sd_id`, a
    // column that does NOT exist on claude_sessions (it selects sd_key), so its label is ALWAYS
    // 'idle'. We match `${callsign} | idle` so the cron's 5-min refresh loop sees no mismatch and
    // never churns the row. The statusline reads callsign/color only, so the label is user-invisible.
    const display_name = `${callsign} | idle`;
    const metadata = { ...myMeta, fleet_identity: { color, callsign, display_name, assigned_at: new Date().toISOString() } };
    const { error } = await sb.from('claude_sessions').update({ metadata }).eq('session_id', sessionId);
    if (error) return null;
    // Emit SET_IDENTITY so the coordination-inbox hook writes the per-session statusline file. This is
    // the mechanism that makes the name VISIBLE; still fail-open — a message failure leaves the DB
    // identity authoritative and the next cron refresh re-emits the message.
    try {
      await sb.from('session_coordination').insert({
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
      const rank = clampTierRank(rankForModelEffort(finalModel, finalEffort));
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

  // 2c. SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3): merge --model/--effort into
  // sessionMetadata BEFORE it is used below (tierCtx.worker_tier_rank at the resolveWorkerTierRank
  // call further down reads sessionMetadata, so this call's own fresh values must land here first).
  // Fail-open: a persist error never blocks the check-in itself.
  try {
    const { metadata: mergedMetadata, changed } = mergeCheckinModelEffort(sessionMetadata, { model: cliModel, effort: cliEffort });
    if (changed) {
      sessionMetadata = mergedMetadata;
      await sb.from('claude_sessions').update({ metadata: mergedMetadata }).eq('session_id', sessionId);
    }
  } catch { /* fail-open: check-in proceeds with whatever metadata was already read */ }

  // 2b. FR-2: re-hydrate callsign from the durable SET_IDENTITY row if metadata lost it (survives
  // release/sweep). Runs BEFORE registerRollCall so the re-hydrated callsign flows into the roll-call
  // row + base.callsign in the SAME response.
  if (!callsign) {
    const rehydrated = await rehydrateCallsign(sb, sessionId, sessionMetadata);
    if (rehydrated) callsign = rehydrated;
  }

  // 3. register availability (idempotent)
  const rollCall = await registerRollCall(sb, { sessionId, coordinatorId, callsign, mySd });

  const base = { ok: true, callsign, coordinator: coordinatorId, roll_call_id: rollCall.id, two_way: process.env.COORDINATOR_TWOWAY_V2 === 'on' };

  // SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (b): surface the prior wind-down reason captured by the
  // Stop hook (claude_sessions.metadata.wind_down) so the /checkin skill can render "you previously
  // stopped because X — confirm/correct" and the worker can correct the inferred reason at re-engage.
  base.prior_wind_down = (sessionMetadata && sessionMetadata.wind_down) ? sessionMetadata.wind_down : null;

  // FR-1/FR-3: surface UNCONSUMED coordinator->worker push as coordinator_messages[] on the `base`
  // object so EVERY return path (resume / idle / self_claimed / self_claimed_qf) carries it — a busy
  // claim-holder AND an idle worker both see coordinator coaching. Non-draining + bounded (see fn).
  base.coordinator_messages = await surfaceCoordinatorMessages(sb, sessionId, { role: sessionRole });

  // 4. already working -> resume. A self-claimed quick-fix lands in claude_sessions.sd_key
  // too (claim_sd writes it for QF-% ids), so a QF claim must resume into the /quick-fix
  // workflow — NOT sd-start, which is SD-only (QFs have no worktree / LEAD-PLAN-EXEC).
  if (mySd) {
    const isQf = /^QF-/.test(mySd);
    // FR-2 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): a stale claude_sessions.sd_key pointing at
    // a TERMINAL/parked SD (completed/cancelled/deferred) would loop action=resume forever. Before
    // resuming, verify the SD is still resumable; if terminal, self-heal (CAS-guarded to THIS session)
    // and fall through to self-claim. pending_approval is NOT terminal — it resumes (to run
    // LEAD-FINAL-APPROVAL) and recoverStrandedFinal (step 5.7) owns the cleared-claim variant.
    // Fail-open: any query error preserves today's resume.
    let staleTerminal = false;
    // SD-LEO-FEAT-WORKER-CHECKIN-SELF-001 (FR-1): a HARD-DELETED claimed SD (row gone) used to fall
    // through every guard and loop action=resume on a ghost forever (sd-start then exits SD-not-found
    // = permanent strand). Track it separately and self-heal it like a stale-terminal claim.
    let staleDeleted = false;
    if (!isQf) {
      try {
        const { data: sdRow, error: sdErr } = await sb.from('strategic_directives_v2').select('status').eq('sd_key', mySd).maybeSingle();
        if (sdErr) throw sdErr; // read error -> fail-open (preserve resume)
        if (sdRow) {
          if (['completed', 'cancelled', 'deferred'].includes(sdRow.status)) staleTerminal = true;
        } else if (await confirmRowGone(sb, 'strategic_directives_v2', 'sd_key', mySd)) {
          // FR-2: only after a CONFIRMING re-read also finds the row absent (never release on a single
          // transient/eventual-consistency null).
          staleDeleted = true;
        }
      } catch { /* fail-open: leave flags false -> resume preserved */ }
    } else {
      // Quick-fix QF-20260612-113: QF claims land in claude_sessions.sd_key too, but the
      // terminal self-heal above was SD-only — a completed/cancelled/escalated QF looped
      // action=resume forever. Apply the same check against quick_fixes.status.
      try {
        const { data: qfRow, error: qfErr } = await sb.from('quick_fixes').select('status').eq('id', mySd).maybeSingle();
        if (qfErr) throw qfErr;
        if (qfRow) {
          if (['completed', 'cancelled', 'escalated'].includes(qfRow.status)) staleTerminal = true;
        } else if (await confirmRowGone(sb, 'quick_fixes', 'id', mySd)) {
          staleDeleted = true; // FR-1/FR-2: a hard-deleted quick-fix, confirmed absent
        }
      } catch { /* fail-open: leave flags false -> resume preserved */ }
    }
    if (staleTerminal || staleDeleted) {
      await selfHealStaleClaim(sb, sessionId, mySd);
      base.self_healed_stale_claim = mySd;
      if (staleDeleted) base.self_healed_deleted_claim = mySd; // FR-1: distinguish deleted from terminal
      mySd = null; // fall through to assignment / self-claim below
    } else {
      // SD-FDBK-FIX-WORKER-CHECK-SURFACES-001 (seam 1): a claim-holding worker used to
      // short-circuit to resume BEFORE the step-5 WORK_ASSIGNMENT pull, so a coordinator
      // directive targeting a BUSY worker was never read on check-in (witnessed: an assignment to
      // Alpha stayed UNREAD across full cycles). Peek for a WORK_ASSIGNMENT targeting THIS session
      // for a DIFFERENT SD and SURFACE it on the resume result so the worker sees it now. We do NOT
      // drain read_at and do NOT auto-switch the claim — never-strand (CLAUDE.md rule 7a): the
      // worker finishes / explicitly hands off current work, then actions the assignment (genuine
      // claim_sd/ackMessage stamps read_at then). Surfacing persists (seam 2 re-surfaces on poll)
      // until actioned. Fail-open: any error preserves today's plain resume.
      let pendingAssignment = null;
      try {
        const msgs = await ws.getMessagesForSession(sb, sessionId, { unreadOnly: true });
        // Only a row carrying a STRUCTURED directed field (assigned_sd/sd_key) is a real redirect;
        // selecting on extractDirectedSd also skips past the generic sweep advisory if a directed
        // row exists beneath it (finding #3: subtype-blind newest-wins .find() could otherwise mask
        // a genuine redirect). getMessagesForSession returns created_at DESC, so this is newest-first.
        const wa = (msgs || []).find(m => m.message_type === 'WORK_ASSIGNMENT' && extractDirectedSd(m));
        if (wa) {
          const waSd = extractDirectedSd(wa);
          if (waSd && waSd !== mySd) pendingAssignment = { sd: waSd, message_id: wa.id };
        }
      } catch { /* fail-open: no pending-assignment surfacing */ }
      const resumeMsg = isQf
        ? `Already claiming quick-fix ${mySd}; resume it: node scripts/read-quick-fix.js ${mySd}, then run the /quick-fix workflow (do NOT run sd-start.js for a QF).`
        : `Already claiming ${mySd}; resume work (run sd-start to (re)attach the worktree).`;
      return { ...base, action: 'resume', sd: mySd,
        ...(pendingAssignment ? { pending_work_assignment: pendingAssignment } : {}),
        message: pendingAssignment
          ? `${resumeMsg} NOTE: coordinator WORK_ASSIGNMENT pending for ${pendingAssignment.sd} — finish/hand off ${mySd} first, then claim it (never drop an in-progress SD).`
          : resumeMsg };
    }
  }

  // 4.5 ACQUISITION GUARD (SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001, feedback a159d1ec):
  // propose-only sessions (metadata.non_fleet=true / role=adam, CONST-002) must NEVER
  // acquire a build claim. The claim-validity gate's CHECK 1.5 only fires at sd-start/
  // handoff — but a propose-only session is the LEAST likely to ever reach a handoff, so
  // that tripwire never trips and an Adam session could self-claim here and starve real
  // workers (claim_sd surfaces it as a live foreign holder). Short-circuit to idle BEFORE
  // every acquisition tier (assignment, recoverStrandedFinal, adoptOrphanInProgress,
  // self-claim, QF). The resume of a pre-existing claim above is intentionally NOT blocked
  // (legacy state; the gate still blocks its handoffs). Fail-safe: only an explicit
  // non_fleet/adam triggers. A follow-up SD adds the symmetric guard inside the claim_sd
  // RPC (covers qf-start / sweep / reacquire callers too).
  if (isBuildForbiddenSession(sessionMetadata)) {
    return { ...base, action: 'idle', recommended_wakeup_seconds: 1200,
      message: 'Propose-only session (non_fleet / role=adam): build claims are forbidden per CONST-002 — not self-claiming. Adam proposes work via the decision queue.' };
  }

  // 5. pending WORK_ASSIGNMENT -> claim via claim_sd RPC
  let assignment = null;
  try {
    const msgs = await ws.getMessagesForSession(sb, sessionId, { unreadOnly: true });
    assignment = (msgs || []).find(m => m.message_type === 'WORK_ASSIGNMENT');
  } catch { /* fail-open */ }
  if (assignment) {
    const sdKey = extractSdFromAssignment(assignment);
    if (sdKey) {
      // SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: purge a STALE assignment whose target SD reached a
      // terminal status (completed/cancelled/deferred) AFTER the assignment was created — the
      // in_progress->terminal race. claim_sd now refuses terminal claims, but a never-ACKed
      // assignment would re-fire every tick (the "retried on every tick" symptom), so ACK it
      // here and fall through to self-claim. Fail-open: a query error skips the purge and lets
      // the normal claim path (now guarded by the RPC) handle it.
      let terminalStatus = null;
      try {
        const { data: tgt } = await sb.from('strategic_directives_v2')
          .select('status').eq('sd_key', sdKey).maybeSingle();
        if (tgt && ['completed', 'cancelled', 'deferred'].includes(tgt.status)) terminalStatus = tgt.status;
      } catch { /* fail-open: leave terminalStatus null, attempt the claim below */ }
      if (terminalStatus) {
        await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
        base.stale_assignment_purged = { sd: sdKey, status: terminalStatus };
      } else {
        const claimed = await tryClaim(sb, sdKey, sessionId);
        if (claimed.ok) {
          await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
          // SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-5): surface the coordinator's
          // ADVISORY effort recommendation so the worker banner can render it.
          const effortRec = assignment.payload?.effort_recommendation || null;
          return { ...base, action: 'claimed_assignment', sd: sdKey,
            ...(effortRec ? { effort_recommendation: effortRec, effort_recommendation_reason: assignment.payload?.effort_recommendation_reason || null } : {}),
            message: `Claimed assigned ${sdKey} via claim_sd.${effortRec ? ` Recommended effort: ${effortRec} (advisory).` : ''} Run: node scripts/sd-start.js ${sdKey}. ${antiWinddownDirective(base.belt_ranked_claimable)}` };
        }
        // could not claim the assigned SD -> fall through to self-claim
        base.assignment_claim_error = claimed.error;
      }
    }
  }

  // 5.7 SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001: recover a STRANDED pending_approval/LEAD_FINAL SD
  //      (claim cleared, one handoff from shipped) BEFORE self-claiming new work — finishing a
  //      near-shipped SD beats starting fresh. Re-claiming lets a worker run LEAD-FINAL-APPROVAL with
  //      a valid matching claim (passing the claim-validity gate the coordinator-from-main path fails).
  const recovered = await recoverStrandedFinal(sb, sessionId, base);
  if (recovered) return recovered;

  // 5.8 SD-FDBK-INFRA-ORPHAN-ADOPTION-WORKER-001: adopt an ORPHANED in_progress SD (zero active
  //     claims, session reaped mid-build) BEFORE self-claiming new work — finishing a
  //     partially-built SD beats starting fresh, but a one-handoff-from-shipped stranded final
  //     (5.7) still wins over a mid-build orphan.
  const adopted = await adoptOrphanInProgress(sb, sessionId, base);
  if (adopted) return adopted;

  // 5.9 SD-REFILL-00BCYOYW: session-level self-claim opt-out. Placed AFTER the recovery tiers (so a
  //     winding-down worker still finishes its own stranded/orphaned build work — that is not churn)
  //     and BEFORE step-6, so it skips ONLY the self_claim-from-sd:next path (step-6 + selfClaimQuickFix).
  //     roll_call, resume, directed WORK_ASSIGNMENT claiming and recovery all run before this point and
  //     are unaffected. Narrower sibling of the 4.5 isBuildForbiddenSession guard (which blocks ALL
  //     acquisition incl. directed work); this blocks only self-initiated claims.
  if (isSelfClaimDisabled(sessionMetadata)) {
    return { ...base, action: 'idle', recommended_wakeup_seconds: 1200,
      message: 'Session self-claim disabled (metadata.self_claim=false / availability=idle_only / coordinator_stand_down=true): skipping self-claim from sd:next to avoid grab-release churn that blocks fresh-session pickup of reserved SDs. roll_call, directed WORK_ASSIGNMENTs and own stranded/orphan recovery still honored. Clear the flag to resume self-claim.' };
  }
  // SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001 FR-2: a coordinator/global fleet stand-down halts the
  // whole fleet's self-claim (overnight-reduction / keeper-only / venture-parked / hard-halt). roll_call,
  // resume, directed WORK_ASSIGNMENT and recovery all ran above; only the sd:next self-claim is skipped.
  if (await isGlobalStandDownActive(sb)) {
    return { ...base, action: 'idle', recommended_wakeup_seconds: 1200,
      message: 'Global/fleet stand-down active (system_settings FLEET_STAND_DOWN / HARD_HALT_STATUS enabled): skipping self-claim from sd:next. roll_call, directed WORK_ASSIGNMENTs and own stranded/orphan recovery still honored. Clear the system_settings stand-down to resume fleet self-claim.' };
  }

  // 5.5 SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001: ensure an active execution baseline exists
  //      BEFORE reading v_sd_next_candidates. With zero active baseline the view returns 0 rows
  //      and self-claim silently idles with a full queue. Fail-open: a failure here degrades to
  //      today's behavior (read returns [] -> idle), never an error action.
  try { await ensureActiveBaseline(sb); } catch { /* fail-open: never block the checkin */ }

  // 6. self-claim from ONE merged SD pool: baselined sd:next candidates + claimable
  //    UN-BASELINED drafts, rank-sorted TOGETHER (QF-20260610-986, feedback dc87039d).
  //    The old sequential tiers (6 then 6.25) meant a coordinator dispatch_rank could
  //    never lift a draft above ANY baselined candidate — a rank-0 critical draft was
  //    skipped for rank-5 baselined mediums. Merging preserves the no-rank precedence
  //    (baselined entries listed first; orderByRankMap's stable sort keeps unranked
  //    rows in input order) while fresh ranks reorder across both pools. Per-kind
  //    eligibility guards and claim semantics unchanged; baselined entry wins a
  //    same-SD dedup (both pools can surface one SD).
  try {
    const { data: cands } = await sb
      .from('v_sd_next_candidates')
      .select('sd_id, track, status, priority')
      .limit(SELF_CLAIM_CANDIDATE_LIMIT);
    let draftRows = [];
    try { draftRows = await fetchDraftCandidates(sb); } catch { /* fail-open: drafts absent */ }
    // SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-1): a FOURTH source — the NEWEST-N drafts
    // (created_at DESC), so a fresh non-fleet_critical fit-draft at age-position 11+ (outside the oldest-10
    // fetchDraftCandidates window and not fleet_critical) is in the pool instead of starving. Fail-open,
    // mirroring the draft/fleet_critical fetches.
    let newestRows = [];
    try { newestRows = await fetchNewestDraftCandidates(sb); } catch { /* fail-open: newest window absent */ }
    // SD-LEO-INFRA-SELF-CLAIM-WINDOW-FLEET-CRITICAL-001 (FR-2): a THIRD source for fleet_critical SDs
    // that sit OUTSIDE both windows above, so the downstream fleet_critical lift has them in the pool to
    // reorder. Placed here, inside the step-6 try and downstream of ALL acquisition guards (4.5/5.7/5.8/5.9).
    let fcRows = [];
    try { fcRows = await fetchFleetCriticalCandidates(sb); } catch { /* fail-open: window-only behavior */ }
    // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B (FR-1/FR-2): a FIFTH source for SDs the
    // coordinator has ranked (metadata.dispatch_rank set) that sit OUTSIDE every window above, so a
    // ranked-but-not-fleet_critical, middle-of-the-backlog SD is not wasted ranking work.
    let rankedRows = [];
    try { rankedRows = await fetchRankedCandidates(sb); } catch { /* fail-open: window-only behavior */ }

    const seen = new Set();
    const merged = [];
    for (const c of (cands || [])) {
      if (c.sd_id && !seen.has(c.sd_id)) { seen.add(c.sd_id); merged.push({ kind: 'baselined', key: c.sd_id, track: c.track }); }
    }
    for (const d of draftRows) {
      if (d.sd_key && !seen.has(d.sd_key)) { seen.add(d.sd_key); merged.push({ kind: 'draft', key: d.sd_key, row: d }); }
    }
    // SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-1/FR-3): union the NEWEST-N drafts as
    // kind:'draft' rows (so each routes through tryClaimDraftCandidate -> the COMPLETE eligibility SSOT),
    // deduped by the SAME seen-set so an SD already surfaced by the oldest-10 window keeps its existing
    // entry (no double-count). Widens the POOL only; changes NO eligibility/ordering semantics.
    for (const d of newestRows) {
      if (d.sd_key && !seen.has(d.sd_key)) { seen.add(d.sd_key); merged.push({ kind: 'draft', key: d.sd_key, row: d }); }
    }
    // FR-2: union the fleet_critical source LAST so an SD already surfaced by the view/draft windows keeps
    // its existing entry (dedup via the SAME seen-set). kind:'baselined' routes each injected entry through
    // baselinedCandidateEligible -> the COMPLETE eligibility SSOT (classifyDispatchIneligibility incl. the
    // WORK-DOWN-NEVER-UP tier axis + parentLeadPending + refillSourceIneligibility + draftDepsSatisfied),
    // then isSdInFlight, then tryClaim — NO eligibility/claim bypass. sortByDispatchRank then lifts these
    // (strict-boolean fleet_critical) to the front of the merged pool.
    for (const f of fcRows) {
      if (f.sd_key && !seen.has(f.sd_key)) { seen.add(f.sd_key); merged.push({ kind: 'baselined', key: f.sd_key }); }
    }
    // FR-2 (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B): union the ranked-direct source LAST so
    // an SD already surfaced by any prior source keeps its existing entry (SAME seen-set dedup).
    // kind:'baselined' routes each injected entry through baselinedCandidateEligible -> the COMPLETE
    // eligibility SSOT, exactly like the fleet_critical union above — no eligibility/claim bypass.
    for (const r of rankedRows) {
      if (r.sd_key && !seen.has(r.sd_key)) { seen.add(r.sd_key); merged.push({ kind: 'baselined', key: r.sd_key }); }
    }

    // duty-6: honor the coordinator's fresh dispatch_rank across the WHOLE pool (fail-open).
    const ranked = await sortByDispatchRank(sb, merged, (x) => x.key);
    // FR-1 (anti-premature-winddown): expose the ranked claimable belt depth on EVERY result so the
    // /checkin skill can render concrete available work — a worker about to wind down sees data, not a
    // vibe. base is spread into the self_claimed / idle / QF results below.
    base.belt_ranked_claimable = ranked.length;
    // SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3 + FR-5): resolve this worker's rung
    // and whether tiering is active ONCE per checkin (both are per-run constants, not per-candidate),
    // then thread into the shared classifier so a below-rung worker skips above-rung work. Fail-open:
    // any fault leaves tierCtx empty => byte-identical pre-tiering behavior.
    let tierCtx = {};
    try {
      tierCtx = {
        worker_tier_rank: resolveWorkerTierRank({ metadata: sessionMetadata }),
        tiering_active: await isTieringActive(sb),
      };
    } catch { /* fail-open: no tier ctx */ }
    // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): precompute the backlog verdict inputs ONCE
    // per tick — lowerTierBacklog() itself is pure/sync (runs inside classifyDispatchIneligibility),
    // but its two halves (claimable-by-tier, idle-by-tier) are DB-dependent, so fetchLowerTierBacklogData
    // does the fetch here and the result is threaded into tierCtx.lower_tier_backlog_data. Only when
    // tiering is active (mirrors every other tier-axis fetch in this function) — with < 2 live workers
    // the whole tier axis, including this gate, must stay inert (degrade-to-1). Fail-open: a null
    // return leaves the field unset, which is the classifier's documented byte-identical
    // WORK-DOWN-ALWAYS fallback.
    if (tierCtx.tiering_active === true) {
      const backlogData = await fetchLowerTierBacklogData(sb);
      if (backlogData) tierCtx.lower_tier_backlog_data = backlogData;
    }
    // QF-20260630-761: snapshot whether tiering is active so the idle message (below, outside this
    // scope) only attributes a 0-claimable belt to TIER when tiering is actually on. With tiering off
    // the 0 is non-tier ineligibility (orchestrator parents / clone trees / human-action / held).
    base.belt_tiering_active = tierCtx.tiering_active === true;
    // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): belt_ranked_claimable above is the
    // tier-AGNOSTIC ranked pool — a below-rung worker sees it non-zero even when every ranked SD is
    // above its rung, then idles for hours on false "ranked" hope. Expose belt_claimable_at_my_tier:
    // of the ranked pool, how many are base-eligible AND reachable at THIS worker's rung (shared
    // tier-claimable rollup, reusing the gate). One batched fetch supplies the metadata the view-sourced
    // baselined candidates lack. Fail-open to the agnostic count so a fault never under-reports.
    base.belt_claimable_at_my_tier = base.belt_ranked_claimable;
    try {
      // QF-20260629-597: ALL ranked keys are sd_keys — baselined keys come from
      // v_sd_next_candidates.sd_id which holds the sd_key STRING (not a UUID), and draft keys are sd_key.
      // The prior split fetched baselined via .in('id', ids), matching the UUID `id` column against sd_key
      // strings => 0 rows => baselined candidates dropped from the tier pool => belt_claimable_at_my_tier
      // under-counted to 0. One fetch keyed by sd_key is correct for both kinds.
      const allKeys = ranked.map((x) => x.key).filter(Boolean);
      const cols = 'sd_key,id,sd_type,status,description,title,metadata,target_application,claiming_session_id';
      let pool = [];
      if (allKeys.length) {
        const { data } = await sb.from('strategic_directives_v2').select(cols).in('sd_key', allKeys);
        // QF-20260629-047: drop SDs already claimed by ANOTHER session — they are not claimable-to-me, so
        // counting them inflates belt_claimable_at_my_tier and suppresses the tier-deficit idle message
        // (which only fires at 0). Mirrors the forecaster's `if (d.claiming_session_id) continue;`. Keep
        // rows claimed by THIS session (resume) and unclaimed rows.
        pool = (data || []).filter((r) => !r.claiming_session_id || r.claiming_session_id === sessionId);
      }
      base.belt_claimable_at_my_tier = claimableForTier(pool, {
        workerTierRank: tierCtx.worker_tier_rank,
        tieringActive: tierCtx.tiering_active === true,
      }).length;
    } catch { /* fail-open: keep the agnostic count */ }
    for (const x of ranked) {
      if (x.kind === 'baselined') {
        // SD-FDBK-FIX-WORKER-SELF-CLAIM-001: skip dependency-blocked SDs and orchestrator PARENTS
        // (the view surfaces both; claim_sd enforces neither). Mirrors the draft-tier guard.
        // SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): {cwd} adds the claim-time fitness axes so a
        // baselined candidate unfit for THIS checkout is skipped before claiming.
        if (!(await baselinedCandidateEligible(sb, x.key, { cwd: process.cwd(), ...tierCtx }))) continue;
        if (await isSdInFlight(sb, x.key, sessionId)) continue;  // dedup: started or live-foreign-held
        const claimed = await tryClaim(sb, x.key, sessionId, x.track);
        if (claimed.ok) {
          return { ...base, action: 'self_claimed', sd: x.key, track: x.track,
            message: `Self-claimed ${x.key} from sd:next. Run: node scripts/sd-start.js ${x.key}. ${antiWinddownDirective(ranked.length)}` };
        }
      } else {
        const result = await tryClaimDraftCandidate(sb, sessionId, base, x.row, tierCtx);
        if (result) return result;
      }
    }
  } catch { /* fail-open */ }

  // 6.5 self-claim an open quick_fix. v_sd_next_candidates is SD-only, so open
  // QFs are sourced here — strictly BELOW SD candidates and ABOVE idle, so a
  // worker pulls an open QF instead of idling, but SD work always wins.
  // SD-LEO-INFRA-MAKE-OPEN-QFS-001.
  const qfClaimed = await selfClaimQuickFix(sb, sessionId, base);
  if (qfClaimed) return qfClaimed;

  // 7. idle -> recommend a wakeup (ScheduleWakeup is a HARNESS tool, not Node-callable)
  // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): when the ranked pool is non-empty but NONE of
  // it is claimable at this worker's rung, say so explicitly — otherwise the agnostic count reads as
  // "work exists for me" and the idle looks like a bug rather than a tier deficit.
  const rankedAgnostic = base.belt_ranked_claimable ?? 0;
  const claimableAtTier = base.belt_claimable_at_my_tier ?? rankedAgnostic;
  // QF-20260630-761: only blame TIER when tiering is actually active. When tiering is OFF (degrade-to-1,
  // <2 live workers) the tier axis is inert, so a 0-claimable belt with ranked>0 means the ranked items
  // are ineligible for NON-tier reasons (orchestrator parents / clone build-trees / human-action / held)
  // — a higher-tier worker could not take them either. Attributing it to "your rung" misdirects.
  const tierNote = (rankedAgnostic > 0 && claimableAtTier === 0)
    ? (base.belt_tiering_active === true
        ? ` (${rankedAgnostic} ranked, but 0 claimable at your tier — all above your rung; a higher-tier worker must take them.)`
        : ` (${rankedAgnostic} ranked, but 0 claimable by any worker — they are orchestrator parents / clone build-trees / human-action / held, not tier-blocked.)`)
    : '';
  // SD-LEO-INFRA-ADAPTIVE-COMMS-CADENCE-SHARED-PROTOCOL-001 (FR-6): opt-in tightening. A worker
  // idling on the belt but awaiting a reply on a live comms thread (e.g. a blocked-item question
  // to the coordinator) shouldn't wait a full baseline interval to notice the reply. ADDITIVE
  // ONLY — never loosens the existing belt-driven recommendation, never touches claim/heartbeat.
  // Fail-open: any error here falls through to the unchanged baseline recommendation.
  let idleWakeupSeconds = DEFAULT_IDLE_WAKEUP_SECONDS;
  let adaptiveCadenceNote = '';
  try {
    const signals = await getCommsActivitySignals(sb, sessionId);
    const cadence = computeAdaptiveCadence(signals);
    if (cadence.tight && cadence.intervalMs / 1000 < idleWakeupSeconds) {
      idleWakeupSeconds = Math.round(cadence.intervalMs / 1000);
      adaptiveCadenceNote = ` (tightened to ${idleWakeupSeconds}s — live comms thread: ${cadence.reason})`;
    }
  } catch { /* fail-open: keep the baseline recommendation */ }

  return {
    ...base,
    action: 'idle',
    recommended_wakeup_seconds: idleWakeupSeconds,
    message: `No assignment and nothing claimable. IDLE.${tierNote} The /checkin skill must now call ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed — never wait on a human.`,
  };
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

module.exports = { extractSdFromAssignment, extractDirectedSd, tryClaim, registerRollCall, ackMessage, isCoordinatorPush, surfaceCoordinatorMessages, rehydrateCallsign, runCheckin, resolveCheckin, assignFleetIdentityAtCheckin, selfClaimQuickFix, isAutoStartableQF, selfClaimDraftSd, fetchDraftCandidates, fetchNewestDraftCandidates, fetchFleetCriticalCandidates, fetchRankedCandidates, tryClaimDraftCandidate, draftDepsSatisfied, baselinedCandidateEligible, recoverStrandedFinal, adoptOrphanInProgress, isSelfClaimDisabled, isGlobalStandDownActive, isSdInFlight, isForeignSessionLive, foreignClaimantBlocksSteal, selfHealStaleClaim, confirmRowGone, orderByRankMap, orderByFleetCriticalThenRank, sortByDispatchRank, DISPATCH_RANK_TTL_MS, PRIORITY_RANK, SD_KEY_RE, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS, antiWinddownDirective, mergeCheckinModelEffort, parseCheckinArgs };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    process.exit(1);
  });
}
