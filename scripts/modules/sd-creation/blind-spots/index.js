/**
 * Blind Spots SD Data Module
 *
 * Exports all SD data for the Blind Spots Orchestrator.
 * Used by create-sd-blind-spots-orchestrator.js
 */

export { childSDs } from './child-sds.js';
export {
  evaGrandchildren,
  legalGrandchildren,
  pricingGrandchildren,
  failureGrandchildren,
  skillsGrandchildren,
  deprecationGrandchildren
} from './grandchildren-sds.js';
export { createOrchestratorData } from './orchestrator-sd.js';
