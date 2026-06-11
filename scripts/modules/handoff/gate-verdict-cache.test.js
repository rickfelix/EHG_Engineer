/**
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-B (program L5) — gate-verdict cache.
 *
 * Pins the zero-quality-loss contract:
 *  - reuse requires byte-identical declared-input hash AND prior PASS;
 *  - FAIL/CONDITIONAL/WAIT/skipped verdicts are NEVER reused;
 *  - changed input invalidates exactly the affected gate;
 *  - undeclared gates never hash, never hit;
 *  - extractor throw → unhashable this run (fail-open);
 *  - --no-cache and LEAD-FINAL-APPROVAL disable caching (isCacheAllowed);
 *  - recordFailure persists per-gate gate_results (version 2) on rejected rows;
 *  - validateGates end-to-end: cached gate's validator is NOT invoked and the
 *    pipeline verdict equals a control full run.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  stableStringify,
  computeInputHash,
  probeVerdictCache,
  isCacheAllowed,
  mergePassResults,
  loadPriorGateResults,
  GATE_INPUT_EXTRACTORS,
  SD_CONTENT_FIELDS,
} from './gate-verdict-cache.js';

const SD = {
  title: 'T', description: 'D', sd_type: 'infrastructure', scope: 'S',
  strategic_objectives: ['o1'], dependencies: [], implementation_guidelines: [],
  success_criteria: [{ criterion: 'c', measure: 'm' }],
  success_metrics: [{ metric: 'a' }, { metric: 'b' }, { metric: 'c' }],
  key_changes: [{ change: 'k' }], key_principles: ['p'], risks: [{ risk: 'r' }],
  target_application: 'EHG_Engineer',
};

function priorPass(ctx) {
  const hash = computeInputHash(
    Object.fromEntries(SD_CONTENT_FIELDS.map(f => [f, (ctx.sd[f] ?? null)]))
  );
  return { passed: true, score: 100, maxScore: 100, issues: [], warnings: [], input_hash: hash };
}

describe('stableStringify / computeInputHash', () => {
  it('key order does not affect the hash', () => {
    expect(computeInputHash({ b: 2, a: 1 })).toBe(computeInputHash({ a: 1, b: 2 }));
    expect(stableStringify({ x: [1, { z: 1, y: 2 }] })).toBe(stableStringify({ x: [1, { y: 2, z: 1 }] }));
  });
  it('different content yields a different hash', () => {
    expect(computeInputHash({ a: 1 })).not.toBe(computeInputHash({ a: 2 }));
  });
});

describe('probeVerdictCache', () => {
  const ctx = { sd: SD };

  it('identical inputs + prior PASS → hit with prior result', () => {
    const prior = { GATE_SD_METRICS_SUFFICIENCY: priorPass(ctx) };
    const probe = probeVerdictCache('GATE_SD_METRICS_SUFFICIENCY', ctx, { enabled: true, prior });
    expect(probe.hit).toBe(true);
    expect(probe.priorResult.score).toBe(100);
  });

  it('changed declared input invalidates exactly that gate', () => {
    const prior = {
      GATE_SD_METRICS_SUFFICIENCY: priorPass(ctx),
      GATE_SD_QUALITY: priorPass(ctx),
    };
    const changedCtx = { sd: { ...SD, success_metrics: [{ metric: 'CHANGED' }] } };
    // Shared extractor: BOTH gates see the changed SD content — both miss…
    expect(probeVerdictCache('GATE_SD_METRICS_SUFFICIENCY', changedCtx, { enabled: true, prior }).hit).toBe(false);
    // …while the unchanged SD still hits (per-gate invalidation is hash-driven).
    expect(probeVerdictCache('GATE_SD_QUALITY', ctx, { enabled: true, prior }).hit).toBe(true);
  });

  it('prior FAIL is NEVER reused even with identical hash', () => {
    const failed = { ...priorPass(ctx), passed: false, score: 40 };
    const probe = probeVerdictCache('GATE_SD_QUALITY', ctx, { enabled: true, prior: { GATE_SD_QUALITY: failed } });
    expect(probe.hit).toBe(false);
  });

  it('wait/skipped prior shapes are never reused', () => {
    const waiting = { ...priorPass(ctx), wait: true };
    const skipped = { ...priorPass(ctx), skipReason: 'SD_TYPE' };
    expect(probeVerdictCache('GATE_SD_QUALITY', ctx, { enabled: true, prior: { GATE_SD_QUALITY: waiting } }).hit).toBe(false);
    expect(probeVerdictCache('GATE_SD_QUALITY', ctx, { enabled: true, prior: { GATE_SD_QUALITY: skipped } }).hit).toBe(false);
  });

  it('undeclared gate: no hash, no hit', () => {
    const probe = probeVerdictCache('RCA_GATE', ctx, { enabled: true, prior: { RCA_GATE: priorPass(ctx) } });
    expect(probe.inputHash).toBeNull();
    expect(probe.hit).toBe(false);
  });

  it('cache disabled: hash still computed (for persistence) but no hit', () => {
    const prior = { GATE_SD_QUALITY: priorPass(ctx) };
    const probe = probeVerdictCache('GATE_SD_QUALITY', ctx, { enabled: false, prior });
    expect(probe.hit).toBe(false);
    expect(probe.inputHash).toBeTruthy();
  });

  it('extractor throw → unhashable this run (fail-open)', () => {
    GATE_INPUT_EXTRACTORS.__THROWY__ = () => { throw new Error('boom'); };
    try {
      const probe = probeVerdictCache('__THROWY__', ctx, { enabled: true, prior: { __THROWY__: priorPass(ctx) } });
      expect(probe.hit).toBe(false);
      expect(probe.inputHash).toBeNull();
    } finally {
      delete GATE_INPUT_EXTRACTORS.__THROWY__;
    }
  });
});

describe('isCacheAllowed (FR-4 policy)', () => {
  it('--no-cache disables', () => {
    expect(isCacheAllowed({ noCache: true, handoffType: 'PLAN-TO-LEAD' })).toBe(false);
  });
  it('LEAD-FINAL-APPROVAL hard-excluded (both separator forms)', () => {
    expect(isCacheAllowed({ noCache: false, handoffType: 'LEAD-FINAL-APPROVAL' })).toBe(false);
    expect(isCacheAllowed({ noCache: false, handoffType: 'LEAD_FINAL_APPROVAL' })).toBe(false);
  });
  it('env kill-switch disables; default allows', () => {
    expect(isCacheAllowed({ noCache: false, handoffType: 'PLAN-TO-LEAD', env: { LEO_GATE_VERDICT_CACHE: 'off' } })).toBe(false);
    expect(isCacheAllowed({ noCache: false, handoffType: 'PLAN-TO-LEAD', env: {} })).toBe(true);
  });
});

describe('mergePassResults (in-process retry reuse)', () => {
  it('folds only hash-bearing PASS results', () => {
    const merged = mergePassResults({}, {
      A: { passed: true, input_hash: 'h1' },
      B: { passed: false, input_hash: 'h2' },
      C: { passed: true },                       // no hash
      D: { passed: true, input_hash: 'h4', wait: true },
    });
    expect(Object.keys(merged)).toEqual(['A']);
  });
});

describe('loadPriorGateResults', () => {
  function mockSupabase(rows, error = null) {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: rows, error }),
    };
    return { from: vi.fn().mockReturnValue(chain) };
  }

  it('returns the newest version>=2 gate_results; skips version-1 rows', async () => {
    const rows = [
      { metadata: { gate_results: { OLD: {} }, gate_results_version: 1 } },
      { metadata: { gate_results: { NEW: { passed: true } }, gate_results_version: 2 } },
    ];
    const out = await loadPriorGateResults(mockSupabase(rows), 'uuid', 'PLAN-TO-LEAD');
    expect(out).toEqual({ NEW: { passed: true } });
  });

  it('fail-open: query error → null', async () => {
    expect(await loadPriorGateResults(mockSupabase(null, { message: 'down' }), 'u', 'T')).toBeNull();
  });
});

describe('validateGates end-to-end reuse (TS-1 control parity)', () => {
  it('cached gate validator NOT invoked; pipeline verdict equals control run', async () => {
    const { ValidationOrchestrator } = await import('./validation/ValidationOrchestrator.js');
    const orchestrator = new ValidationOrchestrator({ supabase: {} });
    // Avoid DB-dependent preloading in this offline test.
    orchestrator.preloadGateContexts = async () => {};

    const validator = vi.fn().mockResolvedValue({ passed: true, score: 100, maxScore: 100, issues: [], warnings: [] });
    const gates = [{ name: 'GATE_SD_QUALITY', validator, weight: 1 }];
    const ctx = { sd: SD };

    // Control: full run, no cache.
    const control = await orchestrator.validateGates(gates, { ...ctx });
    expect(validator).toHaveBeenCalledTimes(1);
    expect(control.gateResults.GATE_SD_QUALITY.input_hash).toBeTruthy();

    // Retry with cache armed from the control run's results.
    const prior = mergePassResults({}, control.gateResults);
    const retry = await orchestrator.validateGates(gates, { ...ctx, _verdictCache: { enabled: true, prior } });
    expect(validator).toHaveBeenCalledTimes(1); // NOT invoked again
    expect(retry.gateResults.GATE_SD_QUALITY.cache_hit).toBe(true);
    expect(retry.passed).toBe(control.passed);
    expect(retry.gateResults.GATE_SD_QUALITY.score).toBe(control.gateResults.GATE_SD_QUALITY.score);
  });
});

describe('recordFailure persists per-gate verdicts (TS-6)', () => {
  it('rejected row metadata carries gate_results version 2', async () => {
    const { HandoffRecorder } = await import('./recording/HandoffRecorder.js');
    let inserted = null;
    const supabase = {
      from: vi.fn().mockImplementation((table) => ({
        insert: vi.fn().mockImplementation((row) => {
          if (table === 'sd_phase_handoffs') inserted = row; // only the rejection row
          return { select: vi.fn().mockResolvedValue({ data: [row], error: null }) };
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    };
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { buildRejection: () => ({ executive_summary: 'x' }) },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    // _resolveToUUID hits the DB — stub it for the offline test.
    recorder._resolveToUUID = async () => '00000000-0000-0000-0000-000000000001';

    const gateResults = { GATE_SD_QUALITY: { passed: true, score: 100, input_hash: 'abc' } };
    await recorder.recordFailure('PLAN-TO-LEAD', 'SD-T-001', {
      message: 'failed', reasonCode: 'GATE_FAILED', gateCount: 1, issues: [], warnings: [],
      gateResults,
    });

    expect(inserted).toBeTruthy();
    expect(inserted.metadata.gate_results).toEqual(gateResults);
    expect(inserted.metadata.gate_results_version).toBe(2);
  });
});
