/**
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 — regression coverage for a ship-gate adversarial-review
 * finding: scripts/sd-park.js (the real operator-facing park CLI) never threaded reviewAt/
 * releaseCondition/writingSessionId/supabaseForViolationLog into lib/sd-park.js's park(), even
 * though park() itself fully supported them and was fully unit-tested in isolation. Net effect
 * before this fix: observe mode never logged a calibration row for a real CLI park, and enforce
 * mode (once armed) would have made every CLI park throw with no way to satisfy it.
 *
 * scripts/sd-park.js calls `main()` at module load time (no export, real DB connections), so it
 * cannot be imported directly in a unit test -- mirrors the flag() extraction logic instead,
 * matching the established precedent in tests/unit/fleet/vision-key-stamp-at-creation.test.js.
 *
 * Round-2 adversarial verification of the fix above found a NEW defect: the CLI's Supabase-js
 * client for observe-mode violation logging was constructed unconditionally and uncaught, so a
 * `park` invocation with only DB creds configured (no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY --
 * genuinely independent credentials from this CLI's pre-existing createDatabaseClient() pg path)
 * would now throw where it worked before -- contradicting this file's own "unchanged behavior"
 * docstring. Fixed with a try/catch degrading to null (logHoldStateViolation() already no-ops on
 * a falsy client). (Manually confirmed during round-2 review against the real installed
 * @supabase/supabase-js that a missing url/key does throw synchronously — createClient(undefined,
 * undefined) -> "supabaseUrl is required.".) The second describe block below tests the try/catch
 * GUARD itself against a generic throwing factory rather than importing the real client module —
 * pinning the guard's own fail-soft contract without coupling a permanent unit test to a vendored
 * dependency's exact validation behavior/message (which is the vendor's to change), and without
 * tripping scripts/audit-db-test-guards.mjs's DB_MODULE_SPECIFIER (this file touches no DB).
 */
import { describe, it, expect } from 'vitest';

// Mirrors scripts/sd-park.js's flag() helper exactly.
function flag(rest, name) {
  const i = rest.indexOf('--' + name);
  return i >= 0 ? rest[i + 1] : undefined;
}

describe('sd-park.js CLI — --review-at/--release-condition extraction', () => {
  it('extracts both new flags alongside the pre-existing --reason/--actor', () => {
    const rest = ['--reason', 'blocked on vendor', '--actor', 'PLAN', '--review-at', '2026-08-01T00:00:00Z', '--release-condition', 'vendor replies'];
    expect(flag(rest, 'reason')).toBe('blocked on vendor');
    expect(flag(rest, 'actor')).toBe('PLAN');
    expect(flag(rest, 'review-at')).toBe('2026-08-01T00:00:00Z');
    expect(flag(rest, 'release-condition')).toBe('vendor replies');
  });

  it('both new flags are independently optional (the pre-existing --reason-only call shape)', () => {
    const rest = ['--reason', 'blocked on vendor'];
    expect(flag(rest, 'review-at')).toBeUndefined();
    expect(flag(rest, 'release-condition')).toBeUndefined();
  });

  it('the park() opts object built from argv matches the shape park() actually consumes', () => {
    const rest = ['--reason', 'r', '--review-at', '2026-08-01T00:00:00Z', '--release-condition', 'c'];
    const reason = flag(rest, 'reason');
    const reviewAt = flag(rest, 'review-at');
    const releaseCondition = flag(rest, 'release-condition');
    const opts = { reason, actor: flag(rest, 'actor') || 'cli', reviewAt, releaseCondition };
    expect(opts).toEqual({ reason: 'r', actor: 'cli', reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'c' });
  });
});

// Mirrors scripts/sd-park.js's try/catch-guarded client construction exactly (round-2 fix),
// parameterized over the factory so this test never has to import a real DB client module.
function buildGuarded(factory) {
  try {
    return factory();
  } catch {
    return null;
  }
}

describe('sd-park.js CLI — violation-log client construction is fail-soft (round-2 fix)', () => {
  it('a throwing factory (e.g. missing creds) degrades to null instead of propagating', () => {
    const throwing = () => { throw new Error('supabaseUrl is required.'); };
    expect(buildGuarded(throwing)).toBeNull();
  });

  it('a non-throwing factory (the common, already-working valid-creds case) is returned untouched', () => {
    const fakeClient = { from: () => ({}) };
    expect(buildGuarded(() => fakeClient)).toBe(fakeClient);
  });

  it('the guard does not swallow anything beyond the factory call itself — a downstream error still propagates', () => {
    const client = buildGuarded(() => ({ boom: () => { throw new Error('unrelated downstream failure'); } }));
    expect(() => client.boom()).toThrow(/unrelated downstream failure/);
  });
});
