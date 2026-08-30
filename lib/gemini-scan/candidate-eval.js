/**
 * Candidate-model smoke evaluation (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 *
 * DELIBERATELY DOES NOT reuse scripts/eval/gemini-smoke-eval.mjs's runPipeline: that
 * pipeline resolves every fixture's model via getGoogleModel(purpose) -- it can only
 * ever exercise a model already wired into a model-config.js purpose key. A scan
 * candidate is by definition NOT wired to any purpose key yet (the vision doc's
 * "Always" rule: never ship a model change and a call-site wiring change in the same
 * step), so this runs a small set of purpose-neutral smoke prompts directly against
 * the candidate's model id via an injected executor -- same executor shape as
 * runPipeline, just without the purpose->model resolution step.
 */

export const CANDIDATE_FIXTURE_COUNT = 3;

function buildCandidateFixtures(modelId) {
  const fixtures = [];
  for (let n = 1; n <= CANDIDATE_FIXTURE_COUNT; n++) {
    fixtures.push({
      task_id: `GEMINI-SCAN-CANDIDATE-${modelId}-${n}`,
      modelId,
      prompt: `Smoke check ${n}/${CANDIDATE_FIXTURE_COUNT} for candidate model '${modelId}' -- respond with a short, non-empty acknowledgement.`,
    });
  }
  return fixtures;
}

/**
 * Run a candidate model through the purpose-neutral smoke fixtures.
 * @param {string} modelId
 * @param {(fixture: object) => Promise<{ok: boolean, costUsd: number, latencyMs: number}>} executor injected -- no real network in tests/--dry-run
 * @returns {Promise<{modelId: string, ok: boolean, costUsd: number, latencyMs: number, results: Array}>}
 */
export async function evaluateCandidate(modelId, executor) {
  const fixtures = buildCandidateFixtures(modelId);
  const results = [];
  let costUsd = 0;
  let latencyMs = 0;
  for (const fixture of fixtures) {
    const result = await executor(fixture);
    results.push(result);
    costUsd += result.costUsd || 0;
    latencyMs += result.latencyMs || 0;
  }
  const ok = results.every((r) => r.ok !== false);
  return { modelId, ok, costUsd, latencyMs: Math.round(latencyMs / fixtures.length), results };
}
