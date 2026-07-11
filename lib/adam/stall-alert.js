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
    // QF-20260704-319: same self-heal for an advisory_thread node whose correlation already
    // got a reply or a ratified decision — the board row is stale, not a genuine stall.
    if (node.source_kind === 'advisory_thread' && node.source_ref && await isCorrelationTerminal(supabase, node.source_ref)) {
      await setStatus(supabase, node.id, 'done').catch(() => {});
      continue;
    }
    // QF-20260710-818: a manual node routed to another actor (Solomon consult, sourced fleet
    // work, an external gate) is an intended hold, not a genuine stall. Unlike sourced_sd/
    // advisory_thread, a manual node has no linked row to re-check -- board status='blocked' is
    // the existing zero-migration signal for "don't escalate", set explicitly by whoever routed
    // the work elsewhere (never set by default rehydrate, so this is opt-in, not silent).
    if (node.source_kind === 'manual' && node.status === 'blocked') {
      console.log(`[Adam PM] Suppressing stall alert for held manual node ${node.id}`);
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
    let decisionId;
    let escalated;
    if (existing) {
      const briefData = { ...(existing.brief_data || {}), title, context, recorded_via: 'record-pending-decision' };
      await supabase.from('chairman_decisions')
        .update({ summary: title, brief_data: briefData, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      decisionId = existing.id;
      // escalateChairmanDecision dedups on brief_data.escalation_email_sent_at, already stamped
      // by the digest's original insert — this call is therefore a no-op on every refresh tick,
      // which is exactly how "at most one escalation email" holds across many stale ticks.
      const res = await escalateChairmanDecision(supabase, decisionId);
      escalated = res.escalated === true;
    } else {
      const dismissed = await findRecentlyDismissedStallDigest(supabase, context.node_ids);
      if (dismissed) {
        console.log(`[Adam PM] Suppressing re-escalation — digest ${dismissed.id} covering these nodes was dismissed within the last ${Math.round(DISMISS_COOLDOWN_MS / 60_000)}m`);
        decisionId = dismissed.id;
        escalated = false;
      } else {
        const res = await recordPendingDecision(supabase, {
          title,
          decisionType: 'session_question',
          context,
          blocking: true,
          raisedBy: 'adam',
        });
        decisionId = res.id;
        escalated = res.escalated === true;
      }
    }
    for (const n of stalls) alerted.push({ id: n.id, title: n.title || n.id, escalated });
  }
  return { snapshot, alerted };
}
