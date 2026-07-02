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
  const alerted = [];
  for (const node of Array.isArray(parents) ? parents : []) {
    if (!node || !node.id) continue;
    const ticks = bumpMovementTicks(node, prevSnapshot);
    snapshot[node.id] = { updated_at: node.updated_at, ticks };

    const status = classifyStaleness(
      { ticksSinceMovement: ticks, inFlightNextStep: !!node.inFlightNextStep },
      opts
    );
    if (status !== 'genuine_stall') continue;

    const res = await recordPendingDecision(supabase, {
      title: `Adam PM stall: ${node.title || node.id}`,
      decisionType: 'session_question',
      context: { node_id: node.id, ticks_since_movement: ticks },
      blocking: true,
      raisedBy: 'adam',
    });
    alerted.push({ id: node.id, title: node.title || node.id, escalated: res.escalated === true });
  }
  return { snapshot, alerted };
}
