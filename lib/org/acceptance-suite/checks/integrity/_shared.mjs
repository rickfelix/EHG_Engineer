/**
 * EXEC-TO-PLAN SECURITY review finding (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001): the 2
 * A2 integrity checks (base-immutable.mjs, norms-unwritable.mjs) touch a live database with
 * elevated (service-role) credentials and accept an injectable `deps.supabase` / injectable
 * `deps.createDatabaseClient` purely so their own unit tests can mock the database without
 * hitting it (see tests/unit/org/acceptance-suite/integrity-checks.test.mjs). Left unguarded,
 * ANY caller of `check(organization, deps)` -- not just this suite's own tests -- could pass a
 * mock that makes a security-critical check unconditionally report `passed: true` regardless of
 * the real database state.
 *
 * No caller does this today: the only invokers are this suite's own unit tests and
 * run-suite.mjs's runOneCheck(), which calls `check.check(organization)` with NO second
 * argument at all, so `deps` is always `{}` in every currently-wired production/CI path. This
 * guard is defense-in-depth for a future caller (e.g. if this suite were ever exposed via an API
 * endpoint or a less-trusted caller), not a fix for a reachable exploit -- but it costs nothing
 * and matches this repo's established pattern for injectable test-only escape hatches
 * (lib/notifications/transport-test-isolation-guard.js: a test-only behavior is honored ONLY
 * under a test runner, VITEST or NODE_ENV=test, and silently ignored everywhere else).
 */
export function isTestEnvironment() {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
}
