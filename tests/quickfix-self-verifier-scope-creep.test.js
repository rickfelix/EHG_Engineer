/**
 * Regression tests for QF-20260524-488 / feedback e0cf303f.
 *
 * detectScopeCreep() used to flag a cohesive production+test quick-fix as scope
 * creep, because a test file ("foo.test.js") does not contain the substring of the
 * mentioned production file ("foo.js"). The fix treats a changed test file as
 * in-scope when the production base name it covers matches a changed non-test file
 * or a file mentioned in the issue text — while still flagging genuinely unrelated
 * files (including a test for an unrelated module).
 */
import { describe, it, expect } from 'vitest';
import { detectScopeCreep } from '../lib/quickfix-self-verifier.js';

const qf = (title, description) => ({ title, description });

describe('detectScopeCreep — prod+test pairing (e0cf303f)', () => {
  it('passes a cohesive production + co-located test change', async () => {
    const r = await detectScopeCreep(
      qf('Fix fleet-lock-hash race', 'patch lib/fleet-lock-hash.js'),
      { filesChanged: ['lib/fleet-lock-hash.js', 'lib/fleet-lock-hash.test.js'] }
    );
    expect(r.passed).toBe(true);
  });

  it('passes a test-only change for a module mentioned in the issue', async () => {
    const r = await detectScopeCreep(
      qf('Add coverage for foo', 'add tests for foo.js'),
      { filesChanged: ['tests/unit/foo.test.js'] }
    );
    expect(r.passed).toBe(true);
  });

  it('still FLAGS a test for an unrelated module (real scope creep preserved)', async () => {
    const r = await detectScopeCreep(
      qf('Fix foo', 'patch foo.js'),
      { filesChanged: ['lib/foo.js', 'lib/bar.test.js'] }
    );
    expect(r.passed).toBe(false);
    expect(r.issue).toMatch(/scope creep/i);
  });

  it('still FLAGS an unrelated non-test production file (real scope creep preserved)', async () => {
    const r = await detectScopeCreep(
      qf('Fix foo', 'patch foo.js'),
      { filesChanged: ['lib/foo.js', 'lib/baz.js'] }
    );
    expect(r.passed).toBe(false);
  });
});
