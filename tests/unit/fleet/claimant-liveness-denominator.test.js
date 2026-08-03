// SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 (FR-2) — giving the refusal count a denominator.
//
// A guard's PASS path runs constantly, so it always looks healthy; its REFUSE path may never have
// executed. So zero refusals means UNTESTED, not safe — unless you know how many times the guard was
// evaluated. Measured before this change: 0 refusals lifetime, and NO evaluation record of any kind,
// so 0-refusals and 0-evaluations were the same observation and the zero could not be read at all.
//
// WHY AN AGGREGATE AND NOT A ROW PER EVALUATION: the pre-existing comment at the call site is right —
// "persist ONLY refusals ... writing one per claim would bury the rows that matter". system_events is
// already 125,275 of 128,267 rows a single event type (97.7%). That correct instinct is what produced
// the unreadable zero, so the denominator has to arrive WITHOUT reintroducing the flood.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const mod = require_('../../../lib/fleet/claimant-liveness.cjs');
const { fenceEvaluations, recordEvaluation, evaluationBucket, maybeFlushEvaluationCount, auditFailures } = mod;

const H = (iso) => Date.parse(iso);
const capture = () => { const rows = []; return { rows, sb: { from: () => ({ insert: async (r) => { rows.push(r); return { error: null }; } }) } }; };
const throwingSb = { from: () => ({ insert: async () => { throw new Error('permission denied'); } }) };

beforeEach(() => {
  fenceEvaluations.evaluated = 0; fenceEvaluations.refused = 0;
  fenceEvaluations.pendingEvaluated = 0; fenceEvaluations.pendingRefused = 0;
  fenceEvaluations.lastBucket = null;
  auditFailures.claim_fence_evaluated = 0;
});

describe('FR-2: the evaluation count is the denominator', () => {
  it('counts passes AND refusals — the pass is the whole point', () => {
    recordEvaluation(false); recordEvaluation(false); recordEvaluation(true);
    expect(fenceEvaluations.evaluated).toBe(3);
    expect(fenceEvaluations.refused).toBe(1);
  });

  // THE ASSERTION THAT MAKES A ZERO READABLE. Without a denominator these two states are identical.
  it('distinguishes never-fired from never-ran', () => {
    for (let i = 0; i < 10; i += 1) recordEvaluation(false);
    expect(fenceEvaluations.evaluated).toBeGreaterThan(0);
    expect(fenceEvaluations.refused).toBe(0);   // ran 10 times, never fired — SAFE-ish and readable
    // and the other state:
    fenceEvaluations.evaluated = 0;
    expect(fenceEvaluations.evaluated).toBe(0); // never ran — UNTESTED, and now distinguishable
  });
});

describe('FR-2/TR-1: low cardinality — one aggregate per hour bucket, never a row per claim', () => {
  it('writes NOTHING within a single bucket, however many evaluations occur', async () => {
    const { rows, sb } = capture();
    const t = H('2026-08-03T06:00:00Z');
    await maybeFlushEvaluationCount(sb, t);           // first call in-process: arms the bucket
    for (let i = 0; i < 500; i += 1) {
      recordEvaluation(false);
      await maybeFlushEvaluationCount(sb, t + i * 1000);
    }
    // 500 evaluations, ZERO rows — this is the property that keeps the fix from becoming the flood
    // the original author correctly avoided.
    expect(rows).toEqual([]);
  });

  it('flushes ONE aggregate when the bucket rolls, carrying both numerator and denominator', async () => {
    const { rows, sb } = capture();
    await maybeFlushEvaluationCount(sb, H('2026-08-03T06:00:00Z'));
    for (let i = 0; i < 40; i += 1) recordEvaluation(i % 10 === 0); // 40 evaluations, 4 refusals
    await maybeFlushEvaluationCount(sb, H('2026-08-03T07:00:01Z'));
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('claim_fence_evaluated');
    expect(rows[0].payload.evaluated).toBe(40);
    expect(rows[0].payload.refused).toBe(4);
    expect(rows[0].payload.guard).toBe('claimant_liveness');
  });

  it('does not emit an empty aggregate for a quiet hour', async () => {
    const { rows, sb } = capture();
    await maybeFlushEvaluationCount(sb, H('2026-08-03T06:00:00Z'));
    await maybeFlushEvaluationCount(sb, H('2026-08-03T07:00:00Z')); // no evaluations accrued
    expect(rows).toEqual([]);
  });

  it('resets the pending window after a flush, so counts are per-bucket not cumulative', async () => {
    const { rows, sb } = capture();
    await maybeFlushEvaluationCount(sb, H('2026-08-03T06:00:00Z'));
    recordEvaluation(false); recordEvaluation(false);
    await maybeFlushEvaluationCount(sb, H('2026-08-03T07:00:00Z'));
    recordEvaluation(false);
    await maybeFlushEvaluationCount(sb, H('2026-08-03T08:00:00Z'));
    expect(rows.map((r) => r.payload.evaluated)).toEqual([2, 1]);
    // lifetime totals keep accumulating even though the per-bucket windows reset
    expect(fenceEvaluations.evaluated).toBe(3);
  });

  it('evaluationBucket is hour-granular', () => {
    expect(evaluationBucket(H('2026-08-03T06:59:59Z'))).toBe('2026-08-03T06');
    expect(evaluationBucket(H('2026-08-03T07:00:00Z'))).toBe('2026-08-03T07');
  });
});

describe('FR-2 inherits the FR-1 lesson: the denominator writer cannot itself be silent', () => {
  // A second recorder that swallows its own failure would recreate the exact defect this SD fixes,
  // one level down — the zero would be unreadable again and nothing would say why.
  it('counts and reports a failed flush instead of swallowing it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await maybeFlushEvaluationCount(throwingSb, H('2026-08-03T06:00:00Z'));
      recordEvaluation(false);
      await maybeFlushEvaluationCount(throwingSb, H('2026-08-03T07:00:00Z'));
      expect(auditFailures.claim_fence_evaluated).toBe(1);
      const said = warn.mock.calls.flat().join(' ');
      expect(said).toMatch(/EVALUATION-COUNT WRITE FAILED/);
      expect(said).toMatch(/uninterpretable/);
    } finally { warn.mockRestore(); }
  });

  // TR-2 CONTROL — the denominator must never be able to break a claim decision.
  it('CONTROL: never throws, so it cannot affect the fence outcome', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await maybeFlushEvaluationCount(throwingSb, H('2026-08-03T06:00:00Z'));
      recordEvaluation(false);
      await expect(maybeFlushEvaluationCount(throwingSb, H('2026-08-03T07:00:00Z'))).resolves.toBeUndefined();
      const hostile = { from: () => { throw new Error('client exploded'); } };
      recordEvaluation(false);
      await expect(maybeFlushEvaluationCount(hostile, H('2026-08-03T08:00:00Z'))).resolves.toBeUndefined();
    } finally { warn.mockRestore(); }
  });
});
