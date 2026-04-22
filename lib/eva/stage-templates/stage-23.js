/**
 * Stage 23 Template — Launch Readiness Kill Gate
 * Phase: LAUNCH & GROW (Stages 23-26)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage23LaunchReadiness } from './analysis-steps/stage-23-launch-readiness.js';

const TEMPLATE = {
  id: 'stage-23', slug: 'launch-readiness', title: 'Launch Readiness Kill Gate', version: '3.0.0',
  schema: {
    checklist: { type: 'array' }, verdict: { type: 'string' },
    pass_count: { type: 'number', derived: true }, fail_count: { type: 'number', derived: true },
    readiness_pct: { type: 'number', derived: true },
  },
  defaultData: { checklist: [], verdict: null, pass_count: 0, fail_count: 0, readiness_pct: 0 },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};
TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage23LaunchReadiness;
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
