/**
 * Stage 23 Analysis Step — Dedicated Venture UAT
 * SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001.
 *
 * Records the UAT robustness gate's own finding as a per-stage artifact.
 * checkUatRobustnessGate() (lib/eva/uat-robustness-gate.js, built by
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C) is the actual exit-gate check --
 * already wired separately into the exit-gate chain via stage-execution-
 * worker.js. This analysis step does NOT duplicate that gating decision; it
 * calls the same pure checker to produce a readable stage-23 artifact
 * (checklist entry + verdict) so the pipeline's own per-stage record reflects
 * what ran, matching every other stage template's pattern of wrapping its
 * analyzer's result into a venture_artifacts row.
 */
import { checkUatRobustnessGate } from '../../uat-robustness-gate.js';
import { ARTIFACT_TYPES } from '../../artifact-types.js';

const STAGE_NUMBER = 23;

/**
 * @param {{supabase: Object, ventureId: string, ventureName?: string, logger?: Object}} params
 * @returns {Promise<{applies: boolean, satisfied: boolean, indeterminate?: boolean, reason: string, artifacts: Array}>}
 */
export async function analyzeStage23DedicatedVentureUat(params) {
  const { supabase, ventureId, ventureName, logger = console } = params;
  logger.info?.(`[S23-DedicatedVentureUAT] Checking UAT robustness gate for ${ventureName || 'unknown'}`);

  const result = await checkUatRobustnessGate(supabase, ventureId, STAGE_NUMBER);

  return {
    ...result,
    venture_name: ventureName,
    artifacts: [{
      artifactType: ARTIFACT_TYPES.LAUNCH_UAT_REPORT,
      title: 'Dedicated Venture UAT Report',
      payload: result,
      source: 'stage-23-dedicated-venture-uat',
      metadata: {
        sd_origin: 'SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001',
        canonical_artifact_type: ARTIFACT_TYPES.LAUNCH_UAT_REPORT,
      },
    }],
  };
}
