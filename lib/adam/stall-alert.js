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
import { recordPendingDecision } from '../chairman/record-pending-decision.mjs';
import { setStatus } from './task-ledger.js';

const SD_TERMINAL_STATUSES = ['completed', 'cancelled'];

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
    stalls.push({ ...node, ticks });
  }

  // Cap escalation at ONE digest decision per tick — never per-node — so N stalls never flood
  // the chairman queue with N blocking rows.
  const alerted = [];
  if (stalls.length > 0) {
    const title = stalls.length === 1
      ? `Adam PM stall: ${stalls[0].title || stalls[0].id}`
      : `Adam PM stall: ${stalls.length} threads stalled`;
    const res = await recordPendingDecision(supabase, {
      title,
      decisionType: 'session_question',
      context: {
        node_ids: stalls.map((n) => n.id),
        ticks_since_movement: Object.fromEntries(stalls.map((n) => [n.id, n.ticks])),
      },
      blocking: true,
      raisedBy: 'adam',
    });
    for (const n of stalls) alerted.push({ id: n.id, title: n.title || n.id, escalated: res.escalated === true });
  }
  return { snapshot, alerted };
}
