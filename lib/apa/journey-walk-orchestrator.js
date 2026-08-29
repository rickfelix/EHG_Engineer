/**
 * Venture journey-walk orchestrator — SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-2.
 *
 * Wires the pieces FR-0/FR-1/PR2 already established into one walk: acquireLiveInstance
 * (live-instance-acquisition.mjs) -> venture preflight checks + runJourneyWalk
 * (browser-executor.js, per-step resolution via venture-step-executors.js) ->
 * result-recorder.js (uat_test_runs/uat_test_results) -> stamps
 * strategic_directives_v2.metadata.journey_walk_result, the exact field PR2's
 * plan-to-lead prerequisite-check gate (checkParentOrchestrator) reads.
 *
 * Never throws on a reachable-but-broken venture — every failure mode (can't acquire the
 * instance, a step has no verified UI mapping, auth unavailable) is recorded as data, not
 * an exception. Making journey coverage visible is this SD's own stated purpose; a walk
 * that "fails" by finding real gaps is the mechanism working correctly, not a bug.
 */

import { acquireLiveInstance as defaultAcquireLiveInstance } from './live-instance-acquisition.mjs';
import { runJourneyWalk as defaultRunJourneyWalk } from './browser-executor.js';
import { buildStepExecutor as defaultBuildStepExecutor, getVentureRegistration as defaultGetVentureRegistration } from './venture-step-executors.js';
import { generateJourneyScenarios as defaultGenerateJourneyScenarios } from '../uat/scenario-generator.js';
import * as resultRecorder from '../uat/result-recorder.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

/**
 * @param {Object} params
 * @param {string} params.sdId - orchestrator SD whose metadata.journey_walk_result gets stamped
 * @param {string} [params.ventureId] - ventures.id; threaded into startSession()'s
 *   metadata.venture_id so lib/eva/uat-robustness-gate.js's metadata->>venture_id lookup
 *   (QF dcc36266 retro action item) can match this run. Optional/best-effort: omitting it
 *   is byte-identical to prior callers (startSession defaults it to null).
 * @param {number} [params.stageNumber] - venture_stages.stage_number this walk is exiting;
 *   threaded into startSession()'s metadata.stage_number for the same gate lookup. Optional.
 * @param {string} params.ventureKey - venture-step-executors.js registry key, e.g. 'ALTIFYAI'
 * @param {string} params.baseUrl - live, already-deployed venture URL
 * @param {Array} params.journeySteps - lib/eva/bridge/orchestrator-journey-steps.js's deriveJourneySteps() output
 * @param {Object} [params.persona] - {type: 'existing'|'fresh'} (lib/apa/venture-step-executors.js's
 *   getTestCredential); selects which pre-provisioned test identity the walker signs in as.
 *   Defaults to 'existing' when type is omitted (M2, Solomon/Oracle completeness finding).
 * @param {Object} [params.deps] - injectable overrides (acquireLiveInstance, runJourneyWalk,
 *   buildStepExecutor, getVentureRegistration, generateJourneyScenarios, startSession,
 *   recordResult, completeSession, getSupabase) — for tests only, defaults to real modules
 * @returns {Promise<Object>} walk summary — also stamped onto the SD's metadata
 */
export async function runVentureJourneyWalk({ sdId, ventureId = null, stageNumber = null, ventureKey, baseUrl, journeySteps, persona = {}, deps = {} }) {
  const acquireLiveInstance = deps.acquireLiveInstance || defaultAcquireLiveInstance;
  const runJourneyWalk = deps.runJourneyWalk || defaultRunJourneyWalk;
  const buildStepExecutor = deps.buildStepExecutor || defaultBuildStepExecutor;
  const getVentureRegistration = deps.getVentureRegistration || defaultGetVentureRegistration;
  const generateJourneyScenarios = deps.generateJourneyScenarios || defaultGenerateJourneyScenarios;
  const startSession = deps.startSession || resultRecorder.startSession;
  const recordResult = deps.recordResult || resultRecorder.recordResult;
  const completeSession = deps.completeSession || resultRecorder.completeSession;
  const getSupabase = deps.getSupabase || (() => createSupabaseServiceClient('engineer', { verbose: false }));

  if (!Array.isArray(journeySteps) || journeySteps.length === 0) {
    const result = { status: 'skipped', reason: 'no_journey_steps', preflightResults: [], testRunId: null, passRate: null, brokenAtStep: null, ranAt: new Date().toISOString() };
    await stampJourneyWalkResult(getSupabase, sdId, result);
    return result;
  }

  const acquisition = await acquireLiveInstance(baseUrl);
  if (!acquisition.ok) {
    const result = { status: 'blocked', reason: `instance_unreachable: ${acquisition.reason}`, preflightResults: [], testRunId: null, passRate: null, brokenAtStep: null, ranAt: new Date().toISOString() };
    await stampJourneyWalkResult(getSupabase, sdId, result);
    return result;
  }

  const { page, teardown } = acquisition;
  try {
    const { preflightChecks } = getVentureRegistration(ventureKey);
    const preflightResults = [];
    for (const check of preflightChecks) {
      try {
        const outcome = await check.run(page, { baseUrl });
        preflightResults.push({ name: check.name, success: true, ...outcome });
      } catch (err) {
        preflightResults.push({ name: check.name, success: false, failureReason: err instanceof Error ? err.message : String(err) });
      }
    }

    const scenarios = generateJourneyScenarios(journeySteps);
    const scenarioByStepId = new Map(scenarios.map((s) => [s.id, s]));

    const testRun = await startSession(sdId, {
      triggeredBy: 'JOURNEY_WALK',
      scenarioSnapshot: scenarios,
      ventureId,
      stageNumber,
    });

    const stepExecutors = Object.fromEntries(
      journeySteps.map((step) => [step.step_id, buildStepExecutor(step, ventureKey)])
    );

    const walkResult = await runJourneyWalk(page, persona, journeySteps.map((s) => s.step_id), stepExecutors, { baseUrl });

    for (const outcome of walkResult.outcomes) {
      // Defensive fallback only: journeySteps and scenarios are 1:1 by step_id from the
      // same input, so a miss here would mean upstream step_id duplication, not this
      // module's own logic — record something rather than crash mid-walk over it.
      const scenario = scenarioByStepId.get(outcome.step) || { id: outcome.step, title: outcome.step, source: 'journey_step', sourceId: outcome.step };
      await recordResult(testRun.id, scenario, outcome.success ? 'PASS' : 'FAIL', {
        errorMessage: outcome.failureReason || undefined,
        failureType: outcome.success ? null : 'functional',
      });
    }

    const completed = await completeSession(testRun.id);

    const result = {
      status: walkResult.completedAllSteps ? 'pass' : 'fail',
      testRunId: testRun.id,
      passRate: completed.passRate,
      brokenAtStep: walkResult.brokenAtStep,
      preflightResults,
      ranAt: new Date().toISOString(),
    };
    await stampJourneyWalkResult(getSupabase, sdId, result);
    return result;
  } finally {
    await teardown();
  }
}

/**
 * Best-effort, read-merge-write stamp of metadata.journey_walk_result — matches the
 * existing ...sd.metadata merge convention (lib/eva/lifecycle-sd-bridge.js) so this never
 * clobbers unrelated metadata keys another writer set. A stamp failure must not mask the
 * walk result already computed and returned to the caller — never throws.
 */
async function stampJourneyWalkResult(getSupabase, sdId, journeyWalkResult) {
  try {
    const db = await getSupabase();
    const { data: sd, error: fetchError } = await db
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdId)
      .single();
    if (fetchError || !sd) return;

    await db
      .from('strategic_directives_v2')
      .update({ metadata: { ...sd.metadata, journey_walk_result: journeyWalkResult } })
      .eq('id', sdId);
  } catch {
    // best-effort — see doc comment above
  }
}

export default { runVentureJourneyWalk };
