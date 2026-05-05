/**
 * Stage 23 Template — Launch Readiness Kill Gate
 * Phase: LAUNCH & GROW (Stages 23-26)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-1:
 *   analysisStep wraps the canonical analyzer's bare result in the typed-array
 *   persistence contract so venture_artifacts rows for Stage 23 are emitted with
 *   artifact_type='launch_readiness_checklist' (the canonical name per
 *   lifecycle_stage_config). Top-level fields (checklist/verdict/etc.) are
 *   preserved at the result root for backward-compat with callers that read the
 *   bare analyzer shape directly.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage23LaunchReadiness } from './analysis-steps/stage-23-launch-readiness.js';
import { ARTIFACT_TYPES } from '../artifact-types.js';

const TEMPLATE = {
  id: 'stage-23', slug: 'launch-readiness', title: 'Launch Readiness Kill Gate', version: '3.1.0',
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
TEMPLATE.analysisStep = async function stage23LaunchReadinessAnalysisStep(params) {
  const result = await analyzeStage23LaunchReadiness(params);
  return {
    ...result,
    artifacts: [{
      artifactType: ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST,
      title: 'Launch Readiness Checklist',
      payload: result,
      source: 'stage-23-launch-readiness',
      metadata: {
        sd_origin: 'SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001',
        canonical_artifact_type: ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST,
      },
    }],
  };
};
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
