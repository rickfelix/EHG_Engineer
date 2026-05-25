/**
 * SD-FDBK-ENH-COMPLETE-QUICK-FIX-001 — --accept-low-confidence granular bypass.
 *
 * Proves the flag clears ONLY the self-verification LOW-CONFIDENCE "Proceed anyway?" prompt
 * (validateSelfVerification, confidence<80 branch) while verification BLOCKERS still gate.
 * Mirrors the --over-cap-reason / --accept-compliance-warn granular-bypass pattern: narrow by
 * construction, unlike --force-complete (which also clears blockers/LOC/compliance).
 */
import { describe, it, expect, vi } from 'vitest';
import { validateSelfVerification } from '../../../scripts/modules/complete-quick-fix/verification.js';
import { parseArguments } from '../../../scripts/modules/complete-quick-fix/cli.js';

const lowConfidence = () => ({ passed: true, confidence: 70, warnings: ['scope creep detected'], blockers: [] });
const withBlocker  = () => ({ passed: false, confidence: 50, warnings: [], blockers: ['Other tests now failing'] });

describe('--accept-low-confidence — CLI parsing (FR-1 / AC-4)', () => {
  it('maps the flag + reason into options.acceptLowConfidence and options.reason', () => {
    const { options } = parseArguments(['QF-X', '--accept-low-confidence', '--reason', 'CI run; warning is scope-only']);
    expect(options.acceptLowConfidence).toBe(true);
    expect(options.reason).toBe('CI run; warning is scope-only');
  });

  it('throws [ACCEPT_LOW_CONFIDENCE_NO_REASON] when the flag is set without --reason', () => {
    expect(() => parseArguments(['QF-X', '--accept-low-confidence'])).toThrow(/ACCEPT_LOW_CONFIDENCE_NO_REASON/);
  });

  it('leaves acceptLowConfidence false when the flag is absent', () => {
    const { options } = parseArguments(['QF-X', '--pr-url', 'https://example/pull/1']);
    expect(options.acceptLowConfidence).toBe(false);
  });
});

describe('--accept-low-confidence — clears ONLY the low-confidence prompt (FR-3 / AC-1, AC-2)', () => {
  it('returns true WITHOUT prompting when confidence<80 and the flag+reason are set', async () => {
    const prompt = vi.fn(async () => 'no'); // would decline if ever called
    const result = await validateSelfVerification(lowConfidence(), prompt, { acceptLowConfidence: true, reason: 'ci' });
    expect(result).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('still gates (prompts) when confidence<80 and the flag is absent — default behavior preserved', async () => {
    const prompt = vi.fn(async () => 'no');
    const result = await validateSelfVerification(lowConfidence(), prompt, {});
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it('proceeds when the operator answers yes at the default prompt', async () => {
    const prompt = vi.fn(async () => 'yes');
    const result = await validateSelfVerification(lowConfidence(), prompt, {});
    expect(result).toBe(true);
  });
});

describe('--accept-low-confidence — narrowness guarantee: blockers STILL gate (FR-5 / AC-3)', () => {
  it('does NOT bypass a verification blocker (passed=false) — returns false even with the flag', async () => {
    const prompt = vi.fn(async () => 'yes');
    const result = await validateSelfVerification(withBlocker(), prompt, { acceptLowConfidence: true, reason: 'ci' });
    expect(result).toBe(false);
  });

  it('only --force-complete bypasses a blocker (sanity check that the blocker path is force-only)', async () => {
    const prompt = vi.fn(async () => 'no');
    const result = await validateSelfVerification(withBlocker(), prompt, { forceComplete: true, reason: 'merged PR' });
    expect(result).toBe(true);
  });
});
