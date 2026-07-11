/**
 * Ladder escalation for periodic_process_registry OVERDUE rows that miss a SECOND consecutive
 * watch cycle. SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-3.
 *
 * Two rungs, both reusing existing surfaces (no new comms lanes):
 *   1. Coordinator rung -- an explicit session_coordination row, per-row (cheap, informational).
 *   2. Adam/chairman digest rung -- ONE chairman_decisions row per TICK regardless of how many
 *      processes reach their 2nd-consecutive-miss in that tick (closes the LEAD risk-agent HIGH
 *      finding: recordPendingDecision inserts an unconditional row per call with no per-row cap).
 *      Mirrors lib/adam/stall-alert.js's find-existing-pending-digest / refresh-in-place pattern.
 *
 * The consecutive-miss counter lives in a SEPARATE additive column (never packed into last_state)
 * and is incremented atomically via a single SQL UPDATE...RETURNING (periodic_registry_increment_
 * consecutive_miss, database/migrations/20260711_periodic_process_registry_consecutive_miss_
 * count.sql) so overlapping watcher runs cannot lose an update or double-count. That migration is
 * chairman/Adam-gated (not self-applicable by an autonomous session) -- incrementConsecutiveMiss
 * fails soft if it hasn't landed yet, so the ladder simply stays inactive (owner-first routing is
 * unaffected) until it does.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');

// The counter is never seeded on the first miss (that update must succeed even pre-migration --
// see periodic-liveness-watcher.mjs's transition branch). It starts fresh from NULL/0 at the
// row's first NON-transition OVERDUE tick, which IS the second consecutive miss overall -- so a
// successful increment (count >= 1) already means "ladder now", not "wait for count 2".
const LADDER_THRESHOLD = 1;
const DIGEST_PREFIX = 'Periodic-liveness ladder:';

/**
 * Atomic guarded increment. Fail-soft: any error (including the pre-migration "column/function
 * does not exist") is caught and logged loudly (NC-7 style -- a silently-disabled ladder is worth
 * a visible warning, not a swallowed exception) rather than thrown.
 */
export async function incrementConsecutiveMiss(supabase, processKey, deps = {}) {
  const { rpc = (fn, args) => supabase.rpc(fn, args) } = deps;
  try {
    const { data, error } = await rpc('periodic_registry_increment_consecutive_miss', { p_process_key: processKey });
    if (error) {
      console.error(`[ladder-escalation] LADDER ESCALATION DISABLED for ${processKey}: increment failed (${error.message}) -- has the FR-3 migration been applied? Owner-first routing is unaffected.`);
      return { ok: false, reason: error.message };
    }
    const count = Array.isArray(data) ? data[0] : data;
    return { ok: true, count: Number(count) };
  } catch (err) {
    console.error(`[ladder-escalation] LADDER ESCALATION DISABLED for ${processKey}: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

/** Fail-soft reset on recovery -- a failed reset just means the next episode's counter starts
 *  from a stale value; the WHERE last_state='OVERDUE' increment guard combined with a fresh
 *  transition still self-corrects within one extra tick at worst. */
export async function resetConsecutiveMiss(supabase, processKey) {
  try {
    await supabase.from('periodic_process_registry').update({ consecutive_miss_count: 0 }).eq('process_key', processKey);
  } catch {
    // fail-soft, see doc comment above
  }
}

export async function emitCoordinatorRung(supabase, row, ownerTarget, deps = {}) {
  const { getCoordinatorId = getActiveCoordinatorId } = deps;
  if (ownerTarget.kind === 'coordinator') return { emitted: false, reason: 'owner_already_coordinator' };

  const coordinatorId = await getCoordinatorId(supabase).catch(() => null);
  const { error } = await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    target_session: coordinatorId || 'broadcast-coordinator',
    subject: `[PERIODIC-LIVENESS] ${row.display_name || row.process_key} still OVERDUE (2nd consecutive miss)`,
    sender_type: 'periodic-liveness-watcher',
    payload: {
      kind: 'periodic_liveness_ladder',
      process_key: row.process_key,
      display_name: row.display_name,
      owner: row.owner,
      rung: 'coordinator',
    },
  });
  return { emitted: !error, error: error || null };
}

/** Per-row: increment the counter, and if it has reached the ladder threshold, fire the
 *  coordinator rung. Returns whether this row should be added to the tick's digest candidates. */
export async function climbLadder({ supabase, row, ownerTarget, deps = {} }) {
  const { increment = incrementConsecutiveMiss, emitCoordRung = emitCoordinatorRung } = deps;

  const incResult = await increment(supabase, row.process_key);
  if (!incResult.ok) return { laddered: false, reason: incResult.reason };
  if (incResult.count < LADDER_THRESHOLD) return { laddered: false, reason: 'below_ladder_threshold', count: incResult.count };

  const coordResult = await emitCoordRung(supabase, row, ownerTarget, deps);
  return { laddered: true, count: incResult.count, coordinatorRung: coordResult };
}

async function findPendingLadderDigest(supabase) {
  try {
    const { data } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data')
      .eq('status', 'pending')
      .like('summary', `${DIGEST_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * ONE digest decision per tick, regardless of how many rows laddered this tick. Refreshes an
 * existing pending digest in place across ticks rather than inserting a new row each time,
 * matching lib/adam/stall-alert.js's proven pattern exactly (TR-3).
 */
export async function emitLadderDigest(supabase, candidates, deps = {}) {
  const {
    findExisting = findPendingLadderDigest,
    recordPending,
    escalate,
  } = deps;

  if (!candidates || candidates.length === 0) return { emitted: false };
  if (!recordPending || !escalate) {
    throw new Error('emitLadderDigest requires recordPending and escalate deps (inject lib/chairman/record-pending-decision.mjs at the call site)');
  }

  const title = candidates.length === 1
    ? `${DIGEST_PREFIX} ${candidates[0].display_name || candidates[0].process_key}`
    : `${DIGEST_PREFIX} ${candidates.length} processes escalated`;
  const context = { process_keys: candidates.map((c) => c.process_key) };

  const existing = await findExisting(supabase);
  if (existing) {
    const briefData = { ...(existing.brief_data || {}), title, context, recorded_via: 'ladder-escalation' };
    await supabase.from('chairman_decisions')
      .update({ summary: title, brief_data: briefData, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    const res = await escalate(supabase, existing.id);
    return { emitted: true, decisionId: existing.id, refreshed: true, escalated: res?.escalated === true };
  }

  const res = await recordPending(supabase, {
    title,
    decisionType: 'session_question',
    context,
    blocking: true,
    raisedBy: 'periodic-liveness-watcher',
  });
  return { emitted: true, decisionId: res.id, refreshed: false, escalated: res.escalated === true };
}
