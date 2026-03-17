/**
 * Gate 4 - Strategic Value Validators (LEAD Final)
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 *
 * SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Validators now check
 * ctx.gateContext.gate4Result before making independent DB queries.
 * The preloader fetches shared data once; validators reuse it.
 */

import { validateGate4LeadFinal } from '../../../../workflow-roi-validation.js';

/**
 * Get Gate 4 result from preloaded context or fetch it fresh.
 * @param {object} context - Validator context
 * @returns {Promise<object>} Gate 4 validation result
 */
async function getGate4Result(context) {
  // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use preloaded result if available
  if (context.gateContext?.gate4Result) {
    return context.gateContext.gate4Result;
  }
  const { sd_id, supabase, allGateResults } = context;
  return validateGate4LeadFinal(sd_id, supabase, allGateResults);
}

/**
 * Register Gate 4 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate4Validators(registry) {
  registry.register('valueDelivered', async (context) => {
    const result = await getGate4Result(context);
    return registry.normalizeResult(result);
  }, 'Strategic value delivered');

  registry.register('patternEffectiveness', async (context) => {
    // Part of Gate 4 composite validation — reuses same preloaded result
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Pattern effectiveness');

  registry.register('executiveValidation', async (context) => {
    // Part of Gate 4 composite validation — reuses same preloaded result
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Executive validation');

  registry.register('processAdherence', async (context) => {
    // Part of Gate 4 composite validation — reuses same preloaded result
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Process adherence');
}
