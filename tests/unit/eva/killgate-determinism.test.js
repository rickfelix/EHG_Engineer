/**
 * Tests for kill-gate verdict determinism across ALL kill gates.
 * SD-LEO-INFRA-KILLGATE-DETERMINISM-ALL-GATES-001 (generalizes #5206 S5-only).
 *
 * TS-1 per-gate determinism (3/5/13) ; TS-2 registry dispatch ; TS-3 predicates broadened ;
 * TS-4 S13 recompute from artifact (run#2 blocker) ; TS-5 DA persisted-read + strong-challenge.
 */
import { describe, it, expect } from 'vitest';
import {
  KILL_GATE_RECOMPUTE,
  hasKillGateRecompute,
  recomputeKillGateVerdict,
} from '../../../lib/eva/kill-gate-recompute.js';
import { KILL_GATES, isStrongDevilsAdvocateChallenge, loadPersistedDevilsAdvocate } from '../../../lib/eva/devils-advocate.js';

// ── Fixtures: persisted artifacts shaped like each stage's locked output ─────
const s3Pass = [{ artifactType: 'stage_3_analysis', payload: { overallScore: 82, metrics: { a: 80, b: 75, c: 70 } } }];
const s3Kill = [{ artifactType: 'stage_3_analysis', payload: { overallScore: 20, metrics: { a: 40, b: 30, c: 25 } } }];
const s5Pass = [{ artifactType: 'truth_financial_model', payload: { roi3y: 0.35, breakEvenMonth: 12, unitEconomics: { cac: 100, ltv: 500, paybackMonths: 8 } } }];
const s13Pass = [{ artifactType: 'product_roadmap', payload: {
  milestone_count: 3, timeline_months: 6,
  milestones: [
    { name: 'M1', deliverables: ['d1'], priority: 'now' },
    { name: 'M2', deliverables: ['d2'], priority: 'next' },
    { name: 'M3', deliverables: ['d3'], priority: 'later' },
  ],
} }];
const s13Kill = [{ artifactType: 'product_roadmap', payload: {
  milestone_count: 1, timeline_months: 1, milestones: [{ name: 'M1', deliverables: [], priority: 'later' }],
} }];

// ── TS-2: registry dispatch ──────────────────────────────────────────────────
describe('kill-gate recompute registry', () => {
  it('has recompute for kill gates with artifact evaluators (3/5/13), not others', () => {
    expect(hasKillGateRecompute(3)).toBe(true);
    expect(hasKillGateRecompute(5)).toBe(true);
    expect(hasKillGateRecompute(13)).toBe(true);
    expect(hasKillGateRecompute(24)).toBe(false); // no artifact evaluator (derives from S23)
    expect(hasKillGateRecompute(7)).toBe(false);
    expect(Object.keys(KILL_GATE_RECOMPUTE).map(Number).sort((a, b) => a - b)).toEqual([3, 5, 13]);
  });
  it('returns null for a stage with no recompute', () => {
    expect(recomputeKillGateVerdict(7, [{ payload: {} }])).toBeNull();
  });
  it('returns null when no usable artifact is present', () => {
    expect(recomputeKillGateVerdict(13, [])).toBeNull();
    expect(recomputeKillGateVerdict(13, [{ artifactType: 'x' }])).toBeNull();
  });
});

// ── TS-1: per-gate determinism ───────────────────────────────────────────────
describe('per-gate determinism (same artifact -> identical verdict)', () => {
  for (const [label, stage, arts] of [
    ['S3 pass', 3, s3Pass], ['S3 kill', 3, s3Kill],
    ['S5 pass', 5, s5Pass],
    ['S13 pass', 13, s13Pass], ['S13 kill', 13, s13Kill],
  ]) {
    it(`${label} is deterministic across repeated recompute`, () => {
      const a = recomputeKillGateVerdict(stage, arts);
      const b = recomputeKillGateVerdict(stage, arts);
      const c = recomputeKillGateVerdict(stage, arts);
      expect(a).not.toBeNull();
      expect(a).toEqual(b);
      expect(b).toEqual(c);
      expect(['pass', 'kill', 'revise', 'conditional_pass']).toContain(a.decision);
    });
  }
});

// ── TS-4: S13 recompute from artifact (the run#2 blocker) ────────────────────
describe('S13 verdict recompute from persisted roadmap artifact', () => {
  it('a complete roadmap (>=3 milestones, deliverables, timeline, now-priority) => pass', () => {
    expect(recomputeKillGateVerdict(13, s13Pass).decision).toBe('pass');
  });
  it('an incomplete roadmap (<3 milestones / no deliverables / short timeline) => kill', () => {
    const v = recomputeKillGateVerdict(13, s13Kill);
    expect(v.decision).toBe('kill');
    expect(v.blockProgression).toBe(true);
    expect(v.reasons.length).toBeGreaterThan(0);
  });
});

describe('S3 recompute from persisted scorecard artifact', () => {
  it('strong composite => pass; catastrophic => kill', () => {
    expect(recomputeKillGateVerdict(3, s3Pass).decision).toBe('pass');
    expect(recomputeKillGateVerdict(3, s3Kill).decision).toBe('kill');
  });
});

// ── TS-3: kill-gate predicates broadened to the full KILL_GATES set ──────────
describe('KILL_GATES (single source of truth)', () => {
  it('covers all four kill gates', () => {
    expect(KILL_GATES).toEqual([3, 5, 13, 24]);
    for (const g of [3, 5, 13, 24]) expect(KILL_GATES.includes(g)).toBe(true);
    expect(KILL_GATES.includes(7)).toBe(false);
  });
});

// ── TS-5: DA persisted-read + strong-challenge predicate ─────────────────────
function mockSupabaseDA(artifactData) {
  const b = {
    select: () => b, eq: () => b, order: () => b,
    limit: () => Promise.resolve({ data: artifactData === undefined ? [] : [{ artifact_data: artifactData }], error: null }),
  };
  return { from: () => b };
}

describe('loadPersistedDevilsAdvocate (FR-3 determinism)', () => {
  it('returns the persisted review object (artifact_data IS the review)', async () => {
    const review = { overallAssessment: 'challenge', risks: [{ severity: 'high' }, { severity: 'high' }], isFallback: false, counterArguments: ['c1'] };
    const got = await loadPersistedDevilsAdvocate(mockSupabaseDA(review), 'v1', 13);
    expect(got).toEqual(review);
  });
  it('a persisted strong-challenge review trips isStrongDevilsAdvocateChallenge (deterministic route-to-review)', async () => {
    const review = { overallAssessment: 'challenge', risks: [{ severity: 'high' }, { severity: 'high' }], isFallback: false };
    const got = await loadPersistedDevilsAdvocate(mockSupabaseDA(review), 'v1', 5);
    expect(isStrongDevilsAdvocateChallenge(got)).toBe(true);
  });
  it('returns null when no persisted DA exists (falls back to generate)', async () => {
    expect(await loadPersistedDevilsAdvocate(mockSupabaseDA(undefined), 'v1', 3)).toBeNull();
  });
  it('returns null on a malformed/empty artifact_data', async () => {
    expect(await loadPersistedDevilsAdvocate(mockSupabaseDA({}), 'v1', 3)).toBeNull();
    expect(await loadPersistedDevilsAdvocate(null, 'v1', 3)).toBeNull();
  });
});
