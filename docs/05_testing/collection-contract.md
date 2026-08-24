---
Category: Testing
Status: Approved
Version: 1.0.0
Author: Claude (SD-LEO-INFRA-REPO-HYGIENE-PATH-001)
Last Updated: 2026-08-24
Tags: [testing, vitest, collection-contract]
---

# Vitest Collection Contract

SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-3.

## The invariant

**Any directory matched by a `.gitignore` pattern must never be collectible by
vitest.** A gitignored directory is, by construction, invisible to CI (which only
ever operates on a fresh `git clone` / `actions/checkout`) but can still be *present*
on a long-lived local working tree — a worktree checkout, a preserved copy, a full
repo mirror left behind by some other tool. If such a directory contains a
`*.test.js` file and vitest's collection glob doesn't exclude it, a local run
collects and reports on files CI can never see: the exact two-surface divergence
class this contract exists to close.

## Two real prior incidents

Both are recorded in `vitest.config.js`'s own `SHARED_EXCLUDE` comments (kept there
for now — this doc doesn't replace that context, it gives the underlying invariant a
canonical, testable home):

- **QF-20260727-884**: `scratch/` holds preserved worktree copies and is gitignored
  (`.gitignore`'s `/scratch/`). Measured: 887 `scratch/preserved-*` directories
  holding exactly 14 phantom test files — collected locally, invisible to CI.
- **SD-LEO-INFRA-VITEST-TIER-REAL-001**: `.reaper-source/` is a gitignored full repo
  copy. Measured: 3117 phantom collection entries locally that CI never sees.

Both were fixed the same way each time: add the specific directory name to
`vitest.config.js`'s `SHARED_EXCLUDE` array by hand, after the incident was already
felt. Nothing forced that addition *before* either incident, and nothing stops a
third gitignored-copy directory from repeating the pattern.

## What this contract actually changes

Before this SD, `SHARED_EXCLUDE` was a hand-maintained array literal directly inside
`vitest.config.js`, with rich prose comments explaining each entry but no test
coverage proving the array does what its comments claim, and no structural link
back to `.gitignore` at all — a maintainer had to *remember* the invariant and
manually keep the two files in sync.

After this SD:

- **`tests/collection-contract.json`** is the single source of truth for the
  pattern list. Each entry carries `gitignore_backed: true|false` — `true` marks a
  pattern that exists specifically because it corresponds to a real gitignored-copy
  directory (the incident class above); `false` marks an unrelated exclusion
  (source-tree scoping, `.spec.js` routing to Playwright, etc.) that happens to live
  in the same list.
- **`vitest.config.js`** builds `SHARED_EXCLUDE` from this JSON via
  `loadCollectionContractExclude()`, mirroring the file's own pre-existing,
  already-proven `loadQuarantineExclude()` pattern for `tests/quarantine-manifest.json`
  — **not** a new, unproven loading mechanism.
- Unlike the quarantine loader (intentionally fail-*soft*: a missing/corrupt
  manifest quarantines nothing, and the worst case is a previously-red test running
  again), this loader is fail-*safe in the other direction*: a missing or corrupt
  `tests/collection-contract.json` does **not** silently produce an empty exclude
  list (which would immediately reopen both incidents above). `vitest.config.js`
  keeps a small hardcoded `SAFETY_FLOOR_EXCLUDE` (the `gitignore_backed: true`
  subset, verbatim) that always applies regardless of whether the JSON loads —
  the JSON contributes the full curated list in the normal case; the floor is the
  non-negotiable minimum in the degraded case.
- **`tests/unit/vitest-collection-contract.test.js`** is the regression test the
  PRD calls for: it creates a throwaway directory matching a real `.gitignore`
  pattern, drops a trivial `*.test.js` file inside it, and asserts vitest's own
  exclude-glob matcher (via `micromatch`, the same matcher vitest uses internally
  for `exclude`) refuses to collect it. It also asserts the same file *would* be
  collected if the collection-contract's gitignore-backed patterns were stripped out
  — proving the check is load-bearing, not a tautology that always passes.

## Maintaining this contract

Adding a new gitignored-copy-directory exclusion:

1. Add the entry to `tests/collection-contract.json`'s `patterns` array (with
   `gitignore_backed: true` and a `reason`).
2. If it's a directory whose absence would reopen a real incident class (like
   `scratch/` or `.reaper-source/`), also add it to `vitest.config.js`'s
   `SAFETY_FLOOR_EXCLUDE`.
3. No change to `tests/unit/vitest-collection-contract.test.js` is needed — it
   exercises the mechanism generically, not any specific directory name.
