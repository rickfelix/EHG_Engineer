/**
 * ADKAR_ADOPTION_GATE — LEAD-FINAL-APPROVAL completion safeguard
 * SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-B (FR-2)
 *
 * At LEAD-FINAL-APPROVAL, an SD flagged metadata.requires_adoption=true (a change that
 * requires role/agent adoption — a new tool, a protocol change, a role-contract change)
 * must have all 5 ADKAR (Prosci) stages — Awareness, Desire, Knowledge, Ability,
 * Reinforcement — evidenced or explicitly waived-with-reason in metadata.adkar_checklist
 * before it can complete. This is a no-op for every SD that does not set that flag (the
 * overwhelming majority of SDs).
 *
 * Structurally mirrors learning-or-bypass-resolved-gate.js: same gate-object shape, same
 * feature-flag rollout convention (ENFORCE_ADKAR_GATE, default false/warn-only), same
 * warn-vs-block score split (60 on warn, 0 on block).
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

const GATE_NAME = 'ADKAR_ADOPTION';
const ADKAR_STAGES = ['awareness', 'desire', 'knowledge', 'ability', 'reinforcement'];

/**
 * Is this ADKAR checklist stage entry satisfied (evidenced or waived-with-reason)?
 *
 * @param {*} entry
 * @returns {boolean}
 */
function isStageSatisfied(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const hasEvidence = typeof entry.evidence === 'string' && entry.evidence.trim().length > 0;
  const hasWaiver = entry.waived === true && typeof entry.reason === 'string' && entry.reason.trim().length > 0;
  return hasEvidence || hasWaiver;
}

/**
 * Create the ADKAR adoption completion gate.
 *
 * @param {object} _supabase - Unused; accepted for call-site consistency with sibling
 *   gate factories (gates.js calls every factory as createXGate(supabase)). This gate
 *   reads only ctx.sd.metadata, no DB queries needed.
 * @returns {Object} Gate definition
 */
export function createAdkarAdoptionGate(_supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n📋 GATE: ADKAR Adoption Completion');
      console.log('-'.repeat(50));

      const requiresAdoption = ctx?.sd?.metadata?.requires_adoption === true;

      if (!requiresAdoption) {
        console.log('   metadata.requires_adoption is not set — gate not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { requires_adoption: false },
        };
      }

      const checklist = ctx?.sd?.metadata?.adkar_checklist || {};
      const missingStages = ADKAR_STAGES.filter((stage) => !isStageSatisfied(checklist[stage]));

      if (missingStages.length === 0) {
        console.log('   All 5 ADKAR stages evidenced or waived — gate passes');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { requires_adoption: true, missing_stages: [] },
        };
      }

      const enforceFlag = process.env.ENFORCE_ADKAR_GATE === 'true';
      const warnOnly = !enforceFlag;
      const message = `metadata.requires_adoption=true but the following ADKAR stage(s) are missing evidence or a waiver: ${missingStages.join(', ')}. Resolve via metadata.adkar_checklist.<stage> = { evidence: '<citation>' } or { waived: true, reason: '<reason>' } for each.`;

      console.log(`   ${warnOnly ? '⚠️  WARN' : '❌ BLOCK'}: ${message}`);

      return {
        passed: warnOnly,
        score: warnOnly ? 60 : 0,
        max_score: 100,
        issues: warnOnly ? [] : [message],
        warnings: warnOnly ? [message] : [],
        details: {
          requires_adoption: true,
          missing_stages: missingStages,
          enforce_flag: enforceFlag,
        },
      };
    },
    required: true, // Registered as blocking; feature flag controls actual enforcement
  };
}
