// QF-20260508-407: validateCompliance --force-complete short-circuit.
// RCA: 5-witness wedge (QF-230, -988, -997, -403, -517) — SD-FDBK FR-2 patched
// validateLOC + validateSelfVerification with {forceComplete} but missed
// validateCompliance (3rd structurally-identical sibling).
// 6th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateCompliance } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const passResults = {
  verdict: 'PASS',
  totalScore: 100,
  confidence: 100,
  criteriaResults: []
};

const warnResults = {
  verdict: 'WARN',
  totalScore: 80,
  confidence: 80,
  criteriaResults: [
    { name: 'LOC Constraint Met (≤50)', score: 0, maxScore: 10, passed: false, evidence: 'Actual LOC: 55' },
    { name: 'Linting Passes', score: 0, maxScore: 5, passed: false, evidence: 'Linting failed' }
  ]
};

const failResults = {
  verdict: 'FAIL',
  totalScore: 30,
  confidence: 30,
  criteriaResults: [
    { name: 'Tests Pass', score: 0, maxScore: 30, passed: false, evidence: 'Tests failing' }
  ]
};

describe('QF-20260508-407: validateCompliance honors {forceComplete} on WARN verdict', () => {
  it('PASS verdict returns true without prompting (baseline regression check)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt should not be called on PASS'); });
    const r = await validateCompliance(passResults, prompt);
    expect(r).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('FAIL verdict returns false without prompting (baseline regression check)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt should not be called on FAIL'); });
    const r = await validateCompliance(failResults, prompt);
    expect(r).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('WARN verdict WITHOUT forceComplete still prompts (legacy interactive behavior preserved)', async () => {
    const prompt = vi.fn(async () => 'yes');
    const r = await validateCompliance(warnResults, prompt);
    expect(r).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('WARN verdict WITHOUT forceComplete cancels on "no" (legacy interactive behavior preserved)', async () => {
    const prompt = vi.fn(async () => 'no');
    const r = await validateCompliance(warnResults, prompt);
    expect(r).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('WARN verdict WITH forceComplete:true short-circuits and skips prompt (the fix)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt MUST NOT be called when forceComplete:true'); });
    const r = await validateCompliance(warnResults, prompt, { forceComplete: true, reason: 'PR merged audit-trailed' });
    expect(r).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('WARN verdict WITH forceComplete:true logs the bypass reason for audit', async () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    const prompt = vi.fn(() => { throw new Error('prompt should not be called'); });
    await validateCompliance(warnResults, prompt, { forceComplete: true, reason: 'audited bypass reason' });
    const audit = logs.find(l => l.includes('--force-complete') && l.includes('audited bypass reason'));
    expect(audit).toBeTruthy();
  });

  it('default flags = {} parameter does not break existing 2-arg callers', async () => {
    const prompt = vi.fn(async () => 'yes');
    // Call with only 2 args — function should still work as before
    const r = await validateCompliance(warnResults, prompt);
    expect(r).toBe(true);
  });

  it('forceComplete:false explicitly passed still prompts (does not bypass)', async () => {
    const prompt = vi.fn(async () => 'yes');
    const r = await validateCompliance(warnResults, prompt, { forceComplete: false });
    expect(r).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
  });
});

describe('QF-20260508-407: orchestrator.js wires forceComplete through to validateCompliance', () => {
  // Static-pattern check — orchestrator passes flags to validateCompliance.
  it('orchestrator.js call site forwards {forceComplete, reason} to validateCompliance', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const orchestrator = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/modules/complete-quick-fix/orchestrator.js'),
      'utf8'
    );
    expect(orchestrator).toMatch(
      /validateCompliance\([^)]*complianceResults[^)]*prompt[^)]*,\s*\{[^}]*forceComplete[^}]*reason[^}]*\}/s
    );
  });
});
