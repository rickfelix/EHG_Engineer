/**
 * Stage 26 Template — Post-Launch Review
 * Phase: LAUNCH & GROW (Stages 24-27)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F
 *
 * SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this content previously lived at
 * stage-25.js, shifted one position by the 27-stage renumber (dedicated_venture_uat
 * inserted at stage 23). Content and behavior are otherwise unchanged.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage25PostLaunchReview } from './analysis-steps/stage-25-post-launch-review.js';

const TEMPLATE = {
  id: 'stage-26', slug: 'post-launch-review', title: 'Post-Launch Review', version: '3.0.0',
  stageKey: 'post_launch_review',
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
