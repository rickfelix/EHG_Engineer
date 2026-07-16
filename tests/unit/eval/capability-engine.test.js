import { describe, it, expect } from 'vitest';
import * as readout from '../../../scripts/effort-experiment/readout.mjs';
import {
  MIN_N, DELTA_PP, evaluateRule, costNorm, pairwise, toReferenceRow,
} from '../../../lib/eval/capability-scorer.mjs';
import { runPipeline, validateReferenceRow, dryRun, DRY_RUN_FIXTURES } from '../../../scripts/eval/capability-runner.mjs';
import { sealedRunToRow, isMissingTableError } from '../../../scripts/eval/migrate-sealed-baselines.mjs';
import { evaluateGroundTruth } from '../../../scripts/eval/ground-truth-gate.mjs';

describe('TS-2 scorer extends the effort-experiment seam (no re-derivation)', () => {
  it('rule constants/functions are the readout.mjs objects themselves', () => {
    expect(MIN_N).toBe(readout.MIN_N);
    expect(DELTA_PP).toBe(readout.DELTA_PP);
    expect(Object.is(evaluateRule, readout.evaluateRule)).toBe(true);
  });
  it('costNorm = quality per kilotoken', () => {
    expect(costNorm(1, 1000)).toBe(1);
    expect(costNorm(0.5, 2000)).toBe(0.25);
    expect(costNorm(1, 0)).toBe(1000); // guarded divisor
    expect(costNorm(null, 100)).toBeNull();
  });
  it('pairwise prefers higher cost-normalized quality on the same task', () => {
    const a = { task_id: 'T', model_id: 'm1', effort: 'high', quality_score: 0.9, tokens: 9000 };
    const b = { task_id: 'T', model_id: 'm2', effort: 'low', quality_score: 0.8, tokens: 2000 };
    expect(pairwise(a, b).preferred).toBe('m2:low'); // 0.1 vs 0.4 per kilotoken
    expect(() => pairwise(a, { ...b, task_id: 'OTHER' })).toThrow();
  });
});

describe('TS-4 runner dry-run pipeline (offline, injected executor)', () => {
  it('produces valid, untrusted reference rows with zero external calls', async () => {
    const r = await dryRun();
    expect(r.ok).toBe(true);
    expect(r.executorCalls).toBe(DRY_RUN_FIXTURES.length);
  });
  it('validateReferenceRow rejects trusted-at-write rows', async () => {
    const rows = await runPipeline(DRY_RUN_FIXTURES, async () => ({ tokens: 1 }), { modelId: 'm', effort: 'low', runAt: null });
    expect(rows.flatMap(validateReferenceRow)).toEqual([]);
    expect(validateReferenceRow({ ...rows[0], trusted_for_routing: true }).join()).toMatch(/GT gate/);
  });
});

describe('TS-5 sealed-baseline migrator (pure parts)', () => {
  it('maps sealed_run rows results-only; ignores answer_key rows', () => {
    const run = sealedRunToRow({ id: 'f1', metadata: { record_kind: 'sealed_run', task_id: 'T1', shape: 'R2-negative-space', model_id: 'claude-fable-5', effort: 'high', tokens: 5, wall_clock_ms: 9, run_at: 'x', content_hash: 'h', task_text: 'SECRET-TEXT', fable5_answer: 'SECRET-ANSWER' } });
    expect(run.trusted_for_routing).toBe(false);
    expect(run.clears_bar).toBeNull();
    expect(JSON.stringify(run)).not.toContain('SECRET');
    expect(sealedRunToRow({ id: 'f2', metadata: { record_kind: 'answer_key', task_id: 'T1' } })).toBeNull();
  });
  it('detects missing-table (ceremony pending) errors', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe('TS-3 ground-truth gate is fail-closed', () => {
  const graded = (over = {}) => ({ id: 'x', task_id: 'T1', model_id: 'm1', effort: 'high', clears_bar: true, graded_at: 'now', ...over });
  it('no rows / ungraded rows -> blocked', () => {
    expect(evaluateGroundTruth([]).pass).toBe(false);
    expect(evaluateGroundTruth([graded({ graded_at: null })]).pass).toBe(false);
  });
  it('positives-only grading is a rubber stamp -> blocked', () => {
    expect(evaluateGroundTruth([graded(), graded({ model_id: 'm2', effort: 'low' })]).pass).toBe(false);
  });
  it('adversarial reproduction (pass + fail, same task, different arm) -> pass', () => {
    const v = evaluateGroundTruth([graded(), graded({ model_id: 'm2', effort: 'low', clears_bar: false })]);
    expect(v.pass).toBe(true);
    expect(v.reason).toMatch(/T1/);
  });
  it('pass+fail from the SAME arm does not count', () => {
    const v = evaluateGroundTruth([graded(), graded({ clears_bar: false })]);
    expect(v.pass).toBe(false);
  });
});
