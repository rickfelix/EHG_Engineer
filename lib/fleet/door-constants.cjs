/**
 * Door-routing shared constants (SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001).
 * CJS so BOTH the ESM classifier (lib/fleet/door-classifier.mjs) and the CJS
 * dispatch path (lib/coordinator/dispatch.cjs) consume ONE definition.
 */
'use strict';

const DOORS = Object.freeze({ ONE_WAY: 'one_way', TWO_WAY: 'two_way' });

// Delegate tiers admitted for two_way dispatch. PLUGGABLE: a future local/ollama
// rung is one entry here — no rubric or gate change (chairman amendment contract).
// REVISIT-IF(condition=model lineup changes e.g. Gemini 3.5 GA or Claude 5.x delegate tiers) owner=coordinator provenance=SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 note=point-in-time model-name list; re-derive from capability evals not names when attestation ships
const DELEGATE_TIERS = Object.freeze(['opus', 'sonnet']);

// REVISIT-IF(expires=2026-07-12) owner=coordinator provenance=SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 note=inert-until-Tuesday cutover flag; after 2026-07-08 flip + door_class stamping wiring this default-off shim should be re-inspected (flag removed or defaulted on)
/** Post-Tuesday cutover flag: off = dispatch behavior byte-identical to today. */
function isDoorRoutingEnabled(env = process.env) {
  const v = String(env.DOOR_ROUTING_ENABLED ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'on';
}

module.exports = { DOORS, DELEGATE_TIERS, isDoorRoutingEnabled };
