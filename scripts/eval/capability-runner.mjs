#!/usr/bin/env node
/**
 * capability-runner.mjs — golden-task run pipeline for the capability eval
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-3).
 *
 * Live grading runs are OUT OF SCOPE until Opus-5 GA (spec Part 4: first full
 * run = Opus 5 vs the sealed Fable-5 baselines). What ships now is the
 * pipeline + the offline --dry-run self-test that keeps it from bit-rotting:
 * loader -> runner -> scorer -> reference-row shape, ZERO network/model calls.
 *
 * Usage:
 *   node scripts/eval/capability-runner.mjs --dry-run          (offline self-test)
 *   node scripts/eval/capability-runner.mjs --model <id> --effort <tier>   (future: live run scaffold)
 */
import path from 'path';
import { toReferenceRow, costNorm } from '../../lib/eval/capability-scorer.mjs';

/** Fabricated, non-secret fixture stubs — NEVER sealed task text or keys. */
export const DRY_RUN_FIXTURES = [
  { task_id: 'FIX-R2-01', shape: 'R2-negative-space', content_hash: 'fixhash-1', source_ref: 'fixture:1' },
  { task_id: 'FIX-R5-01', shape: 'R5-reversal', content_hash: 'fixhash-2', source_ref: 'fixture:2' },
  { task_id: 'FIX-MECH-01', shape: 'mechanical-baseline', content_hash: 'fixhash-3', source_ref: 'fixture:3' },
];

/**
 * Pure pipeline: given task stubs, a model executor, and grading inputs,
 * produce reference-row shaped records. The executor is INJECTED so tests and
 * --dry-run prove zero network calls structurally (a stub, not a mock of fetch).
 */
export async function runPipeline(tasks, executor, { modelId, effort, runAt }) {
  const rows = [];
  for (const t of tasks) {
    const result = await executor(t); // { answer, tokens, wall_clock_ms }
    rows.push(toReferenceRow({
      task_id: t.task_id,
      shape: t.shape,
      model_id: modelId,
      effort,
      tokens: result.tokens ?? null,
      wall_clock_ms: result.wall_clock_ms ?? null,
      run_at: runAt,
      content_hash: t.content_hash,
      source_ref: t.source_ref,
    }));
  }
  return rows;
}

/** Row-shape validation used by the self-test (and future insert path). */
export function validateReferenceRow(row) {
  const problems = [];
  if (!row.problem_shape) problems.push('problem_shape missing');
  if (!row.model_id || !row.effort || !row.task_id) problems.push('identity fields missing');
  if (!row.content_hash || !row.source_ref) problems.push('provenance missing');
  if (row.trusted_for_routing !== false) problems.push('trusted_for_routing must be false at write time (only the GT gate flips it)');
  if (row.quality_score != null && row.cost_norm == null) problems.push('graded row missing cost_norm');
  return problems;
}

export async function dryRun() {
  let executorCalls = 0;
  const offlineExecutor = async () => {
    executorCalls++;
    return { answer: '(fixture answer)', tokens: 1000, wall_clock_ms: 1 };
  };
  const rows = await runPipeline(DRY_RUN_FIXTURES, offlineExecutor, {
    modelId: 'dry-run-model', effort: 'low', runAt: new Date().toISOString(),
  });
  const problems = rows.flatMap(validateReferenceRow);
  const ok = problems.length === 0 && executorCalls === DRY_RUN_FIXTURES.length
    && costNorm(1, 1000) === 1;
  return { ok, rows: rows.length, executorCalls, problems };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    const r = await dryRun();
    console.log(`capability-runner --dry-run: ${r.ok ? 'PASS' : 'FAIL'} (rows=${r.rows}, executorCalls=${r.executorCalls}${r.problems.length ? ', problems=' + r.problems.join('; ') : ''})`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  console.log('Live grading runs are gated on Opus-5 GA (spec Part 4). Use --dry-run for the offline self-test.');
  process.exitCode = 2; return;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
