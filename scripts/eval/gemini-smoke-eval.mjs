#!/usr/bin/env node
/**
 * gemini-smoke-eval.mjs — code-scored smoke-eval runner for the production
 * Gemini config path (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-H).
 *
 * Mirrors scripts/eval/capability-runner.mjs's own shape exactly: a pure
 * runPipeline() with an INJECTED executor (so --dry-run proves zero network
 * calls structurally, not via fetch-mocking), plus an offline dryRun()
 * self-test. Live grading beyond one baseline-logging pass is explicitly
 * OUT OF SCOPE here (no cost-governor exists yet -- sibling G) and mirrors
 * capability-runner.mjs's own "ship harness + dry-run, gate live runs"
 * precedent.
 *
 * Usage:
 *   node scripts/eval/gemini-smoke-eval.mjs --dry-run     (offline self-test)
 *   node scripts/eval/gemini-smoke-eval.mjs --baseline    (log a getGoogleModel snapshot -- pure config resolution, zero API calls/cost)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getGoogleModel, MODEL_DEFAULTS } from '../../lib/config/model-config.js';
import {
  buildFixtures,
  GOOGLE_PURPOSES,
  TIMEOUT_FIXTURE_RUNS,
  evaluateTimeoutFixture,
} from '../../lib/eval/gemini-smoke-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pure pipeline: given fixtures and an INJECTED executor, resolve each
 * fixture's model via the real production config path (getGoogleModel),
 * then run it through the executor. The timeout fixture is run
 * TIMEOUT_FIXTURE_RUNS times and aggregated via evaluateTimeoutFixture.
 */
export async function runPipeline(fixtures, executor) {
  const results = [];
  for (const fixture of fixtures) {
    const modelId = getGoogleModel(fixture.purpose);
    if (fixture.timeoutFixture) {
      const runResults = [];
      for (let i = 0; i < TIMEOUT_FIXTURE_RUNS; i++) {
        runResults.push(await executor(fixture, modelId));
      }
      const failed = evaluateTimeoutFixture(runResults);
      results.push({ task_id: fixture.task_id, purpose: fixture.purpose, modelId, synthetic: true, ok: !failed, runResults });
      continue;
    }
    const result = await executor(fixture, modelId);
    const ok = result.timedOut !== true && result.ok !== false;
    results.push({ task_id: fixture.task_id, purpose: fixture.purpose, modelId, synthetic: false, ok, result });
  }
  return results;
}

/** Log a baseline snapshot of what each Google purpose currently resolves to. Pure config resolution -- no live API calls, no cost. */
export function buildBaselineSnapshot() {
  const models = {};
  for (const purpose of GOOGLE_PURPOSES) {
    models[purpose] = getGoogleModel(purpose);
  }
  return {
    label: 'gemini-smoke-eval-baseline',
    generated_at: new Date().toISOString(),
    purposes: GOOGLE_PURPOSES,
    models,
  };
}

export function writeBaseline(snapshot, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n');
  return outPath;
}

export async function dryRun() {
  let executorCalls = 0;
  const offlineExecutor = async (fixture) => {
    executorCalls++;
    if (fixture.timeoutFixture) return { ok: true, timedOut: false };
    return { ok: true, timedOut: false, answer: '(fixture answer)' };
  };
  const fixtures = buildFixtures();
  const results = await runPipeline(fixtures, offlineExecutor);
  const expectedCalls = (fixtures.length - 1) + TIMEOUT_FIXTURE_RUNS; // 24 single-run + 3 timeout-run
  const problems = [];
  if (results.length !== fixtures.length) problems.push(`expected ${fixtures.length} results, got ${results.length}`);
  if (executorCalls !== expectedCalls) problems.push(`expected ${expectedCalls} executor calls, got ${executorCalls}`);
  for (const r of results) {
    if (!MODEL_DEFAULTS.google[r.purpose]) problems.push(`${r.task_id}: purpose '${r.purpose}' not in MODEL_DEFAULTS.google`);
    if (!r.modelId) problems.push(`${r.task_id}: modelId not resolved`);
  }
  const ok = problems.length === 0;
  return { ok, fixtures: fixtures.length, executorCalls, problems };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    const r = await dryRun();
    console.log(`gemini-smoke-eval --dry-run: ${r.ok ? 'PASS' : 'FAIL'} (fixtures=${r.fixtures}, executorCalls=${r.executorCalls}${r.problems.length ? ', problems=' + r.problems.join('; ') : ''})`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  if (args.includes('--baseline')) {
    const snapshot = buildBaselineSnapshot();
    const outPath = path.join(__dirname, '..', '..', 'docs', 'reference', 'gemini-smoke-eval-baseline.json');
    writeBaseline(snapshot, outPath);
    console.log(`gemini-smoke-eval --baseline: wrote ${outPath}`);
    console.log(JSON.stringify(snapshot, null, 2));
    process.exitCode = 0;
    return;
  }
  console.log('Live fixture runs (real API calls) are gated -- no cost-governor exists yet (sibling G). Use --dry-run for the offline self-test or --baseline to log a config-resolution snapshot (no API calls).');
  process.exitCode = 2;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
