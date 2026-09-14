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
 *
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-2): also calls
 * generateLegalDocsForVenture() as a side effect -- lib/eva/legal-doc-
 * producer.js had zero stage-template callers (only its own CLI self-invoke
 * and test files), so Stage 24's Launch Readiness checklist 'legal' category
 * (which reads venture_legal_overrides.generated_at) failed for every venture
 * until someone ran the producer by hand. This is the last stage before 24,
 * making it the natural place to generate the docs before they're read. The
 * call never blocks or alters this stage's own UAT verdict -- the producer is
 * idempotent (upserts existing rows) and never throws; its own failures
 * surface via eva_orchestration_events (subtype=legal_producer_failed), not
 * this stage's result.
 */
import { checkUatRobustnessGate } from '../../uat-robustness-gate.js';
import { generateLegalDocsForVenture } from '../../legal-doc-producer.js';
import { ARTIFACT_TYPES } from '../../artifact-types.js';
import { createLogger } from '../../../logger.js';

const STAGE_NUMBER = 23;
const moduleLogger = createLogger('S23DedicatedVentureUAT');

/**
 * @param {{supabase: Object, ventureId: string, ventureName?: string, logger?: Object}} params
 * @returns {Promise<{applies: boolean, satisfied: boolean, indeterminate?: boolean, reason: string, artifacts: Array}>}
 */
export async function analyzeStage23DedicatedVentureUat(params) {
  const { supabase, ventureId, ventureName, logger = moduleLogger } = params;
  logger.info?.(`[S23-DedicatedVentureUAT] Checking UAT robustness gate for ${ventureName || 'unknown'}`);

  const result = await checkUatRobustnessGate(supabase, ventureId, STAGE_NUMBER);

  // Defensive: generateLegalDocsForVenture is documented never-throws against a real
  // supabase client, but this call site treats any unexpected throw the same way the
  // producer treats its own internal failures -- never let it break this stage's UAT
  // artifact (matches the checkTelemetryAnalyticsWired wrapper pattern in
  // stage-23-launch-readiness.js).
  let legalDocsResult;
  try {
    legalDocsResult = await generateLegalDocsForVenture({ supabase, ventureId, logger });
  } catch (err) {
    logger.warn?.(`[S23-DedicatedVentureUAT] legal-doc-producer threw: ${err.message}`);
    legalDocsResult = { ok: false, reason: 'threw', error: err.message };
  }

  return {
    ...result,
    venture_name: ventureName,
    legal_docs: legalDocsResult,
    artifacts: [{
      artifactType: ARTIFACT_TYPES.LAUNCH_UAT_REPORT,
      title: 'Dedicated Venture UAT Report',
      payload: result,
      source: 'stage-23-dedicated-venture-uat',
      metadata: {
        sd_origin: 'SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001',
        canonical_artifact_type: ARTIFACT_TYPES.LAUNCH_UAT_REPORT,
        // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-6): the hash-link this launch_uat_report
        // artifact carries to its producing uat_test_runs row. checkUatRobustnessGate() now
        // returns run_id structurally (not only interpolated into `reason`).
        uat_test_run_id: result.run_id ?? null,
      },
      // Threaded through to writeArtifact()'s runId opt (via eva-orchestrator.js /
      // writeArtifactBatch, FR-6) so metadata.machine_provenance.run_id IS the actual
      // uat_test_runs.id, not an unrelated generated UUID -- the genuine verifiable link.
      runId: result.run_id ?? undefined,
    }],
  };
}
