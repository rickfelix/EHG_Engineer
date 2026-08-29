/**
 * Stage 27 Template — Growth Playbook
 * Phase: LAUNCH & GROW (Stages 24-27)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F
 *
 * SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this content previously lived at
 * stage-26.js, shifted one position by the 27-stage renumber (dedicated_venture_uat
 * inserted at stage 23). Content and behavior are otherwise unchanged. Prior to this
 * SD no stage-27.js file existed at all — stage-templates ended at stage-26.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage26GrowthPlaybook } from './analysis-steps/stage-26-growth-playbook.js';

const TEMPLATE = {
  id: 'stage-27', slug: 'growth-playbook', title: 'Growth Playbook', version: '3.0.0',
  stageKey: 'growth_playbook',
  schema: {
    growth_experiments: { type: 'array' }, scaling_priorities: { type: 'array' },
    operations_handoff: { type: 'object' }, '90_day_plan': { type: 'object' },
    experiment_count: { type: 'number', derived: true }, has_operations_handoff: { type: 'boolean', derived: true },
  },
  defaultData: { growth_experiments: [], scaling_priorities: [], operations_handoff: null, experiment_count: 0 },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};
TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage26GrowthPlaybook;
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
