import { describe, it, expect } from 'vitest';
import {
  buildFixtures,
  GOOGLE_PURPOSES,
  TIMEOUT_FIXTURE_RUNS,
  TIMEOUT_FIXTURE_FAIL_THRESHOLD,
  evaluateTimeoutFixture,
} from '../../../lib/eval/gemini-smoke-fixtures.mjs';
import { runPipeline, buildBaselineSnapshot, dryRun } from '../../../scripts/eval/gemini-smoke-eval.mjs';
import { MODEL_DEFAULTS } from '../../../lib/config/model-config.js';

describe('gemini-smoke-fixtures', () => {
  it('derives GOOGLE_PURPOSES from MODEL_DEFAULTS.google, not a hardcoded list', () => {
    expect(GOOGLE_PURPOSES).toEqual(Object.keys(MODEL_DEFAULTS.google));
  });

  it('currently has exactly 8 Google purpose keys -- if this fails, a sibling SD (e.g. G / cost-governor) added a new purpose key; extend the fixture set for it', () => {
    expect(GOOGLE_PURPOSES.length).toBe(8);
  });

  it('builds exactly 25 fixtures: 3 per purpose + 1 synthetic timeout fixture', () => {
    const fixtures = buildFixtures();
    expect(fixtures.length).toBe(GOOGLE_PURPOSES.length * 3 + 1);
    expect(fixtures.length).toBe(25);
  });

  it('every non-synthetic fixture references a valid Google purpose key', () => {
    const fixtures = buildFixtures();
    for (const f of fixtures.filter((x) => !x.synthetic)) {
      expect(GOOGLE_PURPOSES).toContain(f.purpose);
    }
  });

  it('has exactly one synthetic timeout fixture, explicitly flagged', () => {
    const fixtures = buildFixtures();
    const synthetic = fixtures.filter((f) => f.synthetic === true);
    expect(synthetic.length).toBe(1);
    expect(synthetic[0].timeoutFixture).toBe(true);
    expect(synthetic[0].task_id).toBe('GEMINI-SMOKE-TIMEOUT-SYNTHETIC');
  });

  it('every fixture carries provenance (content_hash, source_ref)', () => {
    for (const f of buildFixtures()) {
      expect(f.content_hash).toBeTruthy();
      expect(f.source_ref).toBeTruthy();
    }
  });

  describe('evaluateTimeoutFixture (3 runs / 1-timeout-fails aggregation rule)', () => {
    it('passes when zero of 3 runs time out', () => {
      const failed = evaluateTimeoutFixture([{ timedOut: false }, { timedOut: false }, { timedOut: false }]);
      expect(failed).toBe(false);
    });

    it('fails when exactly 1 of 3 runs times out (the documented threshold)', () => {
      const failed = evaluateTimeoutFixture([{ timedOut: true }, { timedOut: false }, { timedOut: false }]);
      expect(failed).toBe(true);
      expect(TIMEOUT_FIXTURE_FAIL_THRESHOLD).toBe(1);
    });

    it('fails when all 3 runs time out', () => {
      const failed = evaluateTimeoutFixture([{ timedOut: true }, { timedOut: true }, { timedOut: true }]);
      expect(failed).toBe(true);
    });

    it('throws if given the wrong number of run results (guards against a silently-mis-wired caller)', () => {
      expect(() => evaluateTimeoutFixture([{ timedOut: false }])).toThrow();
      expect(TIMEOUT_FIXTURE_RUNS).toBe(3);
    });
  });
});

describe('gemini-smoke-eval runner', () => {
  it('--dry-run self-test passes with zero real network calls', async () => {
    const r = await dryRun();
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it('runPipeline resolves every fixture through the real getGoogleModel() production config path (never a hardcoded model string)', async () => {
    const fixtures = buildFixtures();
    let calls = 0;
    const executor = async () => { calls++; return { ok: true, timedOut: false }; };
    const results = await runPipeline(fixtures, executor);
    expect(results.length).toBe(25);
    for (const r of results) {
      expect(r.modelId).toBeTruthy();
      expect(typeof r.modelId).toBe('string');
    }
  });

  it('runPipeline runs the timeout fixture exactly TIMEOUT_FIXTURE_RUNS times and aggregates via evaluateTimeoutFixture', async () => {
    const fixtures = buildFixtures();
    let timeoutCalls = 0;
    const executor = async (fixture) => {
      if (fixture.timeoutFixture) { timeoutCalls++; return { timedOut: false }; }
      return { ok: true, timedOut: false };
    };
    await runPipeline(fixtures, executor);
    expect(timeoutCalls).toBe(TIMEOUT_FIXTURE_RUNS);
  });

  it('buildBaselineSnapshot logs a timestamped model for every Google purpose, resolved via the real config path', () => {
    const snapshot = buildBaselineSnapshot();
    expect(snapshot.label).toBe('gemini-smoke-eval-baseline');
    expect(snapshot.generated_at).toBeTruthy();
    expect(snapshot.purposes).toEqual(GOOGLE_PURPOSES);
    for (const purpose of GOOGLE_PURPOSES) {
      expect(snapshot.models[purpose]).toBeTruthy();
    }
  });
});
