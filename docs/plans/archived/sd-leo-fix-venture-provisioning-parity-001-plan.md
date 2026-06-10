<!-- Archived from: C:/Users/rickf/.claude/plans/venture-provisioning-parity-test-teardown.md -->
<!-- SD Key: SD-LEO-FIX-VENTURE-PROVISIONING-PARITY-001 -->
<!-- Archived at: 2026-06-06T12:23:25.006Z -->

# Plan: Venture-provisioning parity tests must tear down / flag their test ventures (parity-test-* pollute the Ventures route)

<!-- target_application: EHG_Engineer -->

## Type
fix

## Priority
high

## Target Application
EHG_Engineer

## Summary

The venture-provisioning **parity/conformance test** creates real test ventures (named `parity-test-cli-*`, `parity-test-frontend-*`, `parity-test-drift-*`) using the **same provisioning machinery real ventures use** — `provisionVenture` in `lib/eva/bridge/venture-provisioner.js`, driven by `lib/eva/stage-execution-worker.js`. Provisioning creates a `ventures` row plus a **private GitHub repo** (described `EHG Venture: parity-test-…`) and a local clone at `_EHG/<repoName>`, but the test **never tears these down**, so they accumulate in the product's **Ventures route** as fake "Active" ventures.

Five residual test ventures were found and manually purged this session (created 2026-06-01 / 06-04 / 06-06); their on-disk clones were also observed under `_EHG/` (`parity-test-cli-1780570755678`, `parity-test-cli-1780713510961`, `parity-test-drift-1780309227622`, `parity-test-frontend-1780570755678`, `parity-test-frontend-1780713510961`). Each row has `origin_type='manual'`, `repo_url IS NULL`, `is_demo=false` (column default), and was NOT flagged as test/demo data — so nothing hides them from the UI.

Root cause (confirmed this session):
1. `tests/integration/s17-parity.test.js` (SD-MAN-TEST-S17-PARITY-001) seeds ventures and has a `beforeAll` self-clean + `afterAll` delete, BUT cleanup is keyed only to the IDs captured in-process (`cliVentureId` / `frontendVentureId` / drift). If the run is killed before `afterAll`, or any additional venture is provisioned, the residue survives until the NEXT run's `beforeAll` self-clean — and that self-clean only deletes the `ventures` rows + `chairman_decisions` + `venture_analysis_artifacts`; it does NOT delete the GitHub repos or the local `_EHG/<repoName>` clones that `provisionVenture` creates.
2. The provisioner harness (`provisionVenture` step `repo_created`) creates a private GitHub repo + local clone for any venture fed to it, including these test fixtures, and has NO teardown path of its own.
3. The product Ventures route surfaces them because the two ehg data paths filter inconsistently (see Changes / EHG repo work below): `useVentures()` filters `is_demo` but not `deleted_at`; `listVentures()` filters NEITHER. With `is_demo=false` on the fixtures, both paths show them as real, active ventures.

The fix must make parity/conformance provisioning self-cleaning AND mark test fixtures as test data, and make the Ventures route reliably exclude test/demo and soft-deleted ventures.

## Scope

Primary repo: **EHG_Engineer** — the test + provisioner machinery.
- `tests/integration/s17-parity.test.js` — the parity test that seeds the fixtures.
- `lib/eva/bridge/venture-provisioner.js` — `provisionVenture` (`repo_created` step creates the GitHub repo + local clone).
- `lib/eva/stage-execution-worker.js` — drives provisioning of ventures through the pipeline.
- The provisioner test harness / any conformance test that calls `provisionVenture` against `parity-test-*` ventures.

Secondary repo: **EHG (ehg app)** — the Ventures-route listing filters, which currently let test fixtures surface.
- `ehg/src/hooks/useVentureData.ts` — `useVentures()` filters `is_demo` but NOT `deleted_at`.
- `ehg/src/services/ventures.ts` — `listVentures()` filters NEITHER `is_demo` NOR `deleted_at`.

Out of scope: redesigning the parity test's comparison logic; changing real (non-test) venture provisioning behavior; the venture full-delete backend endpoints (they already exist and may be reused for repo+clone teardown).

## Acceptance

- [ ] Teardown: the parity/conformance test (or the provisioner harness) deletes the test ventures AND their GitHub repos AND their local `_EHG/<repoName>` clones it created, in an `afterAll`/`finally` that runs even on failure (not only on the next run's `beforeAll`).
- [ ] Test-data flag: provisioning done for tests sets `is_demo=true` (the column already exists, boolean default false) on the venture row so it is excluded from the product Ventures route by default — covering the window between creation and teardown, and any residue if teardown is skipped.
- [ ] Route filter (EHG): the Ventures listing excludes `is_demo=true` AND soft-deleted (`deleted_at IS NOT NULL`) ventures. `listVentures()` in `ehg/src/services/ventures.ts` gains both filters; `useVentures()` in `ehg/src/hooks/useVentureData.ts` gains the missing `deleted_at IS NULL` filter (it already filters `is_demo`).
- [ ] Zero-residual assertion: a parity-test run asserts that, after teardown, zero residual ventures matching `name LIKE 'parity-test-%'` remain in the live `ventures` table.
- [ ] No regression: real-venture provisioning, the parity comparison assertions, and the existing `is_demo` demo-mode behavior remain unchanged.

## Changes

- MODIFY `tests/integration/s17-parity.test.js`: set `is_demo: true` on every seeded fixture insert (CLI, frontend, drift); add a robust `afterAll`/`finally` teardown keyed by `name LIKE 'parity-test-%'` (not just captured IDs) that deletes child rows, the venture rows, the provisioned GitHub repos, and the local clones; add a post-teardown assertion that zero `parity-test-%` ventures remain.
- MODIFY `lib/eva/bridge/venture-provisioner.js` and/or the provisioner test harness: provide a teardown/cleanup path that deletes the GitHub repo + local `_EHG/<repoName>` clone created by the `repo_created` step (reusing the existing full-delete teardown where possible); ensure test-driven provisioning propagates a test/demo flag so the venture row is created with `is_demo=true`.
- MODIFY `ehg/src/services/ventures.ts` `listVentures()`: add `.or("is_demo.eq.false,is_demo.is.null")` and `.is("deleted_at", null)` filters.
- MODIFY `ehg/src/hooks/useVentureData.ts` `useVentures()`: add `.is("deleted_at", null)` (keep the existing `is_demo` filter).

## Objectives

- Parity/conformance tests leave zero residual ventures, GitHub repos, or local clones in any environment, even on failure or kill.
- Test fixtures are flagged as test data (`is_demo=true`) so they never surface as real ventures even before teardown.
- The product Ventures route reliably hides test/demo and soft-deleted ventures across BOTH data paths.

## Risks

- Deleting GitHub repos from a test teardown must be strictly scoped to `parity-test-*` repos this run created — never touch real venture repos. Mitigation: match on the exact provisioned repo name / `parity-test-` prefix and gate destructive `gh repo delete` behind that match.
- The `idx_ventures_unique_active_name` partial-unique index (on name for active/paused) means a leaked active fixture with the same name blocks re-creation; teardown-by-name-prefix and the `beforeAll` self-clean must both stay to avoid flakiness.
- Two ehg data paths filter differently today; changing one without the other leaves a leak. Both must be updated together.
- `gh repo delete` requires the `delete_repo` scope on the token; teardown should fail-soft (log, not crash the suite) if the repo delete is not permitted, while still asserting DB-row cleanup.

## Key Principles

- Provisioning machinery used for tests must be self-cleaning: create implies a guaranteed teardown.
- Defense in depth: flag test data AND tear it down AND filter it at the route — any single layer failing must not surface fixtures as real ventures.
- Destructive teardown is prefix-scoped and fail-soft; never risk a real venture or repo.
- Reuse the existing venture full-delete teardown path rather than hand-rolling repo/clone deletion.

## Success Metrics

- Residual parity-test ventures in the live `ventures` table after a test run: 0 (asserted).
- Residual `parity-test-*` GitHub repos and `_EHG/parity-test-*` local clones after a test run: 0.
- Ventures-route queries (`useVentures`, `listVentures`) returning any `is_demo=true` or soft-deleted venture: 0.

## Smoke Test

- [ ] Run the parity/conformance test suite to completion; confirm it passes and that afterward `SELECT count(*) FROM ventures WHERE name LIKE 'parity-test-%'` returns 0.
- [ ] Confirm no `parity-test-*` private repos remain under the GitHub account and no `_EHG/parity-test-*` clone directories remain on disk.
- [ ] Load the product Ventures route and confirm no `parity-test-*` or other `is_demo=true` / soft-deleted ventures appear in the list.
