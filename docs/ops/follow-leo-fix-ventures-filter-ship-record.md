# SD-FDBK-ENH-FOLLOW-LEO-FIX-001 — Ship Record (cross-repo: EHG)

Defense-in-depth follow-up to SD-LEO-FIX-VENTURE-PROVISIONING-PARITY-001 (the deferred
service-path piece). The fix lives in the **ehg** (frontend) repo; this SD is tracked in
EHG_Engineer LEO with `metadata.target_repos = ["EHG"]`.

## Shipped

| PR | Repo | Change |
|----|------|--------|
| [#688](https://github.com/rickfelix/ehg/pull/688) | ehg | `listVentures()` (`src/services/ventures.ts`) now filters `is_demo` + `deleted_at IS NULL`; `useVentures()` (`src/hooks/useVentureData.ts`) adds an always-on `deleted_at IS NULL` (it already filtered `is_demo`). |

## Verify-before-build

- Confirmed on ehg `origin/main`: `listVentures()` filtered neither `is_demo` nor `deleted_at`;
  `useVentures()` filtered `is_demo` (demo-mode) but not `deleted_at` — both leaks are real.
- Confirmed the `ventures` table has **both** `is_demo` and `deleted_at` columns (live DB) — so the
  added filters carry no 42703/HTTP-400 risk.

Net effect: the Ventures route hides demo and soft-deleted ventures on the service path,
regardless of demo mode.
