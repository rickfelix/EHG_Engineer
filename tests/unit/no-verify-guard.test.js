/**
 * Tests for the ENF-16 --no-verify / --no-gpg-sign bypass gate (QF-20260609-774).
 * The gate must block a git command that disables the pre-commit secret scan unless the
 * audited LEO_ALLOW_NO_VERIFY="<reason>" override is set — and must NOT false-block a mere
 * MENTION of the flag (e.g. inside an echo/quoted string), reusing the ENF-15 boundary.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decideNoVerify, NO_VERIFY_RE } = require('../../scripts/hooks/lib/no-verify-guard.cjs');

const NO_OVERRIDE = { LEO_ALLOW_NO_VERIFY: '' };

describe('decideNoVerify — blocking (no override)', () => {
  it('blocks git commit --no-verify', () => {
    const d = decideNoVerify('git commit -m "x" --no-verify', NO_OVERRIDE);
    expect(d).toMatchObject({ matched: true, outcome: 'block', reason: 'no_verify_disallowed', flag: 'no-verify' });
  });

  it('blocks git push --no-verify', () => {
    expect(decideNoVerify('git push origin main --no-verify', NO_OVERRIDE).outcome).toBe('block');
  });

  it('blocks git commit --no-gpg-sign and reports the flag', () => {
    const d = decideNoVerify('git commit --no-gpg-sign -m x', NO_OVERRIDE);
    expect(d.outcome).toBe('block');
    expect(d.flag).toBe('no-gpg-sign');
  });

  it('blocks when git is operative after a shell separator', () => {
    expect(decideNoVerify('cd repo && git commit --no-verify -m x', NO_OVERRIDE).outcome).toBe('block');
    expect(decideNoVerify('false; git push --no-verify', NO_OVERRIDE).outcome).toBe('block');
  });
});

describe('decideNoVerify — audited override', () => {
  it('overrides when LEO_ALLOW_NO_VERIFY carries a non-empty reason', () => {
    const d = decideNoVerify('git commit --no-verify -m x', { LEO_ALLOW_NO_VERIFY: 'QF-123: hook is broken, urgent' });
    expect(d).toMatchObject({ matched: true, outcome: 'override', reason: 'override_granted' });
    expect(d.overrideReason).toBe('QF-123: hook is broken, urgent');
  });

  it('does NOT override when the reason is whitespace-only (blocks)', () => {
    expect(decideNoVerify('git commit --no-verify', { LEO_ALLOW_NO_VERIFY: '   ' }).outcome).toBe('block');
  });

  it('does NOT override when the env var is absent (blocks)', () => {
    expect(decideNoVerify('git commit --no-verify', {}).outcome).toBe('block');
  });
});

describe('decideNoVerify — no false-positives (operative-command boundary)', () => {
  it('does not match a quoted MENTION of the flag (git not operative)', () => {
    expect(decideNoVerify('echo "git commit --no-verify"', NO_OVERRIDE).matched).toBe(false);
  });

  it('does not match a non-git command that contains the flag substring', () => {
    expect(decideNoVerify('grep -- --no-verify scripts/foo.sh', NO_OVERRIDE).matched).toBe(false);
  });

  it('does not match a plain git command without the flag', () => {
    expect(decideNoVerify('git commit -m "normal commit"', NO_OVERRIDE).matched).toBe(false);
    expect(decideNoVerify('git push origin main', NO_OVERRIDE).matched).toBe(false);
  });

  it('requires the flag to be a whitespace-delimited token (not a glued substring)', () => {
    expect(decideNoVerify('git log --grep=--no-verifyish', NO_OVERRIDE).matched).toBe(false);
    expect(NO_VERIFY_RE.test('git commit --no-verify')).toBe(true);
  });
});
