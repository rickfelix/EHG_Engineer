# Singleton Stale-Tree Remediation Policy

**Category**: Protocol
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001
**Last Updated**: 2026-07-02
**Tags**: singleton-sessions, staleness, remediation, adam, solomon, coordinator

## Scope

This doc records the **default remediation policy** for a long-lived singleton
role-session (Adam, Solomon, coordinator) whose `renderFreshness()` check
(see `lib/governance/checkout-freshness.js`, wired into `scripts/adam-startup-check.mjs`,
`scripts/coordinator-startup-check.mjs`, `scripts/solomon-startup-check.mjs`) reports
`STALE-CRITICAL` — meaning the session's own role contract (`CLAUDE_ADAM.md` /
`CLAUDE_SOLOMON.md` / the coordinator's contract doc) or a tick script has drifted
behind `origin/main`.

**This SD is measure/surface only.** No remediation automation is implemented here —
that is deferred to a future SD, per the coordinator co-review's "measure first" guidance.

## Default: SUPERVISED RELAUNCH, not in-place sync

The default remediation for a detected `STALE-CRITICAL` singleton session is
**supervised relaunch** (tear the session down, restart it fresh against the current
`origin/main`) — **not** an in-place `git pull`/checkout while the session keeps running.

### Why in-place sync is unsafe in a shared working tree

`scripts/hooks/concurrent-session-worktree.cjs` (SD-LEO-INFRA-AUTO-INVOKE-WORKTREE-001 /
SD-LEO-INFRA-EXTEND-WORKTREE-ISOLATION-001) exists specifically because two live sessions
sharing one working tree + branch is unsafe: it detects concurrent sessions on the same
repo+branch and auto-isolates the newer one into its own worktree rather than letting them
share and sync one tree. The same hazard applies to a single long-lived session syncing
itself in place — an in-place `git pull`/checkout while the session is mid-tick risks:

- Corrupting the session's own in-flight state (dirty index, a file mid-read by the
  session's tooling, a partially-applied diff).
- Colliding with a sibling session that has since been auto-isolated into a separate
  worktree off the same shared tree (per the concurrent-session-worktree hook), if the
  stale session and the isolated one still reference overlapping paths.

Supervised relaunch avoids both: the session stops ticking, a human/coordinator confirms
the relaunch, and the new session starts clean against current `origin/main` with no
mid-flight state to corrupt.

## Deferred to a future SD

- Automated relaunch triggering (who/what initiates it, and under what confirmation gate).
- In-place sync tooling for cases where a full relaunch is judged unnecessary (e.g. a
  drift confined to a non-critical file).
- Escalation/notification wiring beyond the existing `renderFreshness()` advisory badge
  printed at each singleton's own startup/tick.

## Related

- `lib/governance/checkout-freshness.js` — the underlying freshness gauge (behind-count +
  critical-path diff), from the completed `SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001`.
- `scripts/gauge-unranked-claimable-leaves.mjs` — the standalone-gauge shipping precedent
  this SD follows (the shared invariant-gauges registry+runner,
  `SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001`, has no shipped code yet).
