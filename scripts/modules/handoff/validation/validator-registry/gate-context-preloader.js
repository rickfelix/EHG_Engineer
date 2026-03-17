/**
 * Gate Context Preloader
 * SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001
 *
 * Pre-fetches shared validation data for numbered gates (2, 3, 4) so that
 * individual validators within a gate can reuse the same query result instead
 * of each making redundant DB calls.
 *
 * Usage:
 *   const gateContext = await preloadGateContext(gateNumber, sdId, supabase, extras);
 *   // Pass gateContext on the validator context object:
 *   context.gateContext = gateContext;
 *   // Each validator checks ctx.gateContext?.gate2Result first.
 */

import { validateGate2ExecToPlan } from '../../../implementation-fidelity-validation.js';
import { validateGate3PlanToLead } from '../../../traceability-validation.js';
import { validateGate4LeadFinal } from '../../../workflow-roi-validation.js';

/**
 * Pre-fetch shared gate data so validators can reuse it.
 *
 * @param {number} gateNumber - The gate number (2, 3, or 4)
 * @param {string} sdId - Strategic Directive ID
 * @param {object} supabase - Supabase client
 * @param {object} [extras={}] - Additional args per gate:
 *   gate 3: { gate2Results }
 *   gate 4: { allGateResults }
 * @returns {Promise<object>} Pre-fetched gate context keyed by gate result name
 */
export async function preloadGateContext(gateNumber, sdId, supabase, extras = {}) {
  const context = {};
  // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Pass pre-fetched data to avoid duplicate queries
  const prefetchOpts = extras.prefetched ? { prefetched: extras.prefetched } : {};

  switch (gateNumber) {
    case 2: {
      console.log('   [GatePreloader] Pre-fetching Gate 2 data (single query for all validators)');
      context.gate2Result = await validateGate2ExecToPlan(sdId, supabase, prefetchOpts);
      break;
    }
    case 3: {
      console.log('   [GatePreloader] Pre-fetching Gate 3 data (single query for all validators)');
      context.gate3Result = await validateGate3PlanToLead(sdId, supabase, extras.gate2Results || null, prefetchOpts);
      break;
    }
    case 4: {
      console.log('   [GatePreloader] Pre-fetching Gate 4 data (single query for all validators)');
      context.gate4Result = await validateGate4LeadFinal(sdId, supabase, extras.allGateResults || {}, prefetchOpts);
      break;
    }
    default:
      // No preloading needed for other gates
      break;
  }

  return context;
}

/**
 * Determine which gate number a rule_name belongs to.
 * Returns null if the rule is not part of a preloadable gate.
 *
 * @param {string} ruleName - The validator rule_name
 * @returns {number|null} Gate number (2, 3, or 4) or null
 */
export function getGateNumberForRule(ruleName) {
  if (GATE_2_RULES.has(ruleName)) return 2;
  if (GATE_3_RULES.has(ruleName)) return 3;
  if (GATE_4_RULES.has(ruleName)) return 4;
  return null;
}

// Rule names that belong to each gate (for gate grouping detection)
const GATE_2_RULES = new Set([
  'uiComponentsImplemented',
  'userWorkflowsImplemented',
  'userActionsSupported',
  'migrationsCreatedAndExecuted',
  'rlsPoliciesImplemented',
  'migrationComplexityAligned',
  'databaseQueriesIntegrated',
  'formUiIntegration',
  'dataValidationImplemented',
  'e2eTestCoverage'
]);

const GATE_3_RULES = new Set([
  'recommendationAdherence',
  'implementationQuality',
  'traceabilityMapping',
  'subAgentEffectiveness',
  'lessonsCaptured'
]);

const GATE_4_RULES = new Set([
  'valueDelivered',
  'patternEffectiveness',
  'executiveValidation',
  'processAdherence'
]);
