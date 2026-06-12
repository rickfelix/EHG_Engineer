// SD-MAN-INFRA-GATE-BAR-REGIME-001 — evidence-existence bars (observe-only)
// on the 9 chairman-gate stages. Pins the DataDistill defect class: a 70/70
// passing verdict with empty criteria and NULL score must produce failing bar
// records WITHOUT blocking (advisory under observe-only).
import { describe, it, expect } from 'vitest';
import {
  CHAIRMAN_GATE_STAGES,
  GATE_BARS_OBSERVE_ONLY,
  evaluateGateBars,
  extractWebSources,
  extractArtifactRefs,
} from '../../../lib/eva/gate-bars.js';
import { isCalibrationEligibleVenture } from '../../../lib/eva/gate-enforcement.js';

const UUID = '9c85bf76-ced0-495f-9b68-394ca6fa0615';

describe('gate-bar regime scope and mode', () => {
  it('covers exactly the 9 sitting-ruled chairman-gate stages', () => {
    expect([...CHAIRMAN_GATE_STAGES].sort((a, b) => a - b)).toEqual([3, 5, 10, 13, 17, 18, 23, 24, 25]);
  });

  it('ships OBSERVE-ONLY (flip is a chairman-gated reviewed change)', () => {
    expect(GATE_BARS_OBSERVE_ONLY).toBe(true);
  });

  it('out-of-scope stages produce no bars and all_pass=true', async () => {
    const r = await evaluateGateBars({ stage_number: 7, gate_criteria: {}, overall_score: null });
    expect(r.in_scope).toBe(false);
    expect(r.bars).toEqual([]);
    expect(r.all_pass).toBe(true);
  });
});

describe('TS-1: empty-criteria NULL-score passing verdict (the DataDistill class)', () => {
  it('records failing criteria/score/evidence bars, advisory, never throws', async () => {
    const r = await evaluateGateBars({
      stage_number: 5, gate_type: 'kill', passed: true, overall_score: null, gate_criteria: {},
    });
    expect(r.in_scope).toBe(true);
    expect(r.advisory).toBe(true);
    expect(r.all_pass).toBe(false);
    const byBar = Object.fromEntries(r.bars.map((b) => [b.bar, b.status]));
    expect(byBar.criteria_present).toBe('fail');
    expect(byBar.score_present).toBe('fail');
    expect(byBar.evidence_resolvable).toBe('fail');
  });

  it('a real evidenced verdict passes all bars', async () => {
    const r = await evaluateGateBars(
      { stage_number: 25, gate_type: 'exit', overall_score: 100, gate_criteria: { review_artifact: UUID, t0_review: true } },
      { resolveArtifact: async () => true },
    );
    expect(r.all_pass).toBe(true);
  });

  it('resolver errors degrade to unverified, not fail (fail-open)', async () => {
    const r = await evaluateGateBars(
      { stage_number: 13, overall_score: 80, gate_criteria: { ref: UUID } },
      { resolveArtifact: async () => { throw new Error('db down'); } },
    );
    expect(r.bars.find((b) => b.bar === 'evidence_resolvable').status).toBe('unverified');
  });
});

describe('TS-3: S3 kill-gate web-grounding', () => {
  const base = { stage_number: 3, gate_type: 'kill', overall_score: 70 };

  it('no web citation → grounding bar fails (advisory)', async () => {
    const r = await evaluateGateBars({ ...base, gate_criteria: { signal: 'looks great' } });
    expect(r.bars.find((b) => b.bar === 's3_web_grounding').status).toBe('fail');
  });

  it('live URL cited → grounding bar passes', async () => {
    const r = await evaluateGateBars(
      { ...base, gate_criteria: { source: 'https://example.com/market-report' } },
      { checkUrl: async () => true },
    );
    expect(r.bars.find((b) => b.bar === 's3_web_grounding').status).toBe('pass');
  });

  it('network failure → unverified, never a hard fail', async () => {
    const r = await evaluateGateBars(
      { ...base, notes: 'see https://example.com/x' },
      { checkUrl: async () => { throw new Error('ETIMEDOUT'); } },
    );
    expect(r.bars.find((b) => b.bar === 's3_web_grounding').status).toBe('unverified');
  });

  it('grounding bar only applies to S3', async () => {
    const r = await evaluateGateBars({ stage_number: 24, overall_score: 90, gate_criteria: { ok: true } });
    expect(r.bars.find((b) => b.bar === 's3_web_grounding')).toBeUndefined();
  });
});

describe('extractors', () => {
  it('extracts URLs from criteria and notes, deduped', () => {
    const urls = extractWebSources({
      gate_criteria: { a: 'https://x.test/1' },
      notes: 'cited https://x.test/1 and https://y.test/2',
    });
    expect(urls).toEqual(['https://x.test/1', 'https://y.test/2']);
  });

  it('extracts UUID artifact refs from criteria, case-normalized', () => {
    expect(extractArtifactRefs({ gate_criteria: { ref: UUID.toUpperCase() } })).toEqual([UUID]);
  });
});

describe('TS-4: calibration exclusion (doctrine integration)', () => {
  it('workflow_scaffold ventures stay excluded via the canonical predicate', () => {
    expect(isCalibrationEligibleVenture({ metadata: { venture_classification: 'workflow_scaffold' } })).toBe(false);
    expect(isCalibrationEligibleVenture({ metadata: {} })).toBe(true);
  });
});
