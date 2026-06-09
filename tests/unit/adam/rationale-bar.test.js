/**
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 — the rationale bar (pure, DB-free).
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateCandidate,
  scoreCandidate,
  selectAdvisory,
  formatAdvisoryBody,
  passesConstSelfCheck,
  hasLiveAnchor,
} from '../../../lib/adam/rationale-bar.js';

const validKrCandidate = () => ({
  scope_key: 'harness',
  opportunity: 'Close the off-track gate-pass-rate KR for harness governance.',
  objective_kr: { objective: 'O-GOV', kr: 'KR-gate-pass-85', kr_status: 'off_track', off_track_delta: -12 },
  contribution_type: 'direct',
  evidence: 'leo_gate_reviews shows pass_rate 73% over the last 4 weeks (row id 438).',
  rationale: 'A targeted gate-tuning SD would lift the pass rate toward the 85% KR.',
  risk: 'Over-tuning could mask real defects.',
  counterfactual: 'If left alone, pass rate trends further from target as volume grows.',
  confidence: 0.7,
  dedup_key: 'harness-gate-pass-tuning',
});

describe('evaluateCandidate', () => {
  it('clears the bar for a fully-formed, live-KR-anchored candidate', () => {
    const r = evaluateCandidate(validKrCandidate(), { openSdKeys: new Set() });
    expect(r.clears).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects a candidate missing the required counterfactual', () => {
    const c = validKrCandidate();
    delete c.counterfactual;
    const r = evaluateCandidate(c);
    expect(r.clears).toBe(false);
    expect(r.reasons).toContain('missing counterfactual');
  });

  it('rejects a candidate with no live KR / L2-vision anchor (never fabricate)', () => {
    const c = validKrCandidate();
    c.objective_kr = null;
    const r = evaluateCandidate(c);
    expect(r.clears).toBe(false);
    expect(r.reasons).toContain('no live KR or L2-vision+metric anchor');
  });

  it('treats zero OKR linkage as a missing-OKR GAP unless an L2 vision anchor exists', () => {
    const c = validKrCandidate();
    c.objective_kr = { objective: 'O', kr: 'KR', kr_status: 'completed' }; // 1.5*0.5*10=8 -> ok
    c.contribution_type = 'supporting';
    c.okr_score = 0;
    const r = evaluateCandidate(c);
    expect(r.clears).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/zero OKR linkage/);
  });

  it('rejects a candidate that duplicates an open SD', () => {
    const r = evaluateCandidate(validKrCandidate(), { openSdKeys: new Set(['harness-gate-pass-tuning']) });
    expect(r.clears).toBe(false);
    expect(r.reasons).toContain('duplicates an open SD');
  });

  it('rejects manipulative framing (CONST-010)', () => {
    const c = validKrCandidate();
    c.rationale = 'You must act now — this is critically urgent and guaranteed to help.';
    const r = evaluateCandidate(c);
    expect(r.clears).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/CONST-010/);
  });

  it('rejects a self-approval action (CONST-002)', () => {
    const c = validKrCandidate();
    c.action = 'auto-accept';
    expect(passesConstSelfCheck(c).ok).toBe(false);
    expect(evaluateCandidate(c).clears).toBe(false);
  });
});

describe('scoreCandidate', () => {
  it('weights direct + off_track highest (1.5 * 3.0 * 10 = 45)', () => {
    expect(scoreCandidate(validKrCandidate())).toBe(45);
  });
  it('returns null without a scoreable KR', () => {
    expect(scoreCandidate({ objective_kr: null })).toBeNull();
  });
});

describe('hasLiveAnchor', () => {
  it('accepts an L2 vision + live metric as a per-venture anchor', () => {
    expect(hasLiveAnchor({ l2_vision_ref: 'VIS-1', live_metric: 'MRR=1200' })).toBe(true);
    expect(hasLiveAnchor({})).toBe(false);
  });
});

describe('selectAdvisory (global <=1 cap)', () => {
  it('returns ADAM_OK when nothing clears the bar', () => {
    const r = selectAdvisory([{ opportunity: 'x' }]);
    expect(r.verdict).toBe('ADAM_OK');
    expect(r.surfaced).toBeNull();
  });

  it('surfaces exactly ONE (top-ranked) advisory even when several clear', () => {
    const a = validKrCandidate();
    const b = validKrCandidate();
    b.dedup_key = 'other';
    b.objective_kr.kr_status = 'at_risk'; // 1.5*2.0*10 = 30 < 45
    const r = selectAdvisory([b, a], { openSdKeys: new Set() });
    expect(r.verdict).toBe('SURFACED');
    expect(r.cleared).toBe(2);
    expect(r.surfaced.dedup_key).toBe('harness-gate-pass-tuning'); // the 45-score one
  });
});

describe('formatAdvisoryBody', () => {
  it('emits the full ordered rationale structure incl. Counterfactual', () => {
    const body = formatAdvisoryBody(validKrCandidate());
    expect(body).toMatch(/Opportunity:/);
    expect(body).toMatch(/Counterfactual:/);
    expect(body).toMatch(/Confidence:/);
  });
});
