/**
 * SD-FDBK-FIX-CLASSIFY-QUICK-FIX-001 — generator-signature exclusion pins.
 * Pure unit: generatorSignature() extraction + the same-generator pair rule.
 */
import { describe, it, expect } from 'vitest';
import { generatorSignature } from '../../lib/utils/quickfix-rca-integration.js';

const RED_MERGE_A =
  'CI red-merge: main test failures rose 103 -> 113 at 24c8d9034b ' +
  'red-merge:ci_test_failure_count:24c8d9034ba2... Fix the regression. ' +
  'Auto-filed by scripts/ci/red-merge-detector.mjs (SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 FR-3).';
const RED_MERGE_B =
  'CI red-merge: main test failures rose 102 -> 106 at 38c233f94f ' +
  'red-merge:ci_test_failure_count:38c233f94f... Fix the regression. ' +
  'Auto-filed by scripts/ci/red-merge-detector.mjs (SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 FR-3).';

describe('generatorSignature', () => {
  it('extracts the Auto-filed marker (primary)', () => {
    expect(generatorSignature(RED_MERGE_A)).toBe('auto-filed:scripts/ci/red-merge-detector.mjs');
  });

  it('two red-merge siblings share the same signature (excluded pair)', () => {
    expect(generatorSignature(RED_MERGE_A)).toBe(generatorSignature(RED_MERGE_B));
  });

  it('falls back to the strict machine prefix when no Auto-filed marker', () => {
    expect(generatorSignature('red-merge:ci_test_failure_count:abc123 something'))
      .toBe('prefix:red-merge:ci_test_failure_count');
  });

  it('returns null for organic human-filed text (true-positive path preserved)', () => {
    expect(generatorSignature('Fix broken save button on the venture form')).toBeNull();
    expect(generatorSignature('Login fails with 500: token refresh race in auth middleware')).toBeNull();
  });

  // Post-adversarial-review (SD-FDBK-FIX-CLASSIFY-QUICK-FIX-001): the fallback
  // first token must be a kebab-case slug, so log-namespace / timestamp / ratio
  // prefixes do NOT collide and falsely exclude distinct QFs (under-counting
  // recurrence). These no-space-after-colon forms were the uncovered gap.
  it('does NOT match non-kebab log/namespace/timestamp prefixes (no false exclusion)', () => {
    expect(generatorSignature('error:auth_service:cannot read property of undefined')).toBeNull();
    expect(generatorSignature('warn:rate_limiter:exceeded for tenant')).toBeNull();
    expect(generatorSignature('auth:login: user not found')).toBeNull();
    expect(generatorSignature('10:30:00 cron job did not fire')).toBeNull();
    expect(generatorSignature('103:113: test failure ratio')).toBeNull();
  });

  // Trailing punctuation abutting the script path must not split true siblings
  // across signatures (a template edit mid-window would otherwise diverge).
  it('trims trailing punctuation on the auto-filed path so siblings still match', () => {
    const withPeriod = 'X. Auto-filed by scripts/ci/red-merge-detector.mjs.';
    const withParen = 'Y. Auto-filed by scripts/ci/red-merge-detector.mjs (SD-FOO FR-3).';
    expect(generatorSignature(withPeriod)).toBe('auto-filed:scripts/ci/red-merge-detector.mjs');
    expect(generatorSignature(withPeriod)).toBe(generatorSignature(withParen));
  });

  it('different generators do NOT share a signature', () => {
    const other = 'Stale queue item detected. Auto-filed by scripts/ci/stale-queue-detector.mjs';
    expect(generatorSignature(other)).not.toBe(generatorSignature(RED_MERGE_A));
    expect(generatorSignature(other)).toBe('auto-filed:scripts/ci/stale-queue-detector.mjs');
  });

  it('null/non-string input is fail-open null', () => {
    expect(generatorSignature(null)).toBeNull();
    expect(generatorSignature(undefined)).toBeNull();
    expect(generatorSignature(42)).toBeNull();
  });
});
