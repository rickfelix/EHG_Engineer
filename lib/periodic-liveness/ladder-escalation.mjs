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
// successful increment reaching this value already means "ladder now", not "wait for count 2".
const LADDER_THRESHOLD = 1;
const DIGEST_PREFIX = 'Periodic-liveness ladder:';
// Adversarial-review finding (PR #5940): a chairman dismissal of the digest must not be
// immediately re-escalated on the very next tick while the underlying processes are still
// overdue -- ports lib/adam/stall-alert.js's QF-20260710-818 fix exactly.
const DISMISS_COOLDOWN_MS = 15 * 60_000;

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
    // Column added by the chairman-gated FR-3 migration, not yet in the live schema snapshot; the
    // try/catch here is the actual runtime fail-soft net.
    await supabase.from('periodic_process_registry').update({ consecutive_miss_count: 0 }).eq('process_key', processKey); // schema-lint-disable-line
  } catch {
    // fail-soft, see doc comment above
  }
}

// Adversarial-review finding (PR #5940, HIGH): resolveOwnerTarget only returns kind:'coordinator'
// on the FALLBACK path (unknown/stale label). A row whose owner label successfully resolves TO
// the coordinator peer (e.g. owner='coordinator-fleet') comes back as kind:'session',
// resolvedPeer:'coordinator' -- the ORIGINAL guard (kind==='coordinator' only) missed this case,
// so such a row would get a redundant ladder rung on top of its owner-first message, both
// targeting the same coordinator. Check resolvedPeer too, not just kind.
function ownerTargetIsCoordinator(ownerTarget) {
  return ownerTarget.kind === 'coordinator' || ownerTarget.resolvedPeer === 'coordinator';
}

export async function emitCoordinatorRung(supabase, row, ownerTarget, deps = {}) {
  const { getCoordinatorId = getActiveCoordinatorId } = deps;
  if (ownerTargetIsCoordinator(ownerTarget)) return { emitted: false, reason: 'owner_already_coordinator' };

  try {
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
  } catch (err) {
    // Adversarial-review finding (PR #5940, HIGH): a transient insert failure here must never
    // propagate -- this is a best-effort informational rung, not worth aborting the caller's
    // per-row evaluation loop over.
    return { emitted: false, error: err };
  }
}

/**
 * Per-row: increment the counter, and if this tick is EXACTLY the row's ladder-triggering tick
 * (count === LADDER_THRESHOLD), fire the coordinator rung and report laddered=true. Adversarial-
 * review finding (PR #5940, MEDIUM-HIGH): the counter only ever grows while OVERDUE persists, so
 * an "at or past threshold" check fired the coordinator rung on EVERY subsequent tick forever --
 * an exact-match check fires it exactly once per escalation episode instead, matching the
 * once-per-episode semantics the owner-first message already has via the last_state transition.
 */
export async function climbLadder({ supabase, row, ownerTarget, deps = {} }) {
  const { increment = incrementConsecutiveMiss, emitCoordRung = emitCoordinatorRung } = deps;

  const incResult = await increment(supabase, row.process_key);
  if (!incResult.ok) return { laddered: false, reason: incResult.reason };
  if (incResult.count !== LADDER_THRESHOLD) {
    return { laddered: false, reason: incResult.count < LADDER_THRESHOLD ? 'below_ladder_threshold' : 'already_laddered_this_episode', count: incResult.count };
  }

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
 * FR-3 (SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001): per-process, signature-aware replacement for
 * the original findRecentlyDismissedLadderDigest. That function's dismiss check was
 * `processKeys.some(...)` against a SINGLE most-recent digest -- meaning ONE overlapping
 * process_key suppressed re-escalation for EVERY process sharing that digest, not just the
 * matching one (confirmed live pre-fix, PLAN-phase TESTING review). This version returns a
 * Map<process_key, Set<signature>> built from EVERY digest dismissed within the cooldown window
 * (not just the latest one -- a process could have been dismissed in an earlier digest that also
 * covered other processes), so the caller can suppress per-process AND per-failure-signature: a
 * chairman dismissal is a deliberate "not now" on THIS specific recurring pattern, not a blanket
 * silence on the process_key for any future, possibly-unrelated failure.
 *
 * Backward-compat: a pre-FR-3 digest has process_keys but no process_signatures -- its entries
 * are recorded against the sentinel '__any__' signature, so an already-dismissed pre-FR-3 digest
 * still suppresses correctly during the transition window rather than silently re-escalating
 * everything the first tick after this ships.
 *
 * Fail-soft (a query error is NOT terminal -- never silently swallow a possibly-real escalation
 * by treating an error as "recently dismissed").
 */
async function findRecentlyDismissedSignatures(supabase) {
  const map = new Map();
  try {
    const cutoffIso = new Date(Date.now() - DISMISS_COOLDOWN_MS).toISOString();
    const { data } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data, updated_at')
      .neq('status', 'pending')
      .like('summary', `${DIGEST_PREFIX}%`)
      .gte('updated_at', cutoffIso)
      // Bounded, not unbounded -- the cooldown window is short (15min default), so this can never
      // realistically return many rows; the cap exists as a defensive ceiling, not a real limit.
      .limit(50);
    for (const row of data || []) {
      const context = row.brief_data?.context || {};
      const signatures = context.process_signatures || {};
      for (const [key, sig] of Object.entries(signatures)) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(sig);
      }
      for (const key of context.process_keys || []) {
        if (signatures[key] === undefined) {
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add('__any__');
        }
      }
    }
  } catch {
    // fail-soft: an empty map means nothing is suppressed, never that everything is
  }
  return map;
}

/**
 * ONE digest decision per tick, regardless of how many rows laddered this tick. Refreshes an
 * existing pending digest in place across ticks rather than inserting a new row each time,
 * matching lib/adam/stall-alert.js's proven pattern exactly (TR-3), including the dismiss
 * cooldown (QF-20260710-818).
 */
export async function emitLadderDigest(supabase, candidates, deps = {}) {
  const {
    findExisting = findPendingLadderDigest,
    findDismissedSignatures = findRecentlyDismissedSignatures,
    recordPending,
    escalate,
  } = deps;

  if (!candidates || candidates.length === 0) return { emitted: false };
  if (!recordPending || !escalate) {
    throw new Error('emitLadderDigest requires recordPending and escalate deps (inject lib/chairman/record-pending-decision.mjs at the call site)');
  }

  // FR-3: per-process, signature-aware suppression -- a dismissal suppresses ONLY the same
  // process relapsing with the SAME failure signature, never every process sharing a digest (the
  // processKeys.some() bug this replaces). candidates missing `signature` (a caller that hasn't
  // adopted FR-3 yet) fall back to 'unknown', which cannot match a stored '__any__'/specific
  // signature except by the explicit backward-compat sentinel handled in findDismissedSignatures.
  const dismissedMap = await findDismissedSignatures(supabase);
  const suppressed = [];
  const escalating = [];
  for (const c of candidates) {
    const sigSet = dismissedMap.get(c.process_key);
    const isDismissed = !!sigSet && (sigSet.has(c.signature || 'unknown') || sigSet.has('__any__'));
    (isDismissed ? suppressed : escalating).push(c);
  }
  if (suppressed.length > 0) {
    console.log(`[ladder-escalation] Suppressing re-escalation for ${suppressed.map((c) => c.process_key).join(', ')} -- same failure signature dismissed within the last ${Math.round(DISMISS_COOLDOWN_MS / 60_000)}m`);
  }
  if (escalating.length === 0) {
    return { emitted: true, refreshed: false, escalated: false, suppressed: true, suppressedKeys: suppressed.map((c) => c.process_key) };
  }

  const title = escalating.length === 1
    ? `${DIGEST_PREFIX} ${escalating[0].display_name || escalating[0].process_key}`
    : `${DIGEST_PREFIX} ${escalating.length} processes escalated`;
  const context = {
    process_keys: escalating.map((c) => c.process_key),
    process_signatures: Object.fromEntries(escalating.map((c) => [c.process_key, c.signature || 'unknown'])),
  };

  try {
    const existing = await findExisting(supabase);
    if (existing) {
      const briefData = { ...(existing.brief_data || {}), title, context, recorded_via: 'ladder-escalation' };
      await supabase.from('chairman_decisions')
        .update({ summary: title, brief_data: briefData, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      const res = await escalate(supabase, existing.id);
      return { emitted: true, decisionId: existing.id, refreshed: true, escalated: res?.escalated === true, suppressedKeys: suppressed.map((c) => c.process_key) };
    }

    const res = await recordPending(supabase, {
      title,
      decisionType: 'session_question',
      context,
      blocking: true,
      raisedBy: 'periodic-liveness-watcher',
    });
    return { emitted: true, decisionId: res.id, refreshed: false, escalated: res.escalated === true, suppressedKeys: suppressed.map((c) => c.process_key) };
  } catch (err) {
    // Adversarial-review finding (PR #5940, HIGH): a transient chairman_decisions failure here
    // must never propagate out of the caller's per-row/per-tick loop.
    console.error(`[ladder-escalation] emitLadderDigest failed (non-fatal): ${err.message}`);
    return { emitted: false, error: err };
  }
}
