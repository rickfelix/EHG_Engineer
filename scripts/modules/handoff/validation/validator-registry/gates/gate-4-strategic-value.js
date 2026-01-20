/**
 * Gate 4 - Strategic Value Validators (LEAD Final)
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validateGate4LeadFinal } from '../../../../workflow-roi-validation.js';

/**
 * Register Gate 4 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate4Validators(registry) {
  registry.register('valueDelivered', async (context) => {
    const { sd_id, supabase, allGateResults } = context;
    const result = await validateGate4LeadFinal(sd_id, supabase, allGateResults);
    return registry.normalizeResult(result);
  }, 'Strategic value delivered');

  registry.register('patternEffectiveness', async (context) => {
    // Part of Gate 4 composite validation
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Pattern effectiveness');

  registry.register('executiveValidation', async (context) => {
    // Part of Gate 4 composite validation
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Executive validation');

  registry.register('processAdherence', async (context) => {
    // Part of Gate 4 composite validation
    return registry.validators.get('valueDelivered').validate(context);
  }, 'Process adherence');
}
