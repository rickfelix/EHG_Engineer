/**
 * ground-truth-gate.test.js — FR-3 binding gate + regression
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-C, child C).
 *
 * Stubbed supabase/loader/grader — NO live model calls (gradeFn injected). Proves the
 * anti-tautology rule (GROUND_TRUTH_ABSENT steady state), the sole-writer flip, fail-closed
 * behavior on every uncertainty, trigger-scoped regression, and the contamination guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertReproducesKnownResult,
  runRegression,
  bindTrustedForRouting,
  clearStaleBinds,
  evaluateBinding,
  readAdjudicatedVerdicts,
  GROUND_TRUTH_ABSENT,
  TABLE,
} from '../ground-truth-gate.mjs';
import { SEAL_EVENT_TYPE, MIRROR_SUITE } from '../golden-task-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_SRC_PATH = join(__dirname, '..', 'ground-truth-gate.mjs');

/**
 * A distinctive answer-key sentinel assembled AT RUNTIME so the full literal never appears
 * verbatim in any tracked file — the repo-scan guard can grep the whole tree and find zero.
 */
const KEY_TOKEN = ['ANSWERKEY', 'SENTINEL', 'DONOTCOMMIT'].join('-');
const sentinelFor = (taskId) => `${KEY_TOKEN}::${taskId}::7f3a9c1e`;

/**
 * Chainable supabase stub. Tracks .update() writes and mutates the backing table rows so
 * trusted_for_routing changes are observable. `errors[table]` injects a query error.
 */
function makeStub({ tables = {}, errors = {} } = {}) {
  const writes = [];
  function builderFor(table) {
    const filters = [];
    let limit = null;
    let op = 'select';
    let payload = null;
    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push([col, val, 'eq']); return builder; },
      in(col, vals) { filters.push([col, vals, 'in']); return builder; },
      limit(n) { limit = n; return builder; },
      update(p) { op = 'update'; payload = p; return builder; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (errors[table]) return { data: null, error: errors[table] };
          let rows = (tables[table] || []).slice();
          for (const [col, val, kind] of filters) {
            rows = kind === 'in'
              ? rows.filter((r) => val.includes(r[col]))
              : rows.filter((r) => r[col] === val);
          }
          if (op === 'update') {
            for (const r of rows) Object.assign(r, payload);
            writes.push({ table, payload, matched: rows.length });
            return { data: rows.map((r) => ({ id: r.id })), error: null };
          }
          if (limit != null) rows = rows.slice(0, limit);
          return { data: rows, error: null };
        }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from: builderFor, _writes: writes };
}

/** One sealed golden set with a single sealed_run (loader stub shape). */
function loaderStub(sets) {
  return async () => ({ sets, integrityErrors: [], source: 'stub' });
}
const ONE_SET = [{
  task_id: 'T1',
  shape: 'R1-compounding',
  task_text: 'PROMPT for T1',
  sealed_runs: [{ effort: 'high', model_id: 'm', tokens: 100, wall_clock: 5, run_at: '2026-07-16T00:00:00Z', output: 'run output T1/high' }],
}];
const keyAccessorStub = async () => 'db-side-key';

describe('ground-truth-gate (FR-3)', () => {
  it('TS-1: adjudicated verdict present AND matching → bound=true + sole-writer flip applied', async () => {
    const verdictAccessor = async () => [{ task_id: 'T1', model_id: 'm', effort: 'high', expected_clears_bar: true }];
    // High-margin grade (0.95, well clear of 0.70±0.10) → single cheap pass, no deep re-grade.
    let gradeCalls = 0;
    const gradeFn = async () => { gradeCalls += 1; return { clears_bar: true, quality_score: 0.95, grader: 'stub', graded_at: '2026-07-16T01:00:00Z' }; };

    const verdict = await assertReproducesKnownResult({}, { gradeFn, loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub, verdictAccessor });
    expect(verdict.bound).toBe(true);
    expect(verdict.reason).toBe('REPRODUCED');
    expect(verdict.reproduced_task_ids).toEqual(['T1']);
    expect(gradeCalls).toBe(1); // grader IS spent when there is an oracle to reproduce

    // Sole-writer flip on a live table.
    const tables = { [TABLE]: [{ id: 'r1', task_id: 'T1', model_id: 'm', effort: 'high', trusted_for_routing: false, bound_at: null, binding_id: null }] };
    const stub = makeStub({ tables });
    const flip = await bindTrustedForRouting(stub, { reproduced_task_ids: verdict.reproduced_task_ids });
    expect(flip.status).toBe('BOUND');
    expect(flip.flipped).toBe(1);
    expect(tables[TABLE][0].trusted_for_routing).toBe(true);
    expect(tables[TABLE][0].bound_at).toBeTruthy();
    expect(tables[TABLE][0].binding_id).toBeTruthy();
  });

  it("TS-2: today's ungraded corpus → bound=false / GROUND_TRUTH_ABSENT, grader NOT called, nothing flipped", async () => {
    // Sealed rows carry the "NOT GRADED — sealing only" sentinel and NO expected verdict.
    const sealed = [
      { event_type: SEAL_EVENT_TYPE, payload: { record_kind: 'answer_key', task_id: 'T1', task_text: 'PROMPT for T1', answer_key: sentinelFor('T1'), grading: 'NOT GRADED — sealing only; grading belongs to the eval harness', suite: MIRROR_SUITE } },
      { event_type: SEAL_EVENT_TYPE, payload: { record_kind: 'sealed_run', task_id: 'T1', model_id: 'm', effort: 'high', task_text: 'PROMPT for T1', fable5_answer: 'run output', grading: 'NOT GRADED — sealing only; grading belongs to the eval harness', suite: MIRROR_SUITE } },
    ];
    const stub = makeStub({ tables: { system_events: sealed } });

    let gradeCalls = 0;
    const gradeFn = async () => { gradeCalls += 1; return { clears_bar: true, quality_score: 0.95, grader: 'stub', graded_at: 'x' }; };

    const verdict = await assertReproducesKnownResult(stub, { gradeFn, loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub });
    expect(verdict.bound).toBe(false);
    expect(verdict.reason).toBe(GROUND_TRUTH_ABSENT);
    expect(verdict.reproduced_task_ids).toEqual([]);
    // Anti-tautology: with no oracle to reproduce, the grader is never invoked.
    expect(gradeCalls).toBe(0);

    // The default accessor over today's corpus returns zero adjudicated verdicts.
    expect(await readAdjudicatedVerdicts(stub)).toEqual([]);
  });

  it('TS-3: grader mismatch / grader throws / ambiguous grader → bound=false each (fail-closed)', async () => {
    const verdictAccessor = async () => [{ task_id: 'T1', model_id: 'm', effort: 'high', expected_clears_bar: true }];

    // (a) mismatch: adjudicated expects pass, grader says fail.
    const mismatch = await assertReproducesKnownResult({}, {
      gradeFn: async () => ({ clears_bar: false, quality_score: 0.20, grader: 'stub', graded_at: 'x' }),
      loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub, verdictAccessor,
    });
    expect(mismatch.bound).toBe(false);
    expect(mismatch.reason).toBe('REPRODUCTION_MISMATCH');

    // (b) grader throws.
    const threw = await assertReproducesKnownResult({}, {
      gradeFn: async () => { throw new Error('grader exploded'); },
      loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub, verdictAccessor,
    });
    expect(threw.bound).toBe(false);
    expect(threw.reason).toBe('GRADER_ERROR');

    // (c) ambiguous grader verdict (clears_bar null) → that unit skipped → no match.
    const ambiguous = await assertReproducesKnownResult({}, {
      gradeFn: async () => ({ clears_bar: null, quality_score: 0.71, grader: 'stub', graded_at: 'x' }),
      loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub, verdictAccessor,
    });
    expect(ambiguous.bound).toBe(false);
    expect(ambiguous.reason).toBe('REPRODUCTION_MISMATCH');

    // pure evaluateBinding: empty adjudicated → GROUND_TRUTH_ABSENT.
    expect(evaluateBinding([], [{ task_id: 'T1', model_id: 'm', effort: 'high', clears_bar: true }]))
      .toEqual({ bound: false, reason: GROUND_TRUTH_ABSENT, reproduced_task_ids: [] });
  });

  it('TS-4: STAGED-absent table → CEREMONY_PENDING, no flip, no throw', async () => {
    const absent = makeStub({ errors: { [TABLE]: { message: 'relation "model_capability_reference" does not exist' } } });

    const flip = await bindTrustedForRouting(absent, { reproduced_task_ids: ['T1'] });
    expect(flip.status).toBe('CEREMONY_PENDING');
    expect(flip.flipped).toBe(0);

    const cleared = await clearStaleBinds(absent);
    expect(cleared.status).toBe('CEREMONY_PENDING');

    const reg = await runRegression(absent, { trigger: 'model', gradeFn: async () => ({}) });
    expect(reg.status).toBe('CEREMONY_PENDING');

    // A supabase client that THROWS on .from() must still not throw out of the gate.
    const thrower = { from() { throw new Error('client boom'); } };
    const flip2 = await bindTrustedForRouting(thrower, { reproduced_task_ids: ['T1'] });
    expect(flip2.status).toBe('CEREMONY_PENDING');
  });

  it('TS-5: runRegression trigger=pricing recomputes cost_norm only (no re-grade) vs model=full re-grade; post-rerun bound=false clears trusted_for_routing', async () => {
    // --- pricing: cost_norm recomputed, grader NOT called, stale bind cleared ---
    const staleRow = { id: 'r1', task_id: 'T1', model_id: 'm', effort: 'high', quality_score: 0.9, tokens: 100, cost_norm: 0, trusted_for_routing: true, bound_at: 'old', binding_id: 'old' };
    const pricingStub = makeStub({ tables: { [TABLE]: [staleRow], system_events: [] } });
    let pricingGradeCalls = 0;
    const pricingRes = await runRegression(pricingStub, {
      trigger: 'pricing',
      gradeFn: async () => { pricingGradeCalls += 1; return {}; },
      verdictAccessor: async () => [], // steady-state: no oracle
    });
    expect(pricingGradeCalls).toBe(0); // NO re-grade
    expect(pricingRes.recomputed.ok).toBe(true);
    expect(pricingRes.recomputed.updated).toBe(1);
    expect(staleRow.cost_norm).toBeCloseTo((0.9 / 100) * 1000, 6); // costNorm reused
    // post-rerun bound=false → stale bind cleared
    expect(pricingRes.binding.bound).toBe(false);
    expect(pricingRes.binding.reason).toBe(GROUND_TRUTH_ABSENT);
    expect(pricingRes.flip.status).toBe('CLEARED');
    expect(staleRow.trusted_for_routing).toBe(false);
    expect(staleRow.bound_at).toBe(null);
    expect(staleRow.binding_id).toBe(null);

    // --- model: FULL re-grade (grader IS called when an oracle is present) ---
    const modelStub = makeStub({ tables: { [TABLE]: [{ id: 'r1', task_id: 'T1', model_id: 'm', effort: 'high', trusted_for_routing: false }] } });
    let modelGradeCalls = 0;
    const modelRes = await runRegression(modelStub, {
      trigger: 'model',
      gradeFn: async () => { modelGradeCalls += 1; return { clears_bar: true, quality_score: 0.95, grader: 'stub', graded_at: 'x' }; },
      loader: loaderStub(ONE_SET),
      keyAccessor: keyAccessorStub,
      verdictAccessor: async () => [{ task_id: 'T1', model_id: 'm', effort: 'high', expected_clears_bar: true }],
    });
    expect(modelGradeCalls).toBe(1); // full re-grade happened
    expect(modelRes.binding.bound).toBe(true);
    expect(modelRes.flip.status).toBe('BOUND');
  });

  it('TS-6: contamination guard — no key/task_text in gate output or fixtures, gate imports no fs / no fs write', async () => {
    // (a) gate module imports no fs and performs no filesystem write.
    const src = readFileSync(GATE_SRC_PATH, 'utf8');
    expect(src).not.toMatch(/require\(['"](node:)?fs['"]\)/);
    expect(src).not.toMatch(/from\s+['"](node:)?fs(\/promises)?['"]/);
    expect(src).not.toMatch(/writeFile|writeFileSync|appendFile|createWriteStream|mkdtemp/);

    // (b) a sealed fixture carrying a key + task_text yields adjudicated output with NEITHER.
    const sealed = [
      { event_type: SEAL_EVENT_TYPE, payload: { record_kind: 'answer_key', task_id: 'T1', task_text: 'SECRET PROMPT TEXT', answer_key: sentinelFor('T1'), grading: 'NOT GRADED — sealing only', suite: MIRROR_SUITE } },
    ];
    const stub = makeStub({ tables: { system_events: sealed } });
    const adjudicated = await readAdjudicatedVerdicts(stub);
    const asJson = JSON.stringify(adjudicated);
    expect(asJson).not.toContain(KEY_TOKEN);
    expect(asJson).not.toContain('SECRET PROMPT TEXT');
    expect(asJson).not.toContain('answer_key');

    // (c) a full assert path output likewise carries no key/text.
    const verdict = await assertReproducesKnownResult(stub, { gradeFn: async () => ({ clears_bar: true, quality_score: 0.95, grader: 'g', graded_at: 'x' }), loader: loaderStub(ONE_SET), keyAccessor: keyAccessorStub });
    const vJson = JSON.stringify(verdict);
    expect(vJson).not.toContain(KEY_TOKEN);
    expect(vJson).not.toContain('SECRET PROMPT TEXT');
  });
});
