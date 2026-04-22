/**
 * Stage 26 Template — Growth Playbook
 * Phase: LAUNCH & GROW (Stages 23-26)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage26GrowthPlaybook } from './analysis-steps/stage-26-growth-playbook.js';

const TEMPLATE = {
  id: 'stage-26', slug: 'growth-playbook', title: 'Growth Playbook', version: '3.0.0',
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
