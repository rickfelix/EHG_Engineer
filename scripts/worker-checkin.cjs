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

const ROLL_CALL_TTL_MS = 60 * 60 * 1000;     // availability row lives 1h
const ROLL_CALL_DEDUP_MS = 5 * 60 * 1000;    // don't re-register within 5m (idempotency)
const DEFAULT_IDLE_WAKEUP_SECONDS = 1200;    // ~20m, matches the fleet idle cadence
const SELF_CLAIM_CANDIDATE_LIMIT = 5;
const QF_CANDIDATE_LIMIT = 25;               // open quick_fixes to consider for self-claim
const STALE_QF_DAYS = Number(process.env.SD_NEXT_QF_STALE_DAYS) || 3;  // verify-first freshness boundary (shared with sd-next display)

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
    const { data } = await sb.from('sd_baseline_items').select('track').eq('sd_key', sdKey).maybeSingle();
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
      .select('id, status, pr_url, commit_sha, created_at')
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

  // 4. already working -> resume
  if (mySd) {
    return { ...base, action: 'resume', sd: mySd, message: `Already claiming ${mySd}; resume work (run sd-start to (re)attach the worktree).` };
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

  // 6. self-claim top of sd:next (v_sd_next_candidates is baseline-ranked)
  try {
    const { data: cands } = await sb
      .from('v_sd_next_candidates')
      .select('sd_id, track, status, priority')
      .limit(SELF_CLAIM_CANDIDATE_LIMIT);
    for (const c of (cands || [])) {
      const claimed = await tryClaim(sb, c.sd_id, sessionId, c.track);
      if (claimed.ok) {
        return { ...base, action: 'self_claimed', sd: c.sd_id, track: c.track, message: `Self-claimed ${c.sd_id} from sd:next. Run: node scripts/sd-start.js ${c.sd_id}` };
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

module.exports = { extractSdFromAssignment, tryClaim, registerRollCall, runCheckin, selfClaimQuickFix, isAutoStartableQF, SD_KEY_RE, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    process.exit(1);
  });
}
