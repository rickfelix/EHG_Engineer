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
 */

const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const ws = require('../lib/fleet/worker-status.cjs');
const { ensureActiveBaseline } = require('../lib/fleet/ensure-active-baseline.cjs');
// SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: shared dispatch-eligibility predicate, also used by
// scripts/stale-session-sweep.cjs CLAIM_FIX (closes the self_claim-vs-sweep writer-consumer-asymmetry).
const { draftDepsSatisfied, baselinedCandidateEligible } = require('../lib/fleet/claim-eligibility.cjs');

const ROLL_CALL_TTL_MS = 60 * 60 * 1000;     // availability row lives 1h
const ROLL_CALL_DEDUP_MS = 5 * 60 * 1000;    // don't re-register within 5m (idempotency)
const DEFAULT_IDLE_WAKEUP_SECONDS = 1200;    // ~20m, matches the fleet idle cadence
const SELF_CLAIM_CANDIDATE_LIMIT = 5;
const QF_CANDIDATE_LIMIT = 25;               // open quick_fixes to consider for self-claim
const STALE_QF_DAYS = Number(process.env.SD_NEXT_QF_STALE_DAYS) || 3;  // verify-first freshness boundary (shared with sd-next display)
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

async function ackMessage(sb, id) {
  try {
    const now = new Date().toISOString();
    await sb.from('session_coordination').update({ read_at: now, acknowledged_at: now }).eq('id', id);
  } catch { /* best-effort */ }
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
async function selfClaimDraftSd(sb, sessionId, base) {
  try {
    const { data: drafts } = await sb
      .from('strategic_directives_v2')
      .select('sd_key, status, sd_type, priority, created_at, dependencies')
      .in('status', ['draft', 'active'])
      .is('claiming_session_id', null)
      .neq('sd_type', 'orchestrator')
      .order('created_at', { ascending: true })
      .limit(DRAFT_CANDIDATE_LIMIT);
    // priority-first; oldest-first within a priority (stable sort preserves the created_at order).
    const ordered = (drafts || []).slice().sort(
      (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    );
    for (const d of ordered) {
      if (!(await draftDepsSatisfied(sb, d))) continue; // skip dependency-blocked
      if (await isSdInFlight(sb, d.sd_key, sessionId)) continue; // dedup: skip SDs already started or live-foreign-held
      const claimed = await tryClaim(sb, d.sd_key, sessionId);
      if (claimed.ok) {
        return {
          ...base,
          action: 'self_claimed',
          sd: d.sd_key,
          message: `Self-claimed ${d.sd_key} (un-baselined draft) from the SD belt. Run: node scripts/sd-start.js ${d.sd_key}`,
        };
      }
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

/**
 * Dedup guard: should this SD candidate be SKIPPED by self-claim because it is already
 * being built? v_sd_next_candidates only filters completed/cancelled/deferred and
 * selfClaimDraftSd only filters claiming_session_id IS NULL, so both can surface an SD
 * another session is mid-build on; claim_sd's 900s guard misses long-build heartbeat
 * lapses (auto_stale_takeover). Returns true to SKIP when the SD is (a) past LEAD
 * (started — current_phase != 'LEAD'; phase only advances on an ACCEPTED handoff, so this
 * avoids the rejected-first-handoff false positive that raw handoff-row presence has) OR
 * (b) held by a LIVE foreign session (v_active_sessions.is_alive — a generous liveness
 * signal that covers heartbeat gaps beyond claim_sd's 900s backstop). Fails OPEN (any
 * error -> false -> never blocks self_claim). SD-FDBK-FIX-SELF-CLAIM-DEDUP-001.
 */
async function isSdInFlight(sb, sdKey, mySessionId) {
  try {
    // (a) already started past the initial LEAD draft
    const { data: sd } = await sb
      .from('strategic_directives_v2')
      .select('current_phase')
      .eq('sd_key', sdKey)
      .maybeSingle();
    if (sd && sd.current_phase && sd.current_phase !== 'LEAD') return true;
    // (b) a live foreign session already holds it
    const { data: live } = await sb
      .from('v_active_sessions')
      .select('session_id')
      .eq('sd_key', sdKey)
      .neq('session_id', mySessionId)
      .eq('is_alive', true)
      .limit(1);
    if (live && live.length) return true;
  } catch { /* fail-open: never block self_claim on a guard error */ }
  return false;
}

async function runCheckin(sb, sessionId, { getCoordinator = getActiveCoordinatorId } = {}) {
  // 1. resolve coordinator (fail-open to null -> broadcast)
  let coordinatorId = null;
  try { coordinatorId = await getCoordinator(sb); } catch { coordinatorId = null; }

  // 2. confirm callsign + current claim
  let callsign = null, mySd = null;
  try {
    const { data } = await sb.from('claude_sessions').select('metadata, sd_key').eq('session_id', sessionId).maybeSingle();
    if (data) {
      callsign = (data.metadata && (data.metadata.fleet_identity?.callsign || data.metadata.callsign)) || null;
      mySd = data.sd_key || null;
    }
  } catch { /* fail-open */ }

  // 3. register availability (idempotent)
  const rollCall = await registerRollCall(sb, { sessionId, coordinatorId, callsign, mySd });

  const base = { ok: true, callsign, coordinator: coordinatorId, roll_call_id: rollCall.id, two_way: process.env.COORDINATOR_TWOWAY_V2 === 'on' };

  // 4. already working -> resume. A self-claimed quick-fix lands in claude_sessions.sd_key
  // too (claim_sd writes it for QF-% ids), so a QF claim must resume into the /quick-fix
  // workflow — NOT sd-start, which is SD-only (QFs have no worktree / LEAD-PLAN-EXEC).
  if (mySd) {
    const isQf = /^QF-/.test(mySd);
    return { ...base, action: 'resume', sd: mySd, message: isQf
      ? `Already claiming quick-fix ${mySd}; resume it: node scripts/read-quick-fix.js ${mySd}, then run the /quick-fix workflow (do NOT run sd-start.js for a QF).`
      : `Already claiming ${mySd}; resume work (run sd-start to (re)attach the worktree).` };
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
      const claimed = await tryClaim(sb, sdKey, sessionId);
      if (claimed.ok) {
        await ackMessage(sb, assignment.id);
        return { ...base, action: 'claimed_assignment', sd: sdKey, message: `Claimed assigned ${sdKey} via claim_sd. Run: node scripts/sd-start.js ${sdKey}` };
      }
      // could not claim the assigned SD -> fall through to self-claim
      base.assignment_claim_error = claimed.error;
    }
  }

  // 5.7 SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001: recover a STRANDED pending_approval/LEAD_FINAL SD
  //      (claim cleared, one handoff from shipped) BEFORE self-claiming new work — finishing a
  //      near-shipped SD beats starting fresh. Re-claiming lets a worker run LEAD-FINAL-APPROVAL with
  //      a valid matching claim (passing the claim-validity gate the coordinator-from-main path fails).
  const recovered = await recoverStrandedFinal(sb, sessionId, base);
  if (recovered) return recovered;

  // 5.5 SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001: ensure an active execution baseline exists
  //      BEFORE reading v_sd_next_candidates. With zero active baseline the view returns 0 rows
  //      and self-claim silently idles with a full queue. Fail-open: a failure here degrades to
  //      today's behavior (read returns [] -> idle), never an error action.
  try { await ensureActiveBaseline(sb); } catch { /* fail-open: never block the checkin */ }

  // 6. self-claim top of sd:next (v_sd_next_candidates is baseline-ranked)
  try {
    const { data: cands } = await sb
      .from('v_sd_next_candidates')
      .select('sd_id, track, status, priority')
      .limit(SELF_CLAIM_CANDIDATE_LIMIT);
    for (const c of (cands || [])) {
      // SD-FDBK-FIX-WORKER-SELF-CLAIM-001: skip dependency-blocked SDs and orchestrator PARENTS
      // (the view surfaces both; claim_sd enforces neither). Mirrors the step-6.25 guard.
      if (!(await baselinedCandidateEligible(sb, c.sd_id))) continue;
      if (await isSdInFlight(sb, c.sd_id, sessionId)) continue;  // dedup: skip SDs already started or live-foreign-held
      const claimed = await tryClaim(sb, c.sd_id, sessionId, c.track);
      if (claimed.ok) {
        return { ...base, action: 'self_claimed', sd: c.sd_id, track: c.track, message: `Self-claimed ${c.sd_id} from sd:next. Run: node scripts/sd-start.js ${c.sd_id}` };
      }
    }
  } catch { /* fail-open */ }

  // 6.25 self-claim a claimable UN-BASELINED draft SD. v_sd_next_candidates is built from
  // sd_baseline_items, so newly-created draft SDs (the normal LEAD starting state) are invisible
  // to step 6 — this tier reads them directly from strategic_directives_v2, dep-checks them, and
  // claims one. Strictly BELOW baselined candidates and ABOVE QFs/idle. SD-FDBK-FEAT-WORKER-CHECKIN-SELF-001.
  const draftClaimed = await selfClaimDraftSd(sb, sessionId, base);
  if (draftClaimed) return draftClaimed;

  // 6.5 self-claim an open quick_fix. v_sd_next_candidates is SD-only, so open
  // QFs are sourced here — strictly BELOW SD candidates and ABOVE idle, so a
  // worker pulls an open QF instead of idling, but SD work always wins.
  // SD-LEO-INFRA-MAKE-OPEN-QFS-001.
  const qfClaimed = await selfClaimQuickFix(sb, sessionId, base);
  if (qfClaimed) return qfClaimed;

  // 7. idle -> recommend a wakeup (ScheduleWakeup is a HARNESS tool, not Node-callable)
  return {
    ...base,
    action: 'idle',
    recommended_wakeup_seconds: DEFAULT_IDLE_WAKEUP_SECONDS,
    message: `No assignment and nothing claimable. IDLE. The /checkin skill must now call ScheduleWakeup(~${DEFAULT_IDLE_WAKEUP_SECONDS}s) and proceed — never wait on a human.`,
  };
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: 'CLAUDE_SESSION_ID env var required (set by the SessionStart hook).' }, null, 2));
    process.exit(1);
  }
  let sb;
  try {
    sb = ws.getServiceClient();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: `supabase client unavailable: ${e.message}` }, null, 2));
    process.exit(1);
  }
  const result = await runCheckin(sb, sessionId);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { extractSdFromAssignment, tryClaim, registerRollCall, runCheckin, selfClaimQuickFix, isAutoStartableQF, selfClaimDraftSd, draftDepsSatisfied, baselinedCandidateEligible, recoverStrandedFinal, isSdInFlight, SD_KEY_RE, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    process.exit(1);
  });
}
