/**
 * Stage 24 Template — Launch Readiness Kill Gate
 * Phase: LAUNCH & GROW (Stages 24-27)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this content previously lived at
 * stage-23.js. The 27-stage scheme inserted dedicated_venture_uat at stage 23 (see
 * stage-23.js), shifting Launch Readiness to its renumbered home here. Content and
 * behavior are otherwise unchanged from the pre-renumber version.
 *
 * SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-1:
 *   analysisStep wraps the canonical analyzer's bare result in the typed-array
 *   persistence contract so venture_artifacts rows for this stage are emitted with
 *   artifact_type='launch_readiness_checklist' (the canonical name per
 *   lifecycle_stage_config). Top-level fields (checklist/verdict/etc.) are
 *   preserved at the result root for backward-compat with callers that read the
 *   bare analyzer shape directly.
 */
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage23LaunchReadiness } from './analysis-steps/stage-23-launch-readiness.js';
import { ARTIFACT_TYPES } from '../artifact-types.js';

const TEMPLATE = {
  id: 'stage-24', slug: 'launch-readiness', title: 'Launch Readiness Kill Gate', version: '3.1.0',
  stageKey: 'launch_readiness_gate',
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
TEMPLATE.analysisStep = async function stage24LaunchReadinessAnalysisStep(params) {
  const result = await analyzeStage23LaunchReadiness(params);
  return {
    ...result,
    artifacts: [{
      artifactType: ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST,
      title: 'Launch Readiness Checklist',
      payload: result,
      source: 'stage-24-launch-readiness',
      metadata: {
        sd_origin: 'SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001',
        canonical_artifact_type: ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST,
      },
    }],
  };
};
ensureOutputSchema(TEMPLATE);
export default TEMPLATE;
