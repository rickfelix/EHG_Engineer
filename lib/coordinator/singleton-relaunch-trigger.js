/**
 * Quiescent-window trigger + relaunch scheduler — SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-A.
 *
 * Consumes the existing stale-tree gauge signal (lib/governance/checkout-freshness.js) as the
 * refresh trigger and schedules a singleton relaunch ONLY when BOTH the fleet is idle
 * (lib/coordinator/fleet-quiescence.cjs assessFleetActivity()) AND the target singleton itself
 * is idle per its own claude_sessions.loop_state (not merely heartbeat-age). Never schedules a
 * relaunch of a singleton that is mid-consult/mid-work.
 *
 * This is trigger + scheduling ONLY (Child A). The actual fresh-checkout relaunch mechanics and
 * handoff-memory schema are Child B; sequenced re-register/retire + guarded worktree removal are
 * Child C. Downstream children consume the `session_coordination` SPAWN_REQUEST record this
 * module writes (payload.kind='singleton_relaunch_scheduled').
 *
 * @module lib/coordinator/singleton-relaunch-trigger
 */

import { createRequire } from 'node:module';
import { checkoutFreshness, VERDICT } from '../governance/checkout-freshness.js';

const require = createRequire(import.meta.url);
const { assessFleetActivity } = require('./fleet-quiescence.cjs');
const { getActiveAdamId } = require('./adam-identity.cjs');
const { getActiveSolomonId } = require('./solomon-identity.cjs');
const { getActiveCoordinatorId } = require('./resolve.cjs');

/**
 * QF-20260702-976: this module (trigger + scheduling) is now periodically INVOKED (see
 * coordinator-startup-check.mjs STANDARD_LOOPS key 'singleton-relaunch'), so a
 * singleton_relaunch_scheduled record can actually be written when conditions are met. Two
 * downstream gaps remain KNOWN and DEFERRED (documented here per QF-20260702-976's guardrails —
 * explicitly out of scope to fix in that QF; verified this module's own decision logic is
 * otherwise correct):
 *   (a) target-idle predicate handling of loop_state='awaiting_tick': a PARKED coordinator
 *       acting as the relaunch target may report 'awaiting_tick' the same as a genuinely idle
 *       one, so decideRelaunchSchedule() could treat a merely-parked (not truly safe-to-relaunch)
 *       target as idle. SAFE_LOOP_STATES does not currently distinguish the two cases.
 *   (b) the actual fresh-checkout relaunch (spawning a new CC session) remains HUMAN-GATED —
 *       writing a singleton_relaunch_scheduled record only SURFACES the need; nothing in this
 *       codebase today autonomously spawns the replacement session from that record.
 * If either gap needs fixing, size it as its own QF/SD rather than folding into this scheduler.
 */

/** loop_state values documented as safe-to-relaunch (never mid-consult). Anything else — including
 * 'active', 'unknown', or no recorded state — fails CLOSED (no relaunch). See docs/protocol/
 * fleet-hibernation.md + .claude/commands/coordinator.md for the loop_state contract. */
export const SAFE_LOOP_STATES = Object.freeze(['awaiting_tick', 'exited']);

export const SINGLETON_ROLES = Object.freeze(['adam', 'solomon', 'coordinator']);

const ROLE_ID_RESOLVERS = {
  adam: (supabase) => getActiveAdamId(supabase),
  solomon: (supabase) => getActiveSolomonId(supabase),
  coordinator: (supabase) => getActiveCoordinatorId(supabase),
};

/**
 * PURE decision — no IO. Precedence mirrors the PRD's FR-1 gate exactly: fresh checkout needs no
 * relaunch; a stale-but-non-quiescent-fleet or mid-consult target both refuse to schedule.
 * @param {{freshnessVerdict?: string, fleetQuiescent?: boolean, targetLoopState?: string}} signals
 * @returns {{scheduled: boolean, reason: string}}
 */
export function decideRelaunchSchedule({ freshnessVerdict, fleetQuiescent, targetLoopState } = {}) {
  if (!freshnessVerdict || freshnessVerdict === VERDICT.FRESH) {
    return { scheduled: false, reason: 'fresh' };
  }
  if (!fleetQuiescent) {
    return { scheduled: false, reason: 'fleet_not_quiescent' };
  }
  if (!SAFE_LOOP_STATES.includes(targetLoopState)) {
    return { scheduled: false, reason: 'target_not_idle' };
  }
  return { scheduled: true, reason: 'behind_n_and_quiescent' };
}

/** Resolve a singleton role's live session_id + loop_state. Fail-open: null id / 'unknown' state
 * on any resolution or query error — a lookup fault must never crash the scheduler tick. */
export async function getRoleSessionState(supabase, role) {
  const resolver = ROLE_ID_RESOLVERS[role];
  if (!resolver) return { sessionId: null, loopState: 'unknown' };
  let sessionId = null;
  try { sessionId = await resolver(supabase); } catch { sessionId = null; }
  if (!sessionId) return { sessionId: null, loopState: 'unknown' };
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('loop_state')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error || !data) return { sessionId, loopState: 'unknown' };
    return { sessionId, loopState: data.loop_state || 'unknown' };
  } catch {
    return { sessionId, loopState: 'unknown' };
  }
}

/** Idempotency check: an existing unacknowledged scheduled record for this role means "already
 * scheduled" — do not re-schedule on a repeated tick (TS-2). */
export async function findPendingSchedule(supabase, role) {
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, created_at, payload')
      .eq('message_type', 'SPAWN_REQUEST')
      .filter('payload->>kind', 'eq', 'singleton_relaunch_scheduled')
      .filter('payload->>target_role', 'eq', role)
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch {
    return null;
  }
}

/** Write the relaunch-scheduled record. Error is CHECKED and returned, never swallowed
 * (memory: reference-coordination-send-contract-enum-swallow-inboxkinds). */
export async function writeScheduleRecord(supabase, { role, senderSession, freshness, fleetActivity, targetLoopState, reason }) {
  const payload = {
    kind: 'singleton_relaunch_scheduled',
    target_role: role,
    trigger_reason: reason,
    freshness: { verdict: freshness.verdict, behind: freshness.behind, criticalDiff: freshness.criticalDiff },
    fleet_signals: fleetActivity.signals,
    target_loop_state: targetLoopState,
    scheduled_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('session_coordination')
    .insert({
      message_type: 'SPAWN_REQUEST',
      subject: `[SCHEDULER] singleton relaunch scheduled: ${role}`,
      body: `Quiescent-window trigger fired for '${role}' — behind ${freshness.behind} commit(s), fleet quiescent, target loop_state=${targetLoopState}.`,
      payload,
      sender_session: senderSession || 'singleton-relaunch-scheduler',
      sender_type: 'coordinator',
    })
    .select('id')
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data.id, error: null };
}

/**
 * Full IO-orchestrated evaluation for one singleton role. `freshness`/`fleetActivity`/
 * `targetLoopState` are all injectable overrides (used by evaluateAllSingletons to avoid
 * recomputing the shared signals per-role, and by unit tests to exercise the decision + dedup
 * paths without live git/DB calls). `enabled=false` runs the full decision but skips the write
 * (dry-run / rollout-flag-off mode) — the PRD's rollout requirement is "flag defaulting OFF;
 * first live cycle run supervised before enabling autonomous triggering".
 */
export async function evaluateSingletonRelaunch(supabase, {
  role,
  checkoutPath = process.cwd(),
  senderSession,
  freshness: freshnessOverride,
  fleetActivity: fleetActivityOverride,
  targetLoopState: loopStateOverride,
  enabled = true,
} = {}) {
  if (!SINGLETON_ROLES.includes(role)) {
    return { role, scheduled: false, reason: 'unknown_role' };
  }
  const freshness = freshnessOverride || checkoutFreshness(checkoutPath, { role });
  const fleetActivity = fleetActivityOverride || (await assessFleetActivity(supabase));

  let sessionId = null;
  let loopState = loopStateOverride;
  if (loopState === undefined) {
    const state = await getRoleSessionState(supabase, role);
    sessionId = state.sessionId;
    loopState = state.loopState;
  }

  const decision = decideRelaunchSchedule({
    freshnessVerdict: freshness.verdict,
    fleetQuiescent: fleetActivity.quiescent,
    targetLoopState: loopState,
  });

  if (!decision.scheduled) {
    return { role, scheduled: false, reason: decision.reason, freshness, fleetActivity, sessionId, loopState };
  }

  if (!enabled) {
    return { role, scheduled: false, reason: 'would_schedule_but_disabled', wouldSchedule: true, freshness, fleetActivity, sessionId, loopState };
  }

  const pending = await findPendingSchedule(supabase, role);
  if (pending) {
    return { role, scheduled: false, reason: 'already_scheduled_pending', pendingId: pending.id, freshness, fleetActivity, sessionId, loopState };
  }

  const written = await writeScheduleRecord(supabase, { role, senderSession, freshness, fleetActivity, targetLoopState: loopState, reason: decision.reason });
  if (written.error) {
    return { role, scheduled: false, reason: 'write_failed', error: written.error, freshness, fleetActivity, sessionId, loopState };
  }
  return { role, scheduled: true, reason: decision.reason, scheduleId: written.id, freshness, fleetActivity, sessionId, loopState };
}

/** Evaluate all 3 singleton roles for one tick. Freshness + fleet-quiescence are computed ONCE
 * and shared — today all 3 singletons operate from the same shared working tree, and fleet
 * activity is fleet-wide, not per-role, so recomputing 3x would just be 3x the git/DB cost for
 * an identical answer. */
export async function evaluateAllSingletons(supabase, { checkoutPath = process.cwd(), senderSession, enabled = true } = {}) {
  const freshness = checkoutFreshness(checkoutPath, { role: 'singleton-relaunch-scheduler' });
  const fleetActivity = await assessFleetActivity(supabase);
  const results = [];
  for (const role of SINGLETON_ROLES) {
    // sequential by design: each write must dedupe against the previous role's own record, not race
    results.push(await evaluateSingletonRelaunch(supabase, { role, checkoutPath, senderSession, freshness, fleetActivity, enabled }));
  }
  return results;
}

export default {
  SAFE_LOOP_STATES,
  SINGLETON_ROLES,
  decideRelaunchSchedule,
  getRoleSessionState,
  findPendingSchedule,
  writeScheduleRecord,
  evaluateSingletonRelaunch,
  evaluateAllSingletons,
};
