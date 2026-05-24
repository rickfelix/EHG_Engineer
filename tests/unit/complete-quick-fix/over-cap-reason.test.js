/**
 * SD-FDBK-ENH-SOURCE-LOC-CAP-001 — --over-cap-reason granular LOC-cap bypass.
 *
 * Proves the flag bypasses ONLY the source-LOC cap, at BOTH enforcement points
 * (validateLOC in verification.js AND verifyLOCConstraint Check 1 in the self-verifier),
 * while the failing-tests, compliance, and scope-creep gates STILL enforce. The
 * two-enforcement-point coverage matters: session s4 proved a validateLOC-only bypass
 * was insufficient because verifyLOCConstraint independently re-blocks.
 */
import { describe, it, expect } from 'vitest';
import {
  validateLOC,
  validateTests,
  validateCompliance,
  QF_HARD_LOC_CAP
} from '../../../scripts/modules/complete-quick-fix/verification.js';
import { verifyLOCConstraint, detectScopeCreep } from '../../../lib/quickfix-self-verifier.js';
import { parseArguments } from '../../../scripts/modules/complete-quick-fix/cli.js';

const noPrompt = async () => 'no';      // declines escalation / proceed prompts
const OVER = QF_HARD_LOC_CAP + 50;      // safely over the cap

describe('--over-cap-reason — CLI parsing (FR-1)', () => {
  it('parses a non-empty reason into options.overCapReason', () => {
    const { options } = parseArguments(['QF-X', '--over-cap-reason', 'docstring-heavy infra fix']);
    expect(options.overCapReason).toBe('docstring-heavy infra fix');
  });

  it('throws [OVER_CAP_REASON_REQUIRED] on an empty/whitespace reason', () => {
    expect(() => parseArguments(['QF-X', '--over-cap-reason', '   '])).toThrow(/OVER_CAP_REASON_REQUIRED/);
  });

  it('leaves overCapReason undefined when the flag is absent', () => {
    const { options } = parseArguments(['QF-X', '--actual-source-loc', '10']);
    expect(options.overCapReason).toBeUndefined();
  });
});

describe('--over-cap-reason — validateLOC bypass (FR-2)', () => {
  it('bypasses the source-LOC cap when overCapReason is set and over cap', async () => {
    const r = await validateLOC(OVER, 0, 'QF-X', null, noPrompt, { overCapReason: 'justified' });
    expect(r).toBe(true);
  });

  it('still follows the escalation path (blocks) when over cap WITHOUT the flag', async () => {
    const r = await validateLOC(OVER, 0, 'QF-X', null, noPrompt, {});
    expect(r).toBe(false);
  });

  it('does not change within-cap behavior', async () => {
    const r = await validateLOC(10, 0, 'QF-X', null, noPrompt, {});
    expect(r).toBe(true);
  });
});

describe('--over-cap-reason — verifyLOCConstraint demote (FR-3)', () => {
  it('demotes over-cap from a BLOCKER to a non-blocking warning when overCapReason is set', async () => {
    const r = await verifyLOCConstraint({ actual_source_loc: OVER }, { actualSourceLoc: OVER, overCapReason: 'justified' });
    expect(r.passed).toBe(true);
    expect(r.message).toMatch(/over-cap-reason/i);
  });

  it('still BLOCKS over-cap WITHOUT the flag (unchanged behavior)', async () => {
    const r = await verifyLOCConstraint({ actual_source_loc: OVER }, { actualSourceLoc: OVER });
    expect(r.passed).toBe(false);
  });

  it('does not affect a within-cap source LOC', async () => {
    const r = await verifyLOCConstraint({ actual_source_loc: 10 }, { actualSourceLoc: 10, overCapReason: 'irrelevant' });
    expect(r.passed).toBe(true);
  });
});

describe('--over-cap-reason — bypass is LOC-only, other gates STILL enforce (FR-6)', () => {
  it('validateTests still blocks failing tests even with overCapReason in flags', () => {
    const r = validateTests({ passed: false }, { passed: false }, false, { overCapReason: 'justified' });
    expect(r).toBe(false);
  });

  it('validateCompliance still blocks a FAIL verdict even with overCapReason in flags', async () => {
    const r = await validateCompliance(
      { verdict: 'FAIL', totalScore: 40, confidence: 40, criteriaResults: [] },
      noPrompt,
      { overCapReason: 'justified' }
    );
    expect(r).toBe(false);
  });

  it('detectScopeCreep still flags genuine scope creep (overCapReason in context is ignored by it)', async () => {
    const r = await detectScopeCreep(
      { title: 'fix login button', description: 'login-handler.js does not bind onClick' },
      {
        filesChanged: ['scripts/foo/login-handler.js', 'tests/unit/database/payment-ledger.test.js'],
        overCapReason: 'justified'
      }
    );
    expect(r.passed).toBe(false);
  });
});
