/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D1/FR-D3/FR-D4: a committed census of every
 * LEAD-FINAL-APPROVAL gate's disposition, so "which gates are really required / really enforced"
 * is a generated, re-runnable artifact rather than prose in a PRD that drifts from the code.
 *
 * Measured before this SD: the SD's own pre-authored text named "9 of 31" required gates -- both
 * numbers were wrong (22 actually registered via getRequiredGates(), 16 of which declare
 * required:true). This census is generated FROM getRequiredGates() itself, so it cannot drift the
 * way a hand-maintained list did.
 */
import { getRequiredGates } from './gates.js';

/**
 * Env-flag-gated gates whose REAL enforcement sits behind a feature flag, independent of their
 * static `required` declaration (SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D3 census). Keyed by
 * gate name as returned by getRequiredGates(). `enforced` reflects each flag's CURRENT resolved
 * default (read live from process.env at census time, matching each gate's own polarity).
 */
const ENV_FLAG_GATES = {
  ADKAR_ADOPTION: {
    env_flag: 'ENFORCE_ADKAR_GATE',
    polarity: 'opt-out', // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D3: flipped to enforce-by-default
    resolve: () => process.env.ENFORCE_ADKAR_GATE !== 'false',
    disposition: 'ENFORCED (turned on 2026-09-05, measured zero-risk: only 1/6,089 SDs ever set requires_adoption=true, already completed)',
  },
  LEARNING_OR_BYPASS_RESOLVED: {
    env_flag: 'ENFORCE_LEARNING_GATE',
    polarity: 'opt-in',
    resolve: () => process.env.ENFORCE_LEARNING_GATE === 'true',
    disposition: 'OBSERVE-ONLY for its secondary check (its PRIMARY unresolved-bypass block is unconditional and NOT gated by this flag) -- left alone: the flag governs an unmeasured secondary check, not the gate\'s main enforcement.',
  },
  ACCEPTANCE_TIER_DOWNGRADE: {
    env_flag: 'ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING',
    polarity: 'opt-in',
    resolve: () => process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING === 'true',
    disposition: 'OBSERVE-ONLY -- left alone per that gate\'s own prior-SD recommendation to spot-check its false-positive rate before ever binding.',
  },
  INVOCATION_PATH_PROOF: {
    env_flag: 'INVOCATION_PATH_PROOF_MODE',
    polarity: 'opt-in',
    resolve: () => process.env.INVOCATION_PATH_PROOF_MODE === 'block',
    disposition: 'ADVISORY (default) -- left alone; out of this SD\'s named scope.',
  },
};

/**
 * @param {Object} supabase
 * @param {Object} prdRepo
 * @param {Object|null} sd - a representative SD shape (only sd_key/sd_type/id matter for census
 *   purposes; getRequiredGates() uses `sd` only to decide whether to push the SD-Start gate).
 * @returns {Array<{name: string, required: boolean, registered: true, env_flag: string|null, env_flag_disposition: string|null}>}
 */
export function buildGateCensus(supabase, prdRepo, sd = { sd_key: 'CENSUS-FIXTURE', sd_type: 'bugfix' }) {
  const gateDefs = getRequiredGates(supabase, prdRepo, sd);
  return gateDefs.map((g) => {
    const flagInfo = ENV_FLAG_GATES[g.name];
    return {
      name: g.name,
      required: g.required !== false,
      registered: true,
      env_flag: flagInfo?.env_flag ?? null,
      env_flag_enforced: flagInfo ? flagInfo.resolve() : null,
      env_flag_disposition: flagInfo?.disposition ?? null,
    };
  });
}
