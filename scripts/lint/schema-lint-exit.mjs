/**
 * Pure exit-decision helper for the schema-reference lint.
 * SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001 (FR-1/FR-3).
 *
 * A --diff run whose base is UNRESOLVABLE (a flaky/partial CI fetch) falls back
 * to a whole-repo sweep (degradedFallback=true). That sweep re-surfaces the
 * pre-existing phantom backlog, NOT new drift, so it must NOT block the PR.
 * The run already knows it is degraded; this helper makes the EXIT honor it:
 * a degraded run is ADVISORY (exit 0) regardless of violation count, while a
 * resolvable-base run keeps full diff-scoped blocking (exit 1 on violations).
 *
 * An explicit `--all` run sets degradedFallback=false (the flag is set only in
 * the --diff catch), so its exit behavior is unchanged.
 *
 * @param {{violations:number, degradedFallback:boolean}} state
 * @returns {0|1}
 */
export function computeExitCode({ violations = 0, degradedFallback = false } = {}) {
  if (degradedFallback) return 0; // degraded sweep is advisory — never blocks
  return violations > 0 ? 1 : 0;
}
