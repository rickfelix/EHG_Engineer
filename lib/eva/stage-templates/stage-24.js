/**
 * Stage 24 Template — Go Live & Announce
 * Phase: LAUNCH & GROW (Stages 23-26)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage24GoLive } from './analysis-steps/stage-24-go-live.js';

const TEMPLATE = {
  id: 'stage-24', slug: 'go-live', title: 'Go Live & Announce', version: '3.0.0',
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
