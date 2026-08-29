/**
 * Stage 25 Template — Go Live & Announce
 * Phase: LAUNCH & GROW (Stages 24-27)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this content previously lived at
 * stage-24.js, shifted one position by the 27-stage renumber (dedicated_venture_uat
 * inserted at stage 23). Content and behavior are otherwise unchanged.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage24GoLive } from './analysis-steps/stage-24-go-live.js';

const TEMPLATE = {
  id: 'stage-25', slug: 'go-live', title: 'Go Live & Announce', version: '3.0.0',
  stageKey: 'go_live',
  schema: {
    launch_status: { type: 'string' }, readiness_verdict: { type: 'string' },
    channels_to_activate: { type: 'array' }, total_channels: { type: 'number', derived: true },
    launched_at: { type: 'string' }, launch_notes: { type: 'string' },
  },
  defaultData: { launch_status: null, channels_to_activate: [], launched_at: null },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};
TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage24GoLive;
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
