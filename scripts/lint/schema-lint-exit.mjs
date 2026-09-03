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
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-2): `snapshotStale` now also blocks.
 *
 * WHY A STALE SNAPSHOT MUST FAIL RATHER THAN WARN: every violation verdict is computed against the
 * COMMITTED snapshot, never the live database. When that snapshot is older than the schema, a run
 * reporting zero violations has not measured schema truth — it has measured agreement with a stale
 * picture, and reports it in the same words it uses for a genuine clean run. The staleness check
 * already existed but emitted console.warn and was never wired into this function, so the one
 * signal that the answer might be meaningless could not affect the answer.
 *
 * PRECEDENCE IS DELIBERATE — degradedFallback still wins. A degraded run is one whose diff base was
 * unresolvable; it already announces itself as advisory and does not assert a pass, so there is no
 * false zero to protect against, and making it block would re-introduce the flaky-fetch
 * false-blocking this module was written to remove.
 *
 * KNOWN LIMITATION — what this decision CANNOT see, stated because an exit helper that looks total
 * invites the assumption that exit 0 means "nothing is wrong":
 *
 *  1. IT CANNOT SEE PRE-EXISTING VIOLATIONS. `violations` is NEW drift only (QF-20260802-742 moved
 *     the backlog into a separate non-blocking `preExisting` list). A run over a file carrying 40
 *     pre-existing phantom references exits 0, correctly by that design and invisibly by this one.
 *  2. IT CANNOT SEE A DEGRADED RUN'S CONTENT. When degradedFallback is true this returns 0 without
 *     consulting violations OR snapshotStale, so a degraded sweep over a stale snapshot with real
 *     drift is indistinguishable here from a clean run. The caller prints that distinction; this
 *     function does not encode it.
 *  3. IT CANNOT SEE AN UNPARSEABLE SNAPSHOT DATE. snapshotStale arrives false when generated_at is
 *     missing or malformed (NaN is not > STALE_DAYS), so a snapshot with no usable date is treated
 *     as fresh. That is deliberate — absence of a date is a different defect from a provably old
 *     one — but it means "not stale" here does not mean "date verified".
 *  4. IT CANNOT SEE WHETHER THE SNAPSHOT MATCHES THE DATABASE. Staleness is measured in DAYS, not
 *     by comparing the snapshot to the live schema. A snapshot regenerated one hour ago against the
 *     wrong database, or a schema that changed twice within the window, both read as fresh.
 *
 * @param {{violations:number, degradedFallback:boolean, snapshotStale:boolean}} state
 * @returns {0|1}
 */
export function computeExitCode({ violations = 0, degradedFallback = false, snapshotStale = false } = {}) {
  if (degradedFallback) return 0; // degraded sweep is advisory — never blocks
  if (snapshotStale) return 1;    // FR-2: a zero measured against a stale snapshot is not a pass
  return violations > 0 ? 1 : 0;
}
