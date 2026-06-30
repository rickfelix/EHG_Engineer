/**
 * solomon-triage.test.js — SD-LEO-INFRA-SOLOMON-CONSULT-001B (Solomon Phase B)
 *
 * Network-free unit tests for lib/coordinator/solomon-triage.cjs.
 * Covers:
 *   - TRUE eligibility: rcaCount>=2, toolAttempts>=3, rcaCount=5
 *   - FALSE eligibility: first encounter, sub-threshold values
 *   - ADVERSARIAL (false-eligible trap): spec-conflict/arch-ambiguity without
 *     selfResolutionAttemptLogged must be ineligible; WITH it must be eligible
 *   - BOUNDARY: exactly at threshold values (inclusive)
 *   - AUDITABILITY: triage_score (number 0-100) + non-empty reason always
 *     present for both eligible AND rejected results
 *   - TOTALITY: never throws on undefined/null/NaN/no-arg input
 *   - isSolomonEligible: boolean wrapper matches evaluateSolomonTriage.eligible
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  evaluateSolomonTriage,
  isSolomonEligible,
  RCA_THRESHOLD,
  GATE_FAIL_THRESHOLD,
} = require('../../lib/coordinator/solomon-triage.cjs');

// ── TRUE eligibility ──────────────────────────────────────────────────────────

describe('evaluateSolomonTriage — TRUE eligibility', () => {
  it('rcaCount=2 → eligible (RCA_THRESHOLD reached, score=90)', () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: 2 });
    expect(result.eligible).toBe(true);
    expect(result.triage_score).toBe(90);
  });

  it('rcaCount=5 → eligible (above RCA_THRESHOLD, score=90)', () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: 5 });
    expect(result.eligible).toBe(true);
    expect(result.triage_score).toBe(90);
  });

  it('toolAttempts=3 → eligible (GATE_FAIL_THRESHOLD reached, score=85)', () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: 3 });
    expect(result.eligible).toBe(true);
    expect(result.triage_score).toBe(85);
  });
});

// ── FALSE eligibility ─────────────────────────────────────────────────────────

describe('evaluateSolomonTriage — FALSE eligibility', () => {
  it('first encounter {toolAttempts:0, rcaCount:0} → NOT eligible', () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: 0, rcaCount: 0 });
    expect(result.eligible).toBe(false);
  });

  it('rcaCount=1 → NOT eligible (one below RCA_THRESHOLD)', () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: 1 });
    expect(result.eligible).toBe(false);
  });

  it('toolAttempts=2 → NOT eligible (one below GATE_FAIL_THRESHOLD)', () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: 2 });
    expect(result.eligible).toBe(false);
  });
});

// ── ADVERSARIAL — the false-eligible trap ─────────────────────────────────────

describe('evaluateSolomonTriage — ADVERSARIAL (false-eligible trap)', () => {
  it('spec-conflict WITHOUT selfResolutionAttemptLogged=false → NOT eligible', () => {
    const result = evaluateSolomonTriage(
      'sig',
      { toolAttempts: 0, rcaCount: 0, selfResolutionAttemptLogged: false },
      { type: 'spec-conflict' }
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('spec-conflict');
    expect(result.reason).toContain('selfResolutionAttemptLogged');
  });

  it('spec-conflict WITH selfResolutionAttemptLogged=true → eligible (score=75)', () => {
    const result = evaluateSolomonTriage(
      'sig',
      { toolAttempts: 0, rcaCount: 0, selfResolutionAttemptLogged: true },
      { type: 'spec-conflict' }
    );
    expect(result.eligible).toBe(true);
    expect(result.triage_score).toBe(75);
  });

  it('arch-ambiguity WITHOUT selfResolutionAttemptLogged → NOT eligible', () => {
    const result = evaluateSolomonTriage(
      'sig',
      { toolAttempts: 0, rcaCount: 0, selfResolutionAttemptLogged: false },
      { type: 'arch-ambiguity' }
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('arch-ambiguity');
    expect(result.reason).toContain('selfResolutionAttemptLogged');
  });

  it('arch-ambiguity WITH selfResolutionAttemptLogged=true → eligible (score=75)', () => {
    const result = evaluateSolomonTriage(
      'sig',
      { toolAttempts: 0, rcaCount: 0, selfResolutionAttemptLogged: true },
      { type: 'arch-ambiguity' }
    );
    expect(result.eligible).toBe(true);
    expect(result.triage_score).toBe(75);
  });

  it('spec-conflict without selfResolutionAttemptLogged (omitted, not false) → NOT eligible', () => {
    // selfResolutionAttemptLogged absent (undefined) must also be false-eligible-safe
    const result = evaluateSolomonTriage('sig', {}, { type: 'spec-conflict' });
    expect(result.eligible).toBe(false);
  });
});

// ── BOUNDARY ──────────────────────────────────────────────────────────────────

describe('evaluateSolomonTriage — BOUNDARY (inclusive at threshold)', () => {
  it(`exactly rcaCount=${RCA_THRESHOLD} → eligible`, () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: RCA_THRESHOLD });
    expect(result.eligible).toBe(true);
  });

  it(`exactly toolAttempts=${GATE_FAIL_THRESHOLD} → eligible`, () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: GATE_FAIL_THRESHOLD });
    expect(result.eligible).toBe(true);
  });

  it(`rcaCount=${RCA_THRESHOLD - 1} → NOT eligible (one below boundary)`, () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: RCA_THRESHOLD - 1 });
    expect(result.eligible).toBe(false);
  });

  it(`toolAttempts=${GATE_FAIL_THRESHOLD - 1} → NOT eligible (one below boundary)`, () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: GATE_FAIL_THRESHOLD - 1 });
    expect(result.eligible).toBe(false);
  });
});

// ── AUDITABILITY ──────────────────────────────────────────────────────────────

describe('evaluateSolomonTriage — AUDITABILITY', () => {
  it('eligible result carries a numeric triage_score (0-100) and non-empty reason', () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: 2 });
    expect(result.eligible).toBe(true);
    expect(typeof result.triage_score).toBe('number');
    expect(result.triage_score).toBeGreaterThanOrEqual(0);
    expect(result.triage_score).toBeLessThanOrEqual(100);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('rejected result carries a numeric triage_score (0-100) and non-empty reason', () => {
    const result = evaluateSolomonTriage('sig', { toolAttempts: 0, rcaCount: 0 });
    expect(result.eligible).toBe(false);
    expect(typeof result.triage_score).toBe('number');
    expect(result.triage_score).toBeGreaterThanOrEqual(0);
    expect(result.triage_score).toBeLessThanOrEqual(100);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('rejected spec-conflict reason explicitly mentions the missing self-resolution requirement', () => {
    const result = evaluateSolomonTriage(
      'sig',
      { selfResolutionAttemptLogged: false },
      { type: 'spec-conflict' }
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/selfResolutionAttemptLogged/);
    expect(result.reason).toMatch(/spec-conflict/);
  });

  it('rejected generic case reason mentions both threshold values', () => {
    const result = evaluateSolomonTriage('sig', { rcaCount: 1, toolAttempts: 1 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/rcaCount/);
    expect(result.reason).toMatch(/toolAttempts/);
  });
});

// ── TOTALITY — never throws on garbage input ──────────────────────────────────

describe('evaluateSolomonTriage — TOTALITY (never throws)', () => {
  it('no arguments at all → does not throw, returns eligible=false', () => {
    expect(() => evaluateSolomonTriage()).not.toThrow();
    const result = evaluateSolomonTriage();
    expect(result.eligible).toBe(false);
    expect(typeof result.triage_score).toBe('number');
    expect(typeof result.reason).toBe('string');
  });

  it('undefined state → does not throw, returns eligible=false', () => {
    expect(() => evaluateSolomonTriage('sig', undefined)).not.toThrow();
    expect(evaluateSolomonTriage('sig', undefined).eligible).toBe(false);
  });

  it('{toolAttempts:NaN} → coerces to 0, does not throw, returns eligible=false', () => {
    expect(() => evaluateSolomonTriage('sig', { toolAttempts: NaN })).not.toThrow();
    const result = evaluateSolomonTriage('sig', { toolAttempts: NaN });
    expect(result.eligible).toBe(false);
  });

  it('null state → does not throw, returns eligible=false', () => {
    expect(() => evaluateSolomonTriage('sig', null)).not.toThrow();
    expect(evaluateSolomonTriage('sig', null).eligible).toBe(false);
  });

  it('null context → does not throw, returns eligible=false', () => {
    expect(() => evaluateSolomonTriage('sig', {}, null)).not.toThrow();
    expect(evaluateSolomonTriage('sig', {}, null).eligible).toBe(false);
  });
});

// ── isSolomonEligible — boolean convenience wrapper ───────────────────────────

describe('isSolomonEligible', () => {
  it('returns true when evaluateSolomonTriage would return eligible=true', () => {
    expect(isSolomonEligible('sig', { rcaCount: 2 })).toBe(true);
    expect(isSolomonEligible('sig', { rcaCount: 2 })).toBe(
      evaluateSolomonTriage('sig', { rcaCount: 2 }).eligible
    );
  });

  it('returns false when evaluateSolomonTriage would return eligible=false', () => {
    expect(isSolomonEligible('sig', { rcaCount: 0 })).toBe(false);
    expect(isSolomonEligible('sig', { rcaCount: 0 })).toBe(
      evaluateSolomonTriage('sig', { rcaCount: 0 }).eligible
    );
  });

  it('matches evaluateSolomonTriage on the adversarial spec-conflict without self-resolution', () => {
    const eligible = isSolomonEligible('sig', {}, { type: 'spec-conflict' });
    const full = evaluateSolomonTriage('sig', {}, { type: 'spec-conflict' });
    expect(eligible).toBe(full.eligible);
    expect(eligible).toBe(false);
  });

  it('matches evaluateSolomonTriage on spec-conflict WITH self-resolution', () => {
    const eligible = isSolomonEligible('sig', { selfResolutionAttemptLogged: true }, { type: 'spec-conflict' });
    const full = evaluateSolomonTriage('sig', { selfResolutionAttemptLogged: true }, { type: 'spec-conflict' });
    expect(eligible).toBe(full.eligible);
    expect(eligible).toBe(true);
  });
});
