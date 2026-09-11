/**
 * QF-20260907-765 (deferred half (b) of QF-20260905-431): dry-run the LEAD-TO-PLAN gate
 * battery against a not-yet-inserted SD candidate, so a caller (currently: createChild()) can
 * REFUSE a mint known to fail those gates instead of inserting a row known to fail.
 *
 * ACCURATE, not merely conservative: buildDefault*() (pipeline.js) and validateSDFields()
 * (validate-sd-fields.js) are already exported, pure, DB-free functions — the SAME ones
 * createSD() itself calls internally before insert. Callers build the candidate with the
 * SAME buildDefault*() fallback substitution createSD() applies, this module then applies the
 * SAME validateSDFields({enrich:true}) pass createSD() applies (fills dependencies,
 * implementation_guidelines, key_principles, risks), and finally runs the real
 * LEAD-TO-PLAN gate validators against the result. No new pipeline.js internals needed.
 *
 * All 4 validators are called WITHOUT a supabase client — validateSmokeTestSpecification's
 * client param only enables an opportunistic metadata->top-level write-back hoist; omitting it
 * runs the full read-only validation with no DB touch, exactly as needed for a pre-insert dry run.
 */
import { validateSDFields } from '../../scripts/modules/validate-sd-fields.js';
import { validateSdQuality } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-quality-gate.js';
import { validatePlaceholderContent } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js';
import { validateSmokeTestSpecification } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/smoke-test-specification.js';
import { validateMechanismClaims } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/mechanism-claim-verifier.js';

const GATES = [
  { name: 'GATE_SD_QUALITY', run: validateSdQuality },
  { name: 'GATE_PLACEHOLDER_CONTENT_DETECTION', run: validatePlaceholderContent },
  { name: 'GATE_SMOKE_TEST_SPECIFICATION', run: (sd) => validateSmokeTestSpecification(sd) },
  { name: 'GATE_MECHANISM_CLAIM_VERIFIER', run: (sd) => validateMechanismClaims(sd) },
];

/**
 * @param {Object} candidateSd - a plain SD-shaped object built the same way createSD() would
 *   build it internally (buildDefault*() substitution already applied by the caller).
 * @returns {Promise<{pass: boolean, failingGates: string[], details: Object}>}
 */
export async function dryRunGateBattery(candidateSd) {
  const candidate = { ...candidateSd };
  // Mirrors createSD()'s own pre-insert `validateSDFields(sdData, { enrich: true })` call —
  // fills the JSONB fields buildDefault*() doesn't cover (dependencies,
  // implementation_guidelines, key_principles, risks).
  validateSDFields(candidate, { enrich: true, quiet: true });

  const failingGates = [];
  const details = {};
  for (const gate of GATES) {
    const result = await gate.run(candidate);
    details[gate.name] = result;
    if (!result.pass) failingGates.push(gate.name);
  }
  return { pass: failingGates.length === 0, failingGates, details };
}
