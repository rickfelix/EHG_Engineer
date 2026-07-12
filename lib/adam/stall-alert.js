/**
 * Adam stall-alert — wires stall-detector.js's genuine-stall classification to the
 * EXISTING chairman escalation-email channel (lib/chairman/record-pending-decision.mjs).
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-3).
 *
 * No new email machinery: this module is pure wiring of a new trigger condition
 * (genuine stall on a critical-path parent) onto the already-verified
 * recordPendingDecision -> shouldAutoEscalate -> escalateChairmanDecision channel.
 * An intended hold never calls recordPendingDecision, so intended/quiet holds
 * generate zero escalation noise.
 */

import { classifyStaleness } from './stall-detector.js';
import { recordPendingDecision, escalateChairmanDecision } from '../chairman/record-pending-decision.mjs';
import { setStatus } from './task-ledger.js';

const SD_TERMINAL_STATUSES = ['completed', 'cancelled'];
const STALL_DIGEST_PREFIX = 'Adam PM stall:';
// QF-20260710-818: dismissing a stall digest (status moved off 'pending') must not immediately
// respawn a fresh escalation email on the same still-stale nodes the very next tick.
const DISMISS_COOLDOWN_MS = 15 * 60_000;
// SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-2): an SD claimed and moving within this
// window is being actively driven, not stalled. Sized the same order of magnitude as
// DISMISS_COOLDOWN_MS above.
const PROGRESS_WINDOW_MS = 30 * 60_000;

/**
 * QF-20260703-860: find an already-open stall digest (if any) so a subsequent tick can refresh
 * it in place instead of inserting a new blocking row every tick while stale threads persist.
 * Fail-soft: a query error is treated as "no existing digest" so a DB blip degrades to the
 * pre-fix insert-a-row behavior rather than silently dropping a genuine stall alert.
 */
async function findPendingStallDigest(supabase) {
  try {
    const { data } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data')
      .eq('status', 'pending')
      .like('summary', `${STALL_DIGEST_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * QF-20260703-229: a sourced_sd board node stalls-out FOREVER once its linked SD finishes
 * (completed work stops moving, by definition). Reads the SD's LIVE status via source_ref so a
 * finished thread self-heals (closes) instead of maturing into a false "genuine stall". Fail-soft
 * (a query error is NOT terminal — never silently swallow a possibly-real stall).
 */
async function isSdTerminal(supabase, sdKey) {
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .eq('sd_key', sdKey)
      .maybeSingle();
    return !!data && SD_TERMINAL_STATUSES.includes(data.status);
  } catch {
    return false;
  }
}

/**
 * QF-20260704-964: a sourced_sd board node stops moving BY DESIGN while its linked SD is
 * an intended hold (requires_human_action or needs_coordinator_review) -- this is not a
 * genuine stall, it's the SD waiting on a human gate the stall-alert docstring itself says
 * should never escalate. Fail-soft (a query error is NOT terminal -- never silently swallow
 * a possibly-real stall).
 */
async function isSdIntentionallyHeld(supabase, sdKey) {
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .maybeSingle();
    return !!data?.metadata?.requires_human_action || !!data?.metadata?.needs_coordinator_review;
  } catch {
    return false;
  }
}

/**
 * QF-20260704-319: an advisory_thread board node mirrors a session_coordination correlation
 * (node.source_ref is the correlation id), not board bookkeeping -- its true terminal state
 * lives in whether that correlation got a REPLY or a chairman decision, which can resolve
 * without ever touching the board node's own updated_at. Live specimen: the standing
 * strategist commission (correlation adam-solomon-standing-strategist-001) got Solomon's
 * reply at 03:18:28Z, but the ticks-since-movement stall fired at 03:54Z anyway -- 35+
 * minutes after the correlation was already closed, because nothing here ever looked past
 * the board node itself. Checks BOTH signals per the acceptance ("reply delivered? decision
 * ratified?"): a session_coordination reply keyed on payload.reply_to, or a non-pending
 * chairman_decisions row tied to the same correlation via brief_data.context.correlation_id.
 * Fail-soft (a query error is NOT terminal — never silently swallow a possibly-real stall).
 */
async function isCorrelationTerminal(supabase, correlationId) {
  if (!correlationId) return false;
  try {
    const { data: replies } = await supabase
      .from('session_coordination')
      .select('id')
      .filter('payload->>reply_to', 'eq', correlationId)
      .limit(1);
    if (Array.isArray(replies) && replies.length > 0) return true;

    const { data: decisions } = await supabase
      .from('chairman_decisions')
      .select('id')
      .filter('brief_data->context->>correlation_id', 'eq', correlationId)
      .neq('status', 'pending')
      .limit(1);
    return Array.isArray(decisions) && decisions.length > 0;
  } catch {
    return false;
  }
}

/**
 * SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-2): a sourced_sd board node backed by an SD
 * that is CLAIMED and moving (fresh claim or a fresh phase handoff within PROGRESS_WINDOW_MS) is
 * being actively driven, not stalled -- live specimen: a claimed SD escalated at
 * ticks_since_movement=8 (the minimum stale threshold) while it was actively driving to
 * LEAD-FINAL. Checks BOTH claim_history and sd_phase_handoffs (either signal is sufficient) since
 * a long EXEC step can move the SD without a fresh re-claim. Fail-soft (a query error is NOT
 * terminal -- never silently swallow a possibly-real stall).
 */
async function isSdActivelyProgressing(supabase, sdKey) {
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, claiming_session_id, metadata')
      .eq('sd_key', sdKey)
      .maybeSingle();
    if (!sd || !sd.claiming_session_id) return false;

    const claimHistory = Array.isArray(sd.metadata?.claim_history) ? sd.metadata.claim_history : [];
    const lastClaim = claimHistory[claimHistory.length - 1];
    if (lastClaim?.claimed_at && Date.now() - new Date(lastClaim.claimed_at).getTime() < PROGRESS_WINDOW_MS) {
      return true;
    }

    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('created_at')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const lastHandoff = handoffs?.[0];
    return !!lastHandoff && Date.now() - new Date(lastHandoff.created_at).getTime() < PROGRESS_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * QF-20260710-818: find the most recently dismissed (non-pending) stall digest, if it covers
 * at least one of the currently-stalled node_ids and was dismissed within the cooldown window.
 * A chairman dismissal is a deliberate "not now" on those specific nodes — re-escalating them
 * on the very next tick defeats the dismissal. Fail-soft (a query error is NOT terminal — never
 * silently swallow a possibly-real stall by treating an error as "recently dismissed").
 */
async function findRecentlyDismissedStallDigest(supabase, nodeIds) {
  try {
    const { data } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data, updated_at')
      .neq('status', 'pending')
      .like('summary', `${STALL_DIGEST_PREFIX}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const dismissedIds = new Set(data.brief_data?.context?.node_ids || []);
    const overlaps = nodeIds.some((id) => dismissedIds.has(id));
    const withinCooldown = Date.now() - new Date(data.updated_at).getTime() < DISMISS_COOLDOWN_MS;
    return overlaps && withinCooldown ? data : null;
  } catch {
    return null;
  }
}

/**
 * Pure: bump (or reset) the ticks-since-movement counter for a node given its current
 * updated_at and the previous tick's snapshot for that node. No movement recorded yet
 * (or the timestamp changed) resets the counter to 0; an unchanged timestamp increments it.
 * @param {{id: string, updated_at?: string}} node
 * @param {Object<string, {updated_at?: string, ticks?: number}>} prevSnapshot
 * @returns {number}
 */
export function bumpMovementTicks(node, prevSnapshot) {
  const prev = prevSnapshot && node && prevSnapshot[node.id];
  if (prev && node.updated_at && prev.updated_at === node.updated_at) {
    return (prev.ticks || 0) + 1;
  }
  return 0;
}

/**
 * Check a set of chairman-parent nodes for genuine stalls and alert the chairman via
 * the existing recordPendingDecision escalation channel. Classification (pure,
 * stall-detector.js) is kept separate from the IO (recordPendingDecision) — only nodes
 * classified as a genuine stall ever reach the escalation call.
 * @param {object} supabase
 * @param {Array<{id: string, title: string, updated_at?: string, inFlightNextStep?: boolean}>} parents
 * @param {Object<string, {updated_at?: string, ticks?: number}>} [prevSnapshot]
 * @param {{staleTicks?: number}} [opts]
 * @returns {Promise<{snapshot: object, alerted: Array<{id: string, title: string, escalated: boolean}>}>}
 */
export async function checkAndAlertStalls(supabase, parents, prevSnapshot = {}, opts = {}) {
  const snapshot = {};
  const stalls = [];
  for (const node of Array.isArray(parents) ? parents : []) {
    if (!node || !node.id) continue;
    // Terminal board statuses never stall — they've stopped moving BY DEFINITION.
    if (node.status === 'done' || node.status === 'cancelled') continue;
    const ticks = bumpMovementTicks(node, prevSnapshot);
    snapshot[node.id] = { updated_at: node.updated_at, ticks };

    const status = classifyStaleness(
      { ticksSinceMovement: ticks, inFlightNextStep: !!node.inFlightNextStep },
      opts
    );
    if (status !== 'genuine_stall') continue;

    // Self-heal: a sourced_sd node whose linked SD already finished is a stale board row,
    // not a genuine stall — close it instead of escalating.
    if (node.source_kind === 'sourced_sd' && node.source_ref && await isSdTerminal(supabase, node.source_ref)) {
      await setStatus(supabase, node.id, 'done').catch(() => {});
      continue;
    }
    // QF-20260704-964: an intended hold (requires_human_action / needs_coordinator_review)
    // never escalates -- the node isn't finished (don't mark it done), it's just held BY
    // DESIGN, so suppress with a log line and skip straight to the next node.
    if (node.source_kind === 'sourced_sd' && node.source_ref && await isSdIntentionallyHeld(supabase, node.source_ref)) {
      console.log(`[Adam PM] Suppressing stall alert for intended-hold SD ${node.source_ref} (node ${node.id})`);
      continue;
    }
    // SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-2): a claimed-and-progressing SD is
    // being actively driven -- never a stall, regardless of ticks_since_movement.
    if (node.source_kind === 'sourced_sd' && node.source_ref && await isSdActivelyProgressing(supabase, node.source_ref)) {
      console.log(`[Adam PM] Suppressing stall alert for actively-claimed-and-progressing SD ${node.source_ref} (node ${node.id})`);
      continue;
    }
    // QF-20260704-319: same self-heal for an advisory_thread node whose correlation already
    // got a reply or a ratified decision — the board row is stale, not a genuine stall.
    if (node.source_kind === 'advisory_thread' && node.source_ref && await isCorrelationTerminal(supabase, node.source_ref)) {
      await setStatus(supabase, node.id, 'done').catch(() => {});
      continue;
    }
    // SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-1): board status='blocked' is ALREADY an
    // explicit, board-visible held-by-design disposition (set directly, or rolled up from a
    // genuinely blocked child via task-ledger.js rollupParentStatus) -- respect it for every
    // source_kind, not just 'manual'. Generalizes the former manual-only QF-20260710-818 branch;
    // live specimens showed sourced_sd/advisory_thread nodes with status='blocked' (a Solomon-gated
    // design-queue child, a snoozed belt QF, a Fable-window gate) escalating with no suppression
    // path at all. Runs AFTER the terminal/held-metadata/progressing checks above so a node that
    // can self-heal (finished SD, resolved correlation) still closes instead of merely suppressing.
    if (node.status === 'blocked') {
      console.log(`[Adam PM] Suppressing stall alert for held node ${node.id} (status=blocked, source_kind=${node.source_kind || 'unknown'})`);
      continue;
    }
    stalls.push({ ...node, ticks });
  }

  // Cap escalation at ONE digest decision per tick — never per-node — so N stalls never flood
  // the chairman queue with N blocking rows. QF-20260703-860: also cap across TICKS — while any
  // stale thread remains, supersede the existing pending digest (refresh count/context) instead
  // of inserting a fresh row every tick, so grooming it once actually ends the noise.
  const alerted = [];
  if (stalls.length > 0) {
    const title = stalls.length === 1
      ? `Adam PM stall: ${stalls[0].title || stalls[0].id}`
      : `Adam PM stall: ${stalls.length} threads stalled`;
    const context = {
      node_ids: stalls.map((n) => n.id),
      ticks_since_movement: Object.fromEntries(stalls.map((n) => [n.id, n.ticks])),
    };

    const existing = await findPendingStallDigest(supabase);
    // Per-node escalated outcome, defaulted below per-branch — lets a partial-dismissal delta
    // (FR-3) report the previously-dismissed members as escalated=false alongside the genuinely
    // new members' real outcome, instead of a single flag applied uniformly to every node.
    const escalatedById = new Map();
    if (existing) {
      const briefData = { ...(existing.brief_data || {}), title, context, recorded_via: 'record-pending-decision' };
      await supabase.from('chairman_decisions')
        .update({ summary: title, brief_data: briefData, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      // escalateChairmanDecision dedups on brief_data.escalation_email_sent_at, already stamped
      // by the digest's original insert — this call is therefore a no-op on every refresh tick,
      // which is exactly how "at most one escalation email" holds across many stale ticks.
      const res = await escalateChairmanDecision(supabase, existing.id);
      for (const n of stalls) escalatedById.set(n.id, res.escalated === true);
    } else {
      const dismissed = await findRecentlyDismissedStallDigest(supabase, context.node_ids);
      const dismissedIds = new Set(dismissed?.brief_data?.context?.node_ids || []);
      // SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-3): a dismissal covers whichever
      // specific node_ids it named, not "the current stall set" as a whole -- so membership
      // drift (a node dropping off, or a genuinely new node joining) must not swing the outcome
      // from "fully suppressed" to "fully re-escalated". Only nodes NOT covered by the
      // dismissal are candidates to surface.
      const newStalls = dismissed ? stalls.filter((n) => !dismissedIds.has(n.id)) : stalls;

      if (dismissed && newStalls.length === 0) {
        // Fully covered by a recent dismissal — the dismissed set stays dismissed for the
        // cooldown window regardless of exact set-identity match (fixes the 9-min-refile shape:
        // an identical or subset re-check must reuse the dismissal, never re-file).
        console.log(`[Adam PM] Suppressing re-escalation — digest ${dismissed.id} covering these nodes was dismissed within the last ${Math.round(DISMISS_COOLDOWN_MS / 60_000)}m`);
        for (const n of stalls) escalatedById.set(n.id, false);
      } else if (dismissed) {
        // Partial overlap: only the genuinely NEW nodes (not covered by the dismissal) surface,
        // as a delta digest — the previously-dismissed members do not re-file alongside them,
        // and are reported as escalated=false rather than dropped from the tick log.
        const deltaTitle = newStalls.length === 1
          ? `Adam PM stall: ${newStalls[0].title || newStalls[0].id}`
          : `Adam PM stall: ${newStalls.length} threads stalled`;
        const deltaContext = {
          node_ids: newStalls.map((n) => n.id),
          ticks_since_movement: Object.fromEntries(newStalls.map((n) => [n.id, n.ticks])),
        };
        const res = await recordPendingDecision(supabase, {
          title: deltaTitle,
          decisionType: 'session_question',
          context: deltaContext,
          blocking: true,
          raisedBy: 'adam',
        });
        const newlyEscalated = res.escalated === true;
        for (const n of stalls) escalatedById.set(n.id, newStalls.includes(n) && newlyEscalated);
      } else {
        const res = await recordPendingDecision(supabase, {
          title,
          decisionType: 'session_question',
          context,
          blocking: true,
          raisedBy: 'adam',
        });
        for (const n of stalls) escalatedById.set(n.id, res.escalated === true);
      }
    }
    for (const n of stalls) alerted.push({ id: n.id, title: n.title || n.id, escalated: escalatedById.get(n.id) === true });
  }
  return { snapshot, alerted };
}
