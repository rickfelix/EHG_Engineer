# Protected Unit Suites

Path-scoped, **blocking** CI gates for unit-test directories that are verified green,
so they cannot silently re-rot.

## Metadata

- **Source SD**: SD-LEO-INFRA-PATH-SCOPED-BLOCKING-001
- **Effective**: 2026-06-01
- **Status**: ACTIVE
- **Workflow**: [`.github/workflows/protected-unit-suites.yml`](../../.github/workflows/protected-unit-suites.yml)
- **Generalizes**: `can-auto-advance-tests.yml`, `s19-design-prompts-tests.yml`
- **Complements (does NOT replace)**: SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 (the suite-wide ratchet; completed)

## Why this exists

The broad unit suite runs **advisory** in CI: `test-coverage.yml` executes it with
`continue-on-error: true`, and its authoritative gate is a **count-based, suite-wide
delta** (`scripts/compare-to-main-snapshot.mjs`) that compares only the *total*
`numFailedTests` against the latest `main` snapshot and rewrites that baseline on every
push to main.

That design is correct for burning down the ~500 pre-existing failures without blocking
unrelated PRs — but it **cannot protect a specific freshly-greened directory** from
re-rotting: a handful of new failures in one area hides inside the global count, or is
offset by a same-PR fix elsewhere. That is exactly how 44 stage-zero unit tests drifted
red on `main` unnoticed (repaired by **SD-LEO-INFRA-REPAIR-STALE-STAGE-001**, PR #4158).

The repo already protects two *individual* high-value test files with dedicated
path-scoped **blocking** workflows (`can-auto-advance-tests.yml`,
`s19-design-prompts-tests.yml`). This workflow **generalizes that proven pattern** into a
single matrix-driven file so any provably-green directory can be locked in cheaply.

## How it works

`protected-unit-suites.yml` has a job-level `strategy.matrix.suite` list. Each entry maps
a directory `name` to a vitest `test_path`. On a PR that touches any protected path, the
workflow triggers and runs `npx vitest run <test_path>` for each entry as a **blocking**
job (no `continue-on-error`): any failing test = a red check. The check name is
`protected-unit-suites / <name>`.

This is **stricter and directory-scoped** — the opposite of the count-based, suite-wide
ratchet. It does not touch `test-coverage.yml` or the ratchet.

## What is gated today

| Directory | Files | Status |
|-----------|------:|--------|
| `tests/unit/eva/stage-zero/` | 36 | **Gated** — 553/0 green (seed; PR #4158). Verified green with `CI_TEARDOWN_PERSIST` both set and unset (hermetic). |

## Admission criterion (READ BEFORE ADDING A DIRECTORY)

> A directory may be added to the matrix **only after its tests are verified green in CI
> across ≥2 consecutive runs** — not on the strength of a single local run.

**Why the discipline:** "green right now" is not the same as "safe to hard-gate." Much of
the broad suite is only intermittently green (env/timing-dependent; see the
`tests/setup.js` invalid-host fallback note in `test-coverage.yml`). A **flaky blocking
gate is strictly worse than no gate** — it red-lights unrelated PRs and erodes trust in
CI. Earn each gate with verified stability.

## How to add a protected directory

It is a two-list edit:

1. Confirm the directory has been **green in CI for ≥2 consecutive runs**.
2. Add one entry to `strategy.matrix.suite`:
   ```yaml
   - name: <short-name>
     test_path: tests/unit/<dir>/
   ```
3. Append that directory's **production** and **test** globs to `on.pull_request.paths`
   (both — a prod-only change that breaks the suite must still trip the gate):
   ```yaml
   - 'lib/<prod-dir>/**'
   - 'tests/unit/<dir>/**'
   ```
4. (Optional, to make the check *block* merge) ask a repo admin to add
   `protected-unit-suites / <name>` to the branch-protection **required status checks**.

## Making a check block merge

The workflow produces a red/green check. To make a red check actually **block merge**, a
repo admin adds `protected-unit-suites / <name>` to the branch-protection required status
checks — a one-time activation, analogous to enabling a feature flag. (The two precedent
workflows are activated the same way.)

## Cross-trigger tradeoff

`on.pull_request.paths` is a **union** across all entries, so a PR touching directory A
also runs directory B's job. With the admission criterion (≥2 green CI runs) this is safe
— admitted directories rarely false-red, and a genuine regression in B *should* surface.
If coupling ever becomes a problem, switch to per-job path isolation (e.g.
`dorny/paths-filter@v3` keyed per suite); this is a deliberate future option, not needed
for the current seed.

## Deferred candidates (audited 2026-06-01, NOT yet admitted)

Local-only audit (`CI_TEARDOWN_PERSIST` unset). None are admitted — each must first meet
the ≥2-green-CI-runs criterion. Directories with pre-existing failures belong to the
suite-wide ratchet's burndown (SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001), not here.

| Directory | Local result | Reason deferred |
|-----------|--------------|-----------------|
| `tests/unit/orchestrator-child/` | 16/16 green (local) | **Candidate** — promote after ≥2 green CI runs |
| `tests/unit/sub-agents/` | 1 failed / 140 | Has a pre-existing failure; repair before admitting |
| `tests/unit/gates/` | 3 failed / 218 | Pre-existing failures; repair before admitting |
| `tests/unit/risk-classifier/` | 5 failed / 137 | Pre-existing failures; repair before admitting |

(Other high-value directories — `handoff`, `complete-quick-fix`, `governance`, `scripts`,
`lib` — are not yet audited and remain candidates pending a green-state check.)

## Relationship to the suite-wide ratchet

This gate is **complementary** to SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 (completed), which
owns the advisory suite + count-based delta and returns to strict mode at ≤100 main
failures. This workflow does not modify `test-coverage.yml`, the ratchet, or any
production code — it only locks in corners that are provably green so they cannot regress
before the ratchet sunsets.

## Rollback

Revert the commit that adds (or extends) this workflow. No production, migration, or data
impact.
