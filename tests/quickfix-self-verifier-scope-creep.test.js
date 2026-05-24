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

/**
 * Regression tests for QF-20260524-272 / feedback f5577d22.
 *
 * The e0cf303f fix only matched EXACT sibling base names, so a test named after the
 * bug TOPIC (e.g. `auto-route-phase-count.test.js`) rather than the production file it
 * covers (`auto-route-decider.js`) still false-flagged the cohesive pair as scope
 * creep. detectScopeCreep now also relates a test by a shared topic token or directory
 * segment — while a genuinely unrelated test (CONTROL) still flags, and production
 * files keep strict detection.
 */
describe('detectScopeCreep — topic / directory relatedness (f5577d22)', () => {
  it('passes a topic-named test that shares a token with the changed prod file (QF-418)', async () => {
    const r = await detectScopeCreep(
      qf('auto-route counts prose-string char length', 'Array.isArray guard in auto-route-decider.js'),
      {
        filesChanged: [
          'scripts/modules/leo-create-sd/auto-route-decider.js',
          'tests/unit/auto-route-phase-count.test.js'
        ]
      }
    );
    expect(r.passed).toBe(true);
  });

  it('passes a test in a directory mirroring the changed prod module (QF-057-style)', async () => {
    const r = await detectScopeCreep(
      qf('complete-quick-fix LOC misreport', 'split LOC in git-operations.js'),
      {
        filesChanged: [
          'scripts/modules/complete-quick-fix/git-operations.js',
          'tests/unit/complete-quick-fix/loc-cap-accuracy.test.js'
        ]
      }
    );
    expect(r.passed).toBe(true);
  });

  it('recognizes the topic-test as in-scope even when prod files legitimately flag (QF-337)', async () => {
    // The description names precompact-unified.js (dead code per RCA); the fix touched
    // different prod files, so THOSE still flag — but the topic-named test must not.
    const r = await detectScopeCreep(
      qf('PreCompact hook wipes protocol-read tracking', 'precompact-unified.js is dead; fix the wired precompact-snapshot hook'),
      {
        filesChanged: [
          'lib/context/unified-state-manager.js',
          'scripts/hooks/precompact-snapshot.ps1',
          'tests/unit/precompact-protocol-read-preservation.test.js'
        ]
      }
    );
    expect(r.passed).toBe(false); // prod files (description-named-wrong-file) still flag
    expect(r.details || '').not.toContain('precompact-protocol-read-preservation.test.js');
  });

  it('still FLAGS a genuinely unrelated test — no shared token or directory (CONTROL)', async () => {
    const r = await detectScopeCreep(
      qf('fix login button onClick', 'login-handler.js does not bind onClick'),
      {
        filesChanged: [
          'scripts/foo/login-handler.js',
          'tests/unit/database/payment-ledger.test.js'
        ]
      }
    );
    expect(r.passed).toBe(false);
    expect(r.details || '').toContain('payment-ledger.test.js');
  });

  it('does NOT relate two unrelated files via the shared generic tests/unit directory (CONTROL)', async () => {
    const r = await detectScopeCreep(
      qf('fix alpha-service', 'patch alpha-service.js'),
      {
        filesChanged: [
          'src/svc/alpha-service.js',
          'tests/unit/beta-widget.test.js'
        ]
      }
    );
    expect(r.passed).toBe(false);
  });
});
