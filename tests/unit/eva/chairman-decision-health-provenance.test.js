import { describe, it, expect } from 'vitest';
import { computeHealthScore, isSkipStub } from '../../../lib/eva/health-score-computer.js';
import { extractGateQuality, readCurrentStageHealth } from '../../../lib/eva/chairman-decision-watcher.js';

// SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 regression tests.

describe('FR-2: pre_exec_skip stub is NEUTRAL, not RED', () => {
  it('isSkipStub detects the skip markers', () => {
    expect(isSkipStub({ pre_exec_skip: true })).toBe(true);
    expect(isSkipStub({ skipped: true })).toBe(true);
    expect(isSkipStub({ status: 'skipped' })).toBe(true);
    expect(isSkipStub({ analysis: 'real work' })).toBe(false);
    expect(isSkipStub(null)).toBe(false);
  });

  it('computeHealthScore returns yellow (neutral) for a pre_exec_skip stub, NOT red', () => {
    expect(computeHealthScore({ pre_exec_skip: true, reason: 'no_change' })).toBe('yellow');
    expect(computeHealthScore({ status: 'skipped' })).toBe('yellow');
  });

  it('still scores a substantive artifact green and an empty object red (unchanged)', () => {
    const rich = { analysis: 'x'.repeat(50), summary: { a: 1, b: 2 }, findings: ['f1', 'f2'], recommendation: 'go', results: {} };
    expect(computeHealthScore(rich)).toBe('green');
    expect(computeHealthScore({})).toBe('red');
  });
});

describe('FR-1: readCurrentStageHealth scopes to the CURRENT stage', () => {
  function makeSupabase(capture) {
    return {
      from() {
        const filters = {};
        const b = {
          select() { return b; },
          eq(col, val) { filters[col] = val; return b; },
          maybeSingle() { capture.filters = filters; return Promise.resolve({ data: { health_score: 'green' } }); },
        };
        return b;
      },
    };
  }

  it('queries venture_stage_work filtered by venture_id AND lifecycle_stage (no cross-stage DESC)', async () => {
    const capture = {};
    const health = await readCurrentStageHealth(makeSupabase(capture), 'v1', 16);
    expect(health).toBe('green');
    expect(capture.filters.venture_id).toBe('v1');
    expect(capture.filters.lifecycle_stage).toBe(16);
  });

  it('fail-open returns null on error', async () => {
    const throwing = { from() { throw new Error('boom'); } };
    expect(await readCurrentStageHealth(throwing, 'v1', 16)).toBeNull();
  });
});

describe('FR-3: extractGateQuality populates the review basis', () => {
  it('pulls quality_score / completeness / critical_gaps / gate_rationale from advisory_data', () => {
    const out = extractGateQuality({
      quality_score: 87,
      completeness_pct: 92,
      critical_gaps: ['missing risk register'],
      gate_rationale: 'PASS — all phases above threshold',
    });
    expect(out.quality_score).toBe(87);
    expect(out.completeness_pct).toBe(92);
    expect(out.critical_gaps).toEqual(['missing risk register']);
    expect(out.gate_rationale).toMatch(/PASS/);
  });

  it('tolerates nested quality/gate shapes and overall_quality alias', () => {
    const out = extractGateQuality({ quality: { overall_quality: 75, completeness: 80 }, gate: { rationale: 'CONDITIONAL' } });
    expect(out.quality_score).toBe(75);
    expect(out.completeness_pct).toBe(80);
    expect(out.gate_rationale).toBe('CONDITIONAL');
  });

  it('returns an empty object (no junk keys) when nothing is present', () => {
    expect(extractGateQuality({ unrelated: 1 })).toEqual({});
    expect(extractGateQuality(null)).toEqual({});
  });
});
