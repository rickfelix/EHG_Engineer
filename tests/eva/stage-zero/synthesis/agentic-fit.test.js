/**
 * Unit Tests for the Agentic-Fit Venture-Selection Lens
 * Part of SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001
 *
 * FR-1 computeAgenticFitScore (4 config-weighted dims + near-threshold rule)
 * FR-2 applyMachineImprovementMultiplier (separate, queue-jumping)
 * FR-3 classifyDisadvantages (soft down-weight + flag, never auto-kill)
 * FR-4 integration: agentic_fit as a weighted Stage-0 venture_score component
 * FR-5 transparency: scoreAgenticFit records sub-scores + flags + multiplier
 * FR-6 config-SSOT: weights/params overridable
 */
import { describe, it, expect } from 'vitest';
import {
  AF_WEIGHTS,
  AGENT_LEVERAGE_FLOOR,
  computeAgenticFitScore,
  applyMachineImprovementMultiplier,
  classifyDisadvantages,
  scoreAgenticFit,
  buildAgenticFitAdvisory,
} from '../../../../lib/eva/stage-zero/synthesis/agentic-fit.js';
import { calculateWeightedScore } from '../../../../lib/eva/stage-zero/profile-service.js';
import { evaluateKillGate } from '../../../../lib/eva/stage-templates/stage-03.js';

const HIGH_FIT = { agent_leverage: 90, compounding: 85, kill_speed: 80, attention_economy: 80 };
const LOW_LEVERAGE = { agent_leverage: 10, compounding: 90, kill_speed: 90, attention_economy: 90 };

describe('FR-1 computeAgenticFitScore', () => {
  it('weights the four dimensions and clamps to 0-100', () => {
    const score = computeAgenticFitScore(HIGH_FIT);
    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('a high-agent-leverage compounding idea outranks a high-market low-fit idea', () => {
    const highFit = computeAgenticFitScore(HIGH_FIT);
    const lowFit = computeAgenticFitScore({ agent_leverage: 20, compounding: 30, kill_speed: 40, attention_economy: 35 });
    expect(highFit).toBeGreaterThan(lowFit);
  });

  it('a very low agent_leverage sinks the composite (near-threshold rule)', () => {
    // Below the floor: composite is scaled by leverage/floor even though other dims are 90.
    const sunk = computeAgenticFitScore(LOW_LEVERAGE);
    const unscaled = Math.round(
      10 * AF_WEIGHTS.agent_leverage + 90 * AF_WEIGHTS.compounding + 90 * AF_WEIGHTS.kill_speed + 90 * AF_WEIGHTS.attention_economy,
    );
    expect(sunk).toBeLessThan(unscaled); // sink applied
    expect(sunk).toBe(Math.round(unscaled * (10 / AGENT_LEVERAGE_FLOOR)));
  });

  it('reads weights from the config argument (SSOT), not hardcoded', () => {
    const custom = computeAgenticFitScore({ agent_leverage: 50, compounding: 50, kill_speed: 50, attention_economy: 50 }, { agent_leverage: 1, compounding: 0, kill_speed: 0, attention_economy: 0 });
    expect(custom).toBe(50); // only agent_leverage counted
  });

  it('clamps out-of-range dimension inputs', () => {
    const s = computeAgenticFitScore({ agent_leverage: 999, compounding: -50, kill_speed: 50, attention_economy: 50 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('FR-2 applyMachineImprovementMultiplier', () => {
  it('applies as a multiplier on top of the composite, not a 5th dimension', () => {
    const { score, bonus } = applyMachineImprovementMultiplier(60, 100);
    expect(bonus).toBeCloseTo(0.5); // max bonus at machine_improvement=100
    expect(score).toBe(90); // 60 * 1.5
  });

  it('lets a high-machine-improvement venture jump the queue past an equal-fit peer', () => {
    const composite = 60;
    const plain = applyMachineImprovementMultiplier(composite, 0).score;
    const jumper = applyMachineImprovementMultiplier(composite, 90).score;
    expect(jumper).toBeGreaterThan(plain);
  });

  it('honors config multiplier params (SSOT)', () => {
    const { bonus } = applyMachineImprovementMultiplier(60, 100, { max_bonus: 1.0 });
    expect(bonus).toBeCloseTo(1.0);
  });
});

describe('FR-3 classifyDisadvantages', () => {
  it('soft down-weights and flags, never returns a hard kill', () => {
    const r = classifyDisadvantages(['capital_heavy']);
    expect(r.downWeightFactor).toBeLessThan(1);
    expect(r.downWeightFactor).toBeGreaterThan(0);
    expect(r.flags).toContain('capital_heavy');
    expect(r).not.toHaveProperty('kill');
  });

  it('flags the structurally-un-agent-able subtypes hardest for chairman review', () => {
    const r = classifyDisadvantages(['requires_large_upfront_capital']);
    expect(r.chairman_review_required).toBe(true);
    expect(r.hardest_flags).toContain('requires_large_upfront_capital');
    expect(r.downWeightFactor).toBeLessThan(0.85); // heavier than a normal disadvantage
  });

  it('a capital-heavy idea is down-weighted + flagged, not killed (scoreAgenticFit)', () => {
    const clean = scoreAgenticFit({ dimensions: HIGH_FIT, machine_improvement: 0, disadvantage_flags: [] });
    const heavy = scoreAgenticFit({ dimensions: HIGH_FIT, machine_improvement: 0, disadvantage_flags: ['capital_heavy'] });
    expect(heavy.agentic_fit_score).toBeLessThan(clean.agentic_fit_score);
    expect(heavy.agentic_fit_score).toBeGreaterThan(0); // not killed
    expect(heavy.disadvantage_flags).toContain('capital_heavy');
  });

  it('ignores unknown flags', () => {
    const r = classifyDisadvantages(['not_a_real_flag']);
    expect(r.downWeightFactor).toBe(1);
    expect(r.flags).toHaveLength(0);
  });
});

describe('FR-4 integration: agentic_fit as a weighted Stage-0 component', () => {
  it('contributes to the weighted venture_score via its profile weight', () => {
    const synthesisResults = { agentic_fit: scoreAgenticFit({ dimensions: HIGH_FIT }) };
    const result = calculateWeightedScore(synthesisResults, { agentic_fit: 1.0 });
    const af = result.breakdown.find((b) => b.component === 'agentic_fit');
    expect(af).toBeTruthy();
    expect(af.raw_score).toBeGreaterThan(80);
    expect(result.total_score).toBeGreaterThan(80);
  });
});

describe('FR-4 secondary: S3 advisory signal (non-kill)', () => {
  it('surfaces agentic_fit as an advisory reason at S3 without killing', () => {
    const record = scoreAgenticFit({ dimensions: HIGH_FIT, disadvantage_flags: ['requires_large_upfront_capital'] });
    const gate = evaluateKillGate({ overallScore: 80, metrics: { marketFit: 80 }, agenticFit: record });
    expect(gate.decision).toBe('pass'); // agentic-fit never forces a kill
    expect(gate.blockProgression).toBe(false);
    const advisory = gate.reasons.find((r) => r.type === 'agentic_fit_advisory');
    expect(advisory).toBeTruthy();
    expect(advisory.chairman_review_required).toBe(true);
  });

  it('buildAgenticFitAdvisory returns null for a missing record', () => {
    expect(buildAgenticFitAdvisory(null)).toBeNull();
  });

  it('does not change the kill decision for a catastrophic score', () => {
    const record = scoreAgenticFit({ dimensions: HIGH_FIT });
    const gate = evaluateKillGate({ overallScore: 10, metrics: { marketFit: 10 }, agenticFit: record });
    expect(gate.decision).toBe('kill'); // agentic-fit advisory never blocks a real kill path
  });
});

describe('FR-5 transparency + FR-6 config', () => {
  it('records every dimension sub-score, flags, and the multiplier', () => {
    const r = scoreAgenticFit({ dimensions: HIGH_FIT, machine_improvement: 70, disadvantage_flags: ['deep_rd_moat'] });
    expect(r.dimension_scores).toEqual({ agent_leverage: 90, compounding: 85, kill_speed: 80, attention_economy: 80 });
    expect(r.machine_improvement).toBe(70);
    expect(r.machine_improvement_bonus).toBeGreaterThan(0);
    expect(r.disadvantage_flags).toContain('deep_rd_moat');
    expect(r.fit_composite).toBeGreaterThan(0);
    expect(r).toHaveProperty('agentic_fit_score');
    expect(r).toHaveProperty('af_band');
  });

  it('honors config weights + multiplier params overrides', () => {
    const r = scoreAgenticFit(
      { dimensions: { agent_leverage: 50, compounding: 50, kill_speed: 50, attention_economy: 50 }, machine_improvement: 100 },
      { weights: { agent_leverage: 1, compounding: 0, kill_speed: 0, attention_economy: 0 }, multiplier_params: { max_bonus: 0 } },
    );
    expect(r.fit_composite).toBe(50);
    expect(r.machine_improvement_bonus).toBe(0); // multiplier disabled via config
  });
});
