/**
 * Stage 25 Template — Post-Launch Review
 * Phase: LAUNCH & GROW (Stages 23-26)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage25PostLaunchReview } from './analysis-steps/stage-25-post-launch-review.js';

const TEMPLATE = {
  id: 'stage-25', slug: 'post-launch-review', title: 'Post-Launch Review', version: '3.0.0',
  schema: {
    metrics: { type: 'object' }, assumptions_validated: { type: 'array' },
    assumptions_invalidated: { type: 'array' }, key_learnings: { type: 'array' },
    data_collection_status: { type: 'string' },
  },
  defaultData: { metrics: {}, assumptions_validated: [], assumptions_invalidated: [], data_collection_status: 'pending' },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};
TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage25PostLaunchReview;
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
