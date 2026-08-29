/**
 * Stage 23 Template — Dedicated Venture UAT
 * Phase: LAUNCH & GROW (Stages 23-27)
 * SD: SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001
 *
 * Prior to this SD, stage-23.js held Launch Readiness Kill Gate content (now at
 * stage-24.js, its renumbered home per the 27-stage scheme). This is the new,
 * genuinely different stage-23 content: an in-stage UAT robustness checkpoint
 * exercising the venture's signed-in/signed-out user journeys (gate_type=none,
 * review_mode=auto per venture_stages) before Launch Readiness. The actual gate
 * logic already exists (lib/eva/uat-robustness-gate.js, built by
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C) and is wired into the exit-gate
 * chain separately -- this template's analysisStep calls the same pure checker
 * to produce this stage's own artifact record, matching every other template's
 * analyzer-to-artifact pattern.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage23DedicatedVentureUat } from './analysis-steps/stage-23-dedicated-venture-uat.js';

const TEMPLATE = {
  id: 'stage-23', slug: 'dedicated-venture-uat', title: 'Dedicated Venture UAT', version: '1.0.0',
  stageKey: 'dedicated_venture_uat',
  schema: {
    applies: { type: 'boolean' }, satisfied: { type: 'boolean' },
    indeterminate: { type: 'boolean' }, reason: { type: 'string' },
  },
  defaultData: { applies: false, satisfied: true, indeterminate: false, reason: null },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};
TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage23DedicatedVentureUat;
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
