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

import { execSync } from 'node:child_process';
import { acquireLiveInstance as defaultAcquireLiveInstance } from './live-instance-acquisition.mjs';
import { runJourneyWalk as defaultRunJourneyWalk } from './browser-executor.js';
import { buildStepExecutor as defaultBuildStepExecutor, getVentureRegistration as defaultGetVentureRegistration } from './venture-step-executors.js';
import { generateJourneyScenarios as defaultGenerateJourneyScenarios } from '../uat/scenario-generator.js';
import * as resultRecorder from '../uat/result-recorder.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { computeDedupHash } from '../eva/corrective-finding-recorder.js';
import { assembleCapturedCause as defaultAssembleCapturedCause } from './venture-cause-capture.js';

/**
 * SD-LEO-FIX-STAGE-WALK-PASSES-001 FR-4: the executing worktree's HEAD commit, so a
 * uat_test_runs row can be tied back to the exact code that produced it (ratification 6c263823
 * gate-evidence provenance). Never throws -- a walk must never fail over an evidence-quality
 * concern; returns null when git is unavailable rather than fabricating a value.
 * @returns {string|null}
 */
function resolveCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

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
 *   recordResult, completeSession, getSupabase, resolveCommitSha) — for tests only, defaults
 *   to real modules.
 *   deps.controlPackEvidence overrides the auto-derived per-step manifest/executedJourneys
 *   passed to completeSession() (see the call site below) — a caller with access to real
 *   nonce-binding/canary/fence evidence supplies it here rather than this module fabricating it.
 *   deps.resolveCommitSha (FR-4) overrides how the run's commit_sha is resolved; defaults to
 *   `git rev-parse HEAD` in the executing worktree.
 *   SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1: deps.captureCloudflareLogs,
 *   deps.queryVentureD1 and deps.queryVentureErrors thread straight through to
 *   assembleCapturedCause's own `deps` (lib/apa/venture-cause-capture.js) -- for tests only,
 *   defaults to the real Cloudflare/D1/Supabase implementations. deps.assembleCapturedCause
 *   overrides the whole assembly function itself (rarely needed; the three narrower seams
 *   above cover per-leg fixturing).
 * @param {string} [params.workerName] - Cloudflare Worker script name for FR-1's
 *   captured_cause capture (lib/apa/venture-cause-capture.js). Defaults to ventureKey
 *   lowercased (matches the wrangler.toml `name` convention verified for AltifyAI).
 * @param {string} [params.databaseName] - Cloudflare D1 database name for FR-1's D1 leg.
 *   Defaults to the same value as workerName (verified identical in AltifyAI's wrangler.toml).
 * @returns {Promise<Object>} walk summary — also stamped onto the SD's metadata
 */
export async function runVentureJourneyWalk({ sdId, ventureId = null, stageNumber = null, ventureKey, baseUrl, journeySteps, persona = {}, workerName = null, databaseName = null, deps = {} }) {
  const acquireLiveInstance = deps.acquireLiveInstance || defaultAcquireLiveInstance;
  const runJourneyWalk = deps.runJourneyWalk || defaultRunJourneyWalk;
  const buildStepExecutor = deps.buildStepExecutor || defaultBuildStepExecutor;
  const getVentureRegistration = deps.getVentureRegistration || defaultGetVentureRegistration;
  const generateJourneyScenarios = deps.generateJourneyScenarios || defaultGenerateJourneyScenarios;
  const startSession = deps.startSession || resultRecorder.startSession;
  const recordResult = deps.recordResult || resultRecorder.recordResult;
  const completeSession = deps.completeSession || resultRecorder.completeSession;
  const getSupabase = deps.getSupabase || (() => createSupabaseServiceClient('engineer', { verbose: false }));
  // SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1: TR-1's named injectable seams
  // (deps.captureCloudflareLogs / deps.queryVentureD1 / deps.queryVentureErrors) thread
  // straight through to assembleCapturedCause's own deps parameter -- this module never
  // wraps or re-implements the capture logic, only supplies the venture-scoped identifiers
  // (ventureId/workerName/databaseName/window) assembleCapturedCause doesn't know on its own.
  const assembleCapturedCause = deps.assembleCapturedCause || defaultAssembleCapturedCause;
  const resolvedWorkerName = workerName || (ventureKey ? String(ventureKey).toLowerCase() : null);
  const resolvedDatabaseName = databaseName || resolvedWorkerName;

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
  let testRun;
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

    // FR-4: real, verifiable provenance -- the worktree HEAD that produced this run.
    // deps.resolveCommitSha lets a caller (or a test) override how it's resolved; defaults
    // to reading the executing worktree's own git HEAD. Captured once and reused below for
    // evidence_hash (QF-20260902-206) so both fields describe the same commit.
    const commitSha = (deps.resolveCommitSha || resolveCommitSha)();

    testRun = await startSession(sdId, {
      triggeredBy: 'JOURNEY_WALK',
      scenarioSnapshot: scenarios,
      ventureId,
      stageNumber,
      commitSha,
    });

    const stepExecutors = Object.fromEntries(
      journeySteps.map((step) => [step.step_id, buildStepExecutor(step, ventureKey)])
    );

    const walkResult = await runJourneyWalk(page, persona, journeySteps.map((s) => s.step_id), stepExecutors, { baseUrl });

    // SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1: a per-step wall-clock window
    // for the capture calls below. runJourneyWalk gives only relative durationMs per step
    // (browser-executor.js has no absolute per-step timestamp), so the window is derived by
    // accumulating durations from the walk's own start time, padded +/-5s for clock skew
    // between this process and Cloudflare's log ingestion.
    const walkStartedAtMs = Date.now() - walkResult.outcomes.reduce((sum, o) => sum + (o.durationMs || 0), 0);
    const WINDOW_PADDING_MS = 5000;
    let cumulativeMs = 0;
    let lastFailureCapturedCause = null;
    // Isolated from the walk's own control flow: a getSupabase() failure here must degrade
    // the venture_errors capture leg to absent (queryVentureErrors' own !supabase guard),
    // never abort the walk itself — mirrors stampJourneyWalkResult's own best-effort contract.
    let supabaseClient = null;
    try {
      supabaseClient = await getSupabase();
    } catch {
      supabaseClient = null;
    }

    for (const outcome of walkResult.outcomes) {
      // Defensive fallback only: journeySteps and scenarios are 1:1 by step_id from the
      // same input, so a miss here would mean upstream step_id duplication, not this
      // module's own logic — record something rather than crash mid-walk over it.
      const scenario = scenarioByStepId.get(outcome.step) || { id: outcome.step, title: outcome.step, source: 'journey_step', sourceId: outcome.step };

      const stepDuration = outcome.durationMs || 0;
      const stepStartedAt = walkStartedAtMs + cumulativeMs;
      const stepEndedAt = stepStartedAt + stepDuration;
      cumulativeMs += stepDuration;

      // FR-1: attaches captured_cause to every FAILED step only — a passing step needs no
      // diagnosis. Never lets a capture failure abort the walk: assembleCapturedCause itself
      // never throws, but this call is additionally isolated so a bug in the capture path
      // can never mask the real walk result being recorded.
      let capturedCause = null;
      if (!outcome.success) {
        try {
          capturedCause = await assembleCapturedCause({
            ventureId,
            workerName: resolvedWorkerName,
            databaseName: resolvedDatabaseName,
            window: {
              from: new Date(stepStartedAt - WINDOW_PADDING_MS).toISOString(),
              to: new Date(stepEndedAt + WINDOW_PADDING_MS).toISOString(),
            },
            supabase: supabaseClient,
            deps: {
              captureCloudflareLogs: deps.captureCloudflareLogs,
              queryVentureD1: deps.queryVentureD1,
              queryVentureErrors: deps.queryVentureErrors,
            },
          });
          lastFailureCapturedCause = capturedCause;
        } catch {
          capturedCause = null;
        }
      }

      await recordResult(testRun.id, scenario, outcome.success ? 'PASS' : 'FAIL', {
        errorMessage: outcome.failureReason || undefined,
        failureType: outcome.success ? null : 'functional',
        // QF-20260906-826: real elapsed time for this step, measured by runJourneyWalk.
        durationMs: outcome.durationMs,
        // QF-20260902-512: Solomon ruling 59a5315d item 2 -- metadata.auth_mode etc on the
        // run row, absent (not fabricated) when a step never reached an auth challenge.
        authForensics: outcome.authForensics || undefined,
        // QF-20260906-282: never-fabricated, absent-unless-observed provider response class
        // (status/elapsedMs/errorBodyPrefix) for the backend call this step's override made.
        providerResponseClass: outcome.providerResponseClass || undefined,
        // QF-20260902-884, Solomon 7c78be9f condition (a): distinguishes a run where the
        // stp-4de9 mapped override actually fired from a default/unmapped run -- absent
        // (not fabricated false) for every other step, which never sets this ctxUpdates key.
        stepOverrideUsed: outcome.ctxUpdates?.stepOverrideUsed || undefined,
        // SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1: absent-unless-observed,
        // present only for the (at most one, since runJourneyWalk stops at first failure)
        // failing step.
        capturedCause: capturedCause || undefined,
      });
    }

    // QF-20260830-041-followup / coordinator directive ac40a109: completeSession's own gate
    // (lib/eva/uat-robustness-gate.js) requires metadata.control_pack_evaluated=true, which the
    // recorder only sets when a truthy controlPackEvidence is passed -- omitting it (this
    // call's prior shape) let a run read quality_gate=GREEN from pass_rate math alone while
    // proving the Solomon-C control pack never ran. Threads the ONE control this module can
    // honestly evaluate from data the walk itself already produced: each journey step that ran
    // is one real assertion (its pass/fail evaluation) — minimumAssertions/executedAssertions=1
    // per step, no invented counts. checkMinimumAssertionManifest treats a step present in
    // journeySteps but ABSENT from executedJourneys (e.g. the walk broke early) as a genuine
    // failure, not a silent pass. The other three controls (live-deployment nonce binding,
    // canary mutation control, venture-CI fence assertion) are DELIBERATELY NOT fabricated here
    // — each requires venture-specific infrastructure (a live nonce-write endpoint + token
    // provisioning, a seeded canary journey, a CI-side exclusion-predicate assertion) this
    // orchestrator has no access to; a caller wanting those must supply them via
    // deps.controlPackEvidence, not have this module invent them.
    // QF-20260902-206: evidence_hash over REAL artifacts the walker already holds -- each
    // step's own outcome plus the walk's own outcome JSON -- never a fabricated placeholder.
    // computeDedupHash is the same sha256 primitive computeSubstantiveEvidenceHash's other
    // callers already use (lib/eva/corrective-finding-recorder.js).
    const artifactHashes = [
      ...walkResult.outcomes.map((o) => computeDedupHash(null, [JSON.stringify(o)], null)),
      computeDedupHash(null, [JSON.stringify(walkResult)], null),
    ].sort();

    const controlPackEvidence = deps.controlPackEvidence || {
      manifest: journeySteps.map((s) => ({ journeyId: s.step_id, minimumAssertions: 1 })),
      executedJourneys: walkResult.outcomes.map((o) => ({ journeyId: o.step, executedAssertions: 1 })),
      evidenceManifest: { integrity: { artifact_hashes: artifactHashes }, test_run: testRun.id },
      deploymentSha: commitSha,
    };
    const completed = await completeSession(testRun.id, controlPackEvidence);

    const result = {
      status: walkResult.completedAllSteps ? 'pass' : 'fail',
      testRunId: testRun.id,
      passRate: completed.passRate,
      brokenAtStep: walkResult.brokenAtStep,
      preflightResults,
      ranAt: new Date().toISOString(),
      // SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1/FR-5: the SD-level rollup
      // plan-to-lead prerequisite-check.js and db-sourced-findings.js can read without
      // querying uat_test_results directly -- populated only on a genuine failure with a
      // capture that actually ran (never fabricated for a pass or a blocked/error walk).
      ...(walkResult.brokenAtStep && lastFailureCapturedCause ? { captured_cause: lastFailureCapturedCause } : {}),
    };
    await stampJourneyWalkResult(getSupabase, sdId, result);
    return result;
  } catch (err) {
    // SD-LEO-INFRA-FIX-JOURNEY-WALK-001 FR-1: a throw ANYWHERE in the try block above (not
    // just an outcome the walk itself reports) must still be recorded as data, matching the
    // module's own contract (header comment above) and the existing !acquisition.ok /
    // no_journey_steps stamped-result paths -- RETURN the result, never rethrow, so the one
    // production caller (lib/eva/quality-findings/db-sourced-findings.js) sees a real
    // status='error' result instead of relying on its own now-obsolete try/catch.
    // SECURITY (EXEC) S-1/S-2: collapse whitespace/control chars and cap length before this
    // reaches SD metadata jsonb and a downstream finding-detail string -- an unbounded,
    // unsanitized exception message could visually forge extra log lines or bloat the row.
    const rawReason = err instanceof Error ? err.message : String(err);
    const reason = rawReason.replace(/\s+/g, ' ').trim().slice(0, 500);
    const result = { status: 'error', reason, testRunId: testRun ? testRun.id : null, passRate: null, brokenAtStep: null, preflightResults: [], ranAt: new Date().toISOString() };
    // testRun may be undefined if the throw happened before startSession() assigned it
    // (e.g. getVentureRegistration/generateJourneyScenarios) -- only mark a run row failed
    // when one genuinely exists, and isolate that DB write so ITS failure can never mask
    // the original exception being reported here.
    if (testRun) {
      try {
        const db = await getSupabase();
        await db.from('uat_test_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', testRun.id);
      } catch {
        // best-effort mark-failed -- see doc comment above
      }
    }
    await stampJourneyWalkResult(getSupabase, sdId, result);
    return result;
  } finally {
    await teardown();
  }
}

/** QF-20260901-063: standard UUID v4/v-anything shape, used to pick the lookup column below. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best-effort, read-merge-write stamp of metadata.journey_walk_result — matches the
 * existing ...sd.metadata merge convention (lib/eva/lifecycle-sd-bridge.js) so this never
 * clobbers unrelated metadata keys another writer set. A stamp failure must not mask the
 * walk result already computed and returned to the caller — never throws.
 *
 * QF-20260901-063: `sdId` arrives in two forms depending on the caller — the raw UUID
 * `id` (lib/eva/quality-findings/db-sourced-findings.js passes `orchestrator.id`) or the
 * human-readable `sd_key` string (scripts/eva/run-venture-journey-walk.mjs passes the
 * SD-KEY). Both are live callers, so the lookup column is picked by shape rather than
 * assumed — a fixed `.eq('id', sdId)` silently no-ops (0 rows) for every sd_key caller.
 */
async function stampJourneyWalkResult(getSupabase, sdId, journeyWalkResult, mergeMetadataKeysFn = null) {
  try {
    const db = await getSupabase();
    const column = UUID_RE.test(String(sdId)) ? 'id' : 'sd_key';
    const { data: sd, error: fetchError } = await db
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq(column, sdId)
      .single();
    if (fetchError || !sd) return;

    // SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001: a full-blob .update({ metadata: {...} })
    // here silently clobbers any key a concurrent writer set between this read and this write.
    // mergeMetadataKeys() writes ONLY journey_walk_result via an atomic JSONB `||` merge.
    const mergeFn = mergeMetadataKeysFn || (await import('../coordinator/safe-metadata-merge.mjs')).mergeMetadataKeys;
    await mergeFn(sd.sd_key, { journey_walk_result: journeyWalkResult });
  } catch {
    // best-effort — see doc comment above
  }
}

export default { runVentureJourneyWalk };
