/**
 * SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001 — the audit must not manufacture the defect it hunts.
 *
 * TS-1 and TS-2 are failures that ACTUALLY OCCURRED during this SD's LEAD phase, seeded with their
 * live numbers. TS-4 is the positive control, and it is unusually load-bearing here: an audit that
 * returned UNMEASURABLE or REFUSED for every gauge would satisfy every negative case below while
 * grading nothing — which is precisely the accusation it levels at its subjects.
 */

import { describe, it, expect } from 'vitest';
import { judgeGauge, summarise, VERDICT, MIN_N } from '../../lib/audit/refusal-test.js';

describe('TS-1 — SEEDED: an unreconciled enumeration cannot support a refusal verdict', () => {
  it('sub_agent_execution_results: 1198 enumerated of 29144 is REFUSED, not NEVER_REFUSED', () => {
    // THE LIVE FAILURE, TWICE OVER. The naive method (distinct values in a page) and the half-fix
    // (exact counts over a sampled domain) BOTH produced "never discriminated" here. The real
    // distribution is PASS 23243 / CONDITIONAL_PASS 1445 / WARNING 586 / FAIL 226 / BLOCKED 1198.
    const r = judgeGauge({
      gauge: 'sub_agent_execution_results', column: 'verdict',
      counts: { BLOCKED: 1198 }, total: 29144,
    });
    expect(r.verdict).toBe(VERDICT.REFUSED);
    expect(r.enumerated).toBe(1198);
  });

  it('the reconciliation is checked BEFORE the n-threshold', () => {
    // An unreconciled tally cannot support "too small to judge" either — that is still a claim about
    // the population, made from a page.
    const r = judgeGauge({ gauge: 'g', column: 'status', counts: { pass: 3 }, total: 5000 });
    expect(r.verdict).toBe(VERDICT.REFUSED);
  });

  it('a fully reconciled tally proceeds to a real verdict', () => {
    const r = judgeGauge({
      gauge: 'sub_agent_execution_results', column: 'verdict',
      counts: { PASS: 23243, CONDITIONAL_PASS: 1445, WARNING: 586, FAIL: 226, BLOCKED: 1198 },
      total: 26698,
    });
    expect(r.verdict).toBe(VERDICT.DISCRIMINATES);
  });
});

describe('TS-2 — SEEDED: a gauge that cannot be judged is REPORTED, never omitted', () => {
  it('sd_gate_results (n=7, all PASS) surfaces as UNMEASURABLE', () => {
    // My own LEAD-phase n-guard silently withheld this one. A filtered-out gauge is indistinguishable
    // from one never considered — the fold-into-CLEAR bug in a different costume.
    const r = judgeGauge({ gauge: 'sd_gate_results', column: 'result', counts: { PASS: 7 }, total: 7 });
    expect(r.verdict).toBe(VERDICT.UNMEASURABLE);
    expect(r.reason).toContain('n=7');
  });

  it('UNMEASURABLE fires even when the gauge visibly discriminates, if n is too small', () => {
    // agentic_reviews: passed 6 / warning 2 / pending 4. It DOES discriminate — but with n=12,
    // "it refuses" is as unsupported as "it never refuses".
    const r = judgeGauge({
      gauge: 'agentic_reviews', column: 'status',
      counts: { passed: 6, warning: 2, pending: 4 }, total: 12,
    });
    expect(r.verdict).toBe(VERDICT.UNMEASURABLE);
  });

  it('a store with no verdict-shaped column is UNMEASURABLE and names the reason', () => {
    const r = judgeGauge({ gauge: 'eva_vision_scores', column: null, counts: null, total: 6092 });
    expect(r.verdict).toBe(VERDICT.UNMEASURABLE);
    expect(r.reason).toContain('READER');
  });

  it('a null total is ABSENT, never zero — a head-count cannot tell them apart', () => {
    const r = judgeGauge({ gauge: 'leo_phase_ci_cd_gates', column: 'result', counts: null, total: null });
    expect(r.verdict).toBe(VERDICT.ABSENT);
  });
});

describe('TS-3 — a genuinely blind gauge is named as such', () => {
  it('a reconciled, well-sampled, single-outcome gauge is NEVER_REFUSED', () => {
    const r = judgeGauge({ gauge: 'always_pass_gate', column: 'result', counts: { PASS: 400 }, total: 400 });
    expect(r.verdict).toBe(VERDICT.NEVER_REFUSED);
    expect(r.reason).toContain('grades nothing');
  });

  it('a zero-count value does not rescue a blind gauge', () => {
    const r = judgeGauge({
      gauge: 'always_pass_gate', column: 'result',
      counts: { PASS: 400, FAIL: 0, BLOCKED: 0 }, total: 400,
    });
    expect(r.verdict).toBe(VERDICT.NEVER_REFUSED);
  });
});

describe('TS-4 — POSITIVE CONTROL: the audit must not achieve safety by grading nothing', () => {
  it('ship_review_findings (364: pass 360, block 4) DISCRIMINATES', () => {
    const r = judgeGauge({
      gauge: 'ship_review_findings', column: 'verdict',
      counts: { pass: 360, block: 4 }, total: 364,
    });
    expect(r.verdict).toBe(VERDICT.DISCRIMINATES);
  });

  it('eva_stage_gate_results (1770: true 1448, false 322) DISCRIMINATES', () => {
    const r = judgeGauge({
      gauge: 'eva_stage_gate_results', column: 'passed',
      counts: { true: 1448, false: 322 }, total: 1770,
    });
    expect(r.verdict).toBe(VERDICT.DISCRIMINATES);
  });

  it('a gauge just over the floor with two outcomes still DISCRIMINATES', () => {
    const r = judgeGauge({
      gauge: 'g', column: 'v', counts: { pass: MIN_N - 1, fail: 1 }, total: MIN_N,
    });
    expect(r.verdict).toBe(VERDICT.DISCRIMINATES);
  });
});

describe('summarise — the report states the limits of its own coverage', () => {
  it('counts what it could not speak to, rather than leaving it to be noticed', () => {
    const s = summarise([
      { verdict: VERDICT.DISCRIMINATES }, { verdict: VERDICT.DISCRIMINATES },
      { verdict: VERDICT.UNMEASURABLE }, { verdict: VERDICT.REFUSED },
      { verdict: VERDICT.ABSENT }, { verdict: VERDICT.NEVER_REFUSED },
    ]);
    expect(s.population).toBe(6);
    expect(s.unspoken).toBe(3);
    expect(s.grades_nothing).toBe(1);
  });
});
