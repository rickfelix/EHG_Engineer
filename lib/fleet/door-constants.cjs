/**
 * Door-routing shared constants (SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001).
 * CJS so BOTH the ESM classifier (lib/fleet/door-classifier.mjs) and the CJS
 * dispatch path (lib/coordinator/dispatch.cjs) consume ONE definition.
 */
'use strict';

const DOORS = Object.freeze({ ONE_WAY: 'one_way', TWO_WAY: 'two_way' });

// Delegate tiers admitted for two_way dispatch. PLUGGABLE: a future local/ollama
// rung is one entry here — no rubric or gate change (chairman amendment contract).
const DELEGATE_TIERS = Object.freeze(['opus', 'sonnet']);

/** Post-Tuesday cutover flag: off = dispatch behavior byte-identical to today. */
function isDoorRoutingEnabled(env = process.env) {
  const v = String(env.DOOR_ROUTING_ENABLED ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'on';
}

module.exports = { DOORS, DELEGATE_TIERS, isDoorRoutingEnabled };
