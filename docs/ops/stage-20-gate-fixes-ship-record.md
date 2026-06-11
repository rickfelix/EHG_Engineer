---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-06
tags: [documentation, ops]
---

# Stage 20 Gate-Fix Ship Record — SD-LEO-FIX-SHIP-STAGE-GATE-001

This SD shipped two validated, operator-approved Stage 20 (code-quality gate) fix PRs to `main`.
Both were cherry-picked clean onto current `origin/main` and verified live on venture DataDistill
(`510177ba-435f-4dd7-bfa5-6154cc8cf54b`).

## Shipped

| PR | Repo | Change | Merged |
|----|------|--------|--------|
| [#4292](https://github.com/rickfelix/EHG_Engineer/pull/4292) | EHG_Engineer | Stage 20 `cloneRepo` error-string cleanup + records the (already-applied) `GRANT EXECUTE ON get_gate_decision_status(uuid,integer) TO authenticated, anon` migration | 2026-06-06 |
| [#684](https://github.com/rickfelix/ehg/pull/684) | ehg | Fix `useStage20Verdict` query selecting non-existent columns (HTTP 400 → Stage 20 verdict/action surface never rendered) | 2026-06-06 |

## Notes (verify-before-build)

- The substantive `isSafeRepoUrl` regex fix referenced in the original finding was already on `main`
  via PR #4289 (SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001); #4292's remaining `.js` delta is a
  cosmetic template-literal→string lint cleanup in `cloneRepo`.
- The `get_gate_decision_status` EXECUTE grant was confirmed **already live** in prod
  (`has_function_privilege` = true for `authenticated` and `anon`) before merge — merging #4292
  records the migration file on `main` without re-applying.
- #684 is the functional fix that restores the Stage 20 verdict/action surface in the EHG app.

Net effect: Stage 20 code-quality gate clones repos and renders its verdict surface for ventures.
