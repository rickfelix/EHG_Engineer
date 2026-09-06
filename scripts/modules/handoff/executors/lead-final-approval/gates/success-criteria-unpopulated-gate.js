/**
 * Success-Criteria-Unpopulated Gate for LEAD-FINAL-APPROVAL.
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-002.
 *
 * THE DEFECT THIS CLOSES: SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 reached status='completed'
 * via LEAD-FINAL-APPROVAL while success_criteria[0] (its stage-23-walk completion criterion --
 * one of 4 entries on the live row that carry the sentinel, not the array's only entry) still
 * carried measure:"[UNPOPULATED]" -- the literal sentinel lib/sd-fields/unpopulated.js defines
 * for "never actually measured". classifyEntry()/VALUE_KEY_BY_FIELD is already imported and run
 * over success_criteria.measure at LEAD-TO-PLAN (gates/placeholder-content.js), but only for
 * DISCLOSURE ("FR-4: disclosure only -- never affects pass", placeholder-content.js:257). No gate
 * anywhere reads success_criteria at LEAD-FINAL-APPROVAL, the phase where the work should already
 * be done and every criterion should have a real measured outcome.
 *
 * SCOPE, DELIBERATELY NARROW: only the 'unpopulated' classification (the literal sentinel).
 * 'legacy_filler' (old-generator boilerplate like "See description for details") is OUT of scope
 * here -- that class already has its own deliberately-narrow blocking rule at
 * lead-to-plan/gates/placeholder-content.js (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A), and relitigating
 * it is not this SD's job. Only success_criteria is checked -- not key_changes/success_metrics.
 *
 * OBSERVE-ONLY BY DEFAULT (SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING=true to flip): mirrors
 * acceptance-tier-downgrade-gate.js's env-flip convention exactly. validation-agent independently
 * measured that an unconditional blocking version would immediately fail 24 of 52 (46%) of live
 * non-terminal SDs -- including this SD itself before LEAD corrected its own fields. Binding is a
 * separate, future rollout decision once the fleet's backlog is worked down; shipping this bound
 * by default on day one would get the gate switched off, permanently, which buys nothing.
 *
 * NOT ATTEMPTED HERE (documented, not silently dropped): full evidence-artifact-pointer
 * resolution (a named artifact table/row with producer/run-id/content-hash provenance) and any
 * strategic_directives_v2.status schema change. Both were in the original QF-20260905-641 ask;
 * both were descoped during LEAD after confirming the schema migration's 450+ call-site blast
 * radius. This gate catches the literal sentinel only -- a hand-typed but still-unverified measure
 * passes cleanly and does not (yet) get caught by anything.
 */
import { classifyEntry } from '../../../../../../lib/sd-fields/unpopulated.js';

function isBindingEnabled(env = process.env) {
  return env.SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING === 'true';
}

/**
 * Find every success_criteria[] entry still carrying the [UNPOPULATED] sentinel on its
 * measure field. Pure — no I/O — so it is directly unit-testable against a fixture array.
 * @param {Array} successCriteria
 * @returns {Array<{index:number, criterion:string}>}
 */
export function findUnpopulatedCriteria(successCriteria) {
  if (!Array.isArray(successCriteria) || successCriteria.length === 0) return [];
  const offending = [];
  successCriteria.forEach((entry, index) => {
    if (classifyEntry(entry, 'measure') !== 'unpopulated') return;
    const criterion = typeof entry === 'object' && entry !== null ? entry.criterion : entry;
    offending.push({ index, criterion: typeof criterion === 'string' ? criterion.trim() : String(criterion ?? '') });
  });
  return offending;
}

/**
 * Validate an SD's success_criteria for unpopulated measures.
 * @param {Object} sd - Strategic Directive (must carry success_criteria)
 * @param {Object} [env] - injected env for testability
 * @returns {Object} gate result
 */
export function validateSuccessCriteriaMeasured(sd = {}, env = process.env) {
  console.log('   Checking success_criteria for unpopulated measures...');

  const offending = findUnpopulatedCriteria(sd?.success_criteria);

  if (offending.length === 0) {
    console.log('   ✅ success_criteria: no unpopulated measures found');
    return {
      passed: true, pass: true, score: 100, max_score: 100, maxScore: 100,
      issues: [], warnings: [], details: { offending: [], bound: isBindingEnabled(env) }
    };
  }

  const named = offending.map((o) => `#${o.index} "${o.criterion}"`).join(', ');
  const message =
    `success_criteria has ${offending.length} entry(ies) still carrying the [UNPOPULATED] sentinel measure: ${named}. ` +
    'Replace each with the real, measured outcome (what was actually verified, and how) before ' +
    'claiming this SD complete.';

  const bound = isBindingEnabled(env);
  if (bound) {
    console.log(`   ❌ ${message} (BINDING mode)`);
    return {
      passed: false, pass: false, score: 0, max_score: 100, maxScore: 100,
      issues: [message], warnings: [], details: { offending, bound: true }
    };
  }

  console.log(`   ⚠️  ${message} (observe-only)`);
  return {
    passed: true, pass: true, score: 100, max_score: 100, maxScore: 100,
    issues: [], warnings: [message], details: { offending, bound: false }
  };
}

/**
 * Create the success-criteria-unpopulated gate.
 * @returns {Object} Gate configuration
 */
export function createSuccessCriteriaUnpopulatedGate() {
  return {
    name: 'GATE_SUCCESS_CRITERIA_UNPOPULATED',
    validator: async (ctx) => {
      console.log('\n📏 GATE: Success-Criteria-Unpopulated Detection');
      console.log('-'.repeat(50));
      return validateSuccessCriteriaMeasured(ctx.sd);
    },
    required: true,
    remediation:
      'Replace every success_criteria entry still carrying measure:"[UNPOPULATED]" with the real, '
      + 'measured outcome before claiming this SD complete. Observe-only by default -- set '
      + 'SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING=true to make this blocking.'
  };
}
