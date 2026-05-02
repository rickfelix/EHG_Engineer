<!-- Archived from: docs/plans/sd-stage18-honest-502-orphan-recovery-plan.md -->
<!-- SD Key: SD-LEO-FIX-STAGE-MARKETING-COPY-001 -->
<!-- Archived at: 2026-04-28T22:36:33.144Z -->

# Stage 18 Marketing Copy: land honest 502 banner + structured error logging (orphan from PR #547)

## Type

bugfix

## Priority

medium

## Target Application

EHG (`ehg/src/components/stages/Stage18MarketingCopy.tsx`, `ehg/src/hooks/useChairmanDashboardData.ts`)

## Summary

This SD lands a Stage 18 Marketing Copy UX patch that was orphaned from `SD-MAN-FIX-STAGE-MARKETING-COPY-001` / PR #547 (merged 2026-04-28T10:18:23Z). The orphan commit covers:

1. **Honest 502 banner** in `Stage18MarketingCopy.tsx` — when the marketing-copy LLM route returns 502 (or any LLM-stub-failure proxy code), surface a user-visible banner with the failure reason and a retry affordance, instead of the current silent failure that leaves the studio panel empty.
2. **Structured error logging** in `useChairmanDashboardData.ts` — emit a structured log envelope (route, status, error_kind, venture_id) on the same failure path so chairman dashboard error counts attribute correctly to the marketing-copy route rather than collapsing into a generic "fetch failed" bucket.

The work was authored as part of the SD-MAN-FIX-STAGE-MARKETING-COPY-001 effort but did not land in PR #547. It currently lives on `holding/SD-MAN-FIX-STAGE-MARKETING-COPY-001-stage18-honest-502` in `rickfelix/ehg` (1 commit, ~133 LOC across 2 files). Source SHA: `81aec653a3`, originally on the now-deleted `feat/SD-LEO-INFRA-REPLIT-PLAN-MODE-001-replit-plan-mode-binding-contract` branch (cross-repo branch-naming drift; the Stage 18 commit ended up there in error during a multi-repo session).

This SD wraps the existing orphan commit for proper LEO governance and a clean PR off `origin/main` in the `ehg` repo. EXEC phase recovers the commit (cherry-pick or replay) onto a fresh feature branch, runs smoke verification, and ships. PLAN phase produces a small PRD retrospectively capturing FRs and acceptance from the orphan commit's content.

Vision linkage: `VISION-S18-MARKETING-COPY-STUDIO-PROMOTION-GATE-L2-001` (parent vision; 71% rubric overlap per vision-readiness check).

## Why this is a follow-up SD, not a reopen of -001

`SD-MAN-FIX-STAGE-MARKETING-COPY-001` is `status=completed`, completion_date 2026-04-28T10:18:23Z, shipped via merged PR #547. Reopening it would corrupt the original SD's audit trail and falsify the vision/architecture scoring computed at its LEAD-FINAL handoff. The orphan commit is independent feature work that needs its own LEAD-approved trace through the protocol.

## Scope amendment / provenance disclosure

The implementation pre-exists this SD. The user surfaced the orphan commit and holding branch during /leo session continuity check. EXEC phase is recovery + verification of code already written; PLAN phase produces a PRD that retrospectively captures FRs and acceptance criteria from the existing code.

LOC estimate: ~133 LOC reported by user across 2 files. Per LOC-undershoot memory (multiply ×2-2.5 before tier categorization), final landed scope including any banner-render test scaffolding may approach 180-220 LOC, hence full SD over QF (rubric scored 7/20 = Quick Fix; user explicit override per Direct SD option).

## Acceptance criteria

1. PR opens off a fresh `feat/SD-MAN-FIX-S18-HONEST-502-001-*` branch in `rickfelix/ehg`, cut from `origin/main`, containing the recovered orphan commit (cherry-picked from `holding/SD-MAN-FIX-STAGE-MARKETING-COPY-001-stage18-honest-502` or replayed from source SHA `81aec653a3` if the holding branch is gone).
2. PR includes both files: `src/components/stages/Stage18MarketingCopy.tsx` and `src/hooks/useChairmanDashboardData.ts`.
3. CI passes on the EHG repo (vitest, type-check, lint).
4. Manual smoke (or vitest mock): when the marketing-copy route returns 502, the Stage 18 panel renders the honest banner with the failure reason; structured log envelope emits with the documented shape.
5. PR merges to `main` via the manual workaround path (`gh pr ready <#> && gh pr merge <#> --merge --delete-branch --admin`) until `SD-LEO-INFRA-SHIP-AUTO-MERGE-001` ships and /ship auto-merge is trustworthy. Post-merge state verified via `gh pr view <#> --json state`.
6. `holding/SD-MAN-FIX-STAGE-MARKETING-COPY-001-stage18-honest-502` is deleted from origin after the recovered commit lands in `main`.

## Out of scope

- Backend changes to the LLM/marketing-copy route itself (the route's 502 behaviour is unchanged; this SD only changes the UX response to it).
- Other Stage 18 panels' error handling (Stage 18 marketing-copy studio only).
- Backfill of pre-existing chairman dashboard log entries to the new structured shape (forward-only).
- Auto-retry / circuit-breaker policy on the route (banner shows manual retry affordance only).

## Notes for executor

- Confirm holding branch existence: `git fetch origin holding/SD-MAN-FIX-STAGE-MARKETING-COPY-001-stage18-honest-502` in the `ehg` repo. If gone, `git fetch origin 81aec653a3` and cherry-pick the SHA directly.
- This SD targets the `ehg` repo (Vite SPA). Per memory: `/api/*` is dead in production via `vercel.json` rewrites — the 502 path being patched here is the SPA's response handling for a route that DOES exist as a function elsewhere; verify route still hits a real handler before declaring smoke pass.
- Don't trust /ship auto-merge — verify with `gh pr view <#> --json state` and use the manual `gh pr ready && gh pr merge --admin` workaround if needed (per memory: "/ship auto-merge silently fails — three causes").
