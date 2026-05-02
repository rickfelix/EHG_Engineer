<!-- Archived from: docs/plans/sd-leo-infra-replit-prompts-binding-contract-001-plan.md -->
<!-- SD Key: SD-LEO-INFRA-REPLIT-PLAN-MODE-001 -->
<!-- Archived at: 2026-04-28T21:24:44.103Z -->

# Replit Plan Mode Binding Contract Pipeline + Stage 19 Prompts API

## Type

infrastructure

## Priority

medium

## Target Application

EHG_Engineer (Replit Agent prompt pipeline: `lib/eva/bridge/replit-format-strategies.js`, `lib/eva/bridge/replit-repo-seeder.js`, `server/routes/stage19.js`, plus operational playbook under `docs/guides/workflow/`)

## Summary

This SD continues the work shipped in `SD-LEO-INFRA-STAGE-BINDING-CONTRACT-001` (PR #3409, merged 2026-04-28 19:33Z), which formalised the Stage 18 → Stage 19 marketing-copy binding contract inside the orchestrator analysis step. That parent SD established the contract at the *artifact* layer; this SD wires the contract into the *Replit Agent prompt pipeline* so Plan Mode receives `docs/marketing-copy.md` as a binding artifact at scaffolding time, and exposes the resulting prompts via a callable HTTP endpoint.

Concretely, this SD ships:

1. **Plan Mode binding contract** — `replit-format-strategies.js` now wires `docs/marketing-copy.md` into the Plan Mode prompt as a binding contract reference, alongside per-feature prompt enrichment.
2. **Plan Mode quality cap** — the formatter caps Plan Mode at the top-5 features ranked by priority tier (`PLAN_MODE_TOP_FEATURES=5`, plus `PLAN_MODE_BUDGET=6000` as a belt-and-suspenders character cap). Overflow features are referenced via `docs/tasks.md` (already written by the repo seeder). Rationale: Replit's own community guide for Plan Mode caps at "3 must-have features"; LLMs exhibit lost-in-the-middle behaviour where mid-context items get underweighted. Cap is informed by 43/43-passing vitest assertions on ranking, overflow, and priority-tie-breaker semantics.
3. **Stage 19 prompts HTTP API** — new `server/routes/stage19.js` exposes `GET /api/stage19/:ventureId/replit-prompts`, returning the formatted Plan Mode + per-feature prompts for a given venture. Mounted at `server/index.js:174` behind `requireAuth`.
4. **Repo seeder idempotency** — `replit-repo-seeder.js` no-longer attempts a commit+push when the staging set is empty, so re-running on an already-seeded venture is a no-op rather than a guaranteed git noise commit.
5. **Playbook §0 Rule 7** — adds the methodology lesson learned during the Replit Agent prompt refinement: "When prompting an LLM consumer, ask the consumer." Documents the round-trip refinement pattern that produced the prompt template now under test.

This SD formalises six commits that originally accumulated on the misnamed `qf/QF-20260428-RETRO-AGENT-LESSON-TRIAGE` branch after PR #3407 (the actual retro-agent lesson-triage QF) merged. The branch was salvaged 2026-04-28 by cherry-picking the six unique post-PR-#3409 commits onto a fresh `feat/replit-prompts-marketing-copy-binding-contract` branch off `origin/main`.

**Concrete provenance (commits already cherry-picked onto the SD branch):**

| New SHA | Original SHA | Subject | Files |
|---|---|---|---|
| `2fa4ad62d4` | `235b4285dc` | fix(replit-repo-seeder): idempotent re-run skips commit+push when nothing staged | `replit-repo-seeder.js` (+26/-6) |
| `2aceeebf11` | `9c8a3946d2` | docs(playbook): add §0 Rule 7 — when prompting an LLM consumer, ask the consumer | `stage-pipeline-pre-approval-playbook.md` (+3/-1) |
| `84cccd53a7` | `13760651ee` | fix(replit-prompts): wire docs/marketing-copy.md as binding contract in Plan Mode + feature prompts | `replit-format-strategies.js` (+36/-5) |
| `b5ca82f8fe` | `142500e4c6` | feat(stage-19): expose Replit prompts via /api/stage19/:ventureId/replit-prompts | `server/index.js` (+3), `server/routes/stage19.js` (+93 new) |
| `ba4be16f9e` | `c314ac0c71` | fix(replit-prompts): raise PLAN_MODE_BUDGET 2000 → 6000 to accommodate binding contract + feature descriptions | `replit-format-strategies.js` (+9/-1) |
| `ecb6d4891a` | `a7c9bf812b` | fix(replit-prompts): cap Plan Mode at top-5 features, overflow to docs/tasks.md | `replit-format-strategies.js` (+84/-23) |

Total net change: ~217 LOC across 5 files (1 new server route file). Test coverage: 44/44 vitest passing on `tests/unit/eva/replit-format-strategies.test.js` (verified 2026-04-28 post-cherry-pick).

The parent SD `SD-LEO-INFRA-STAGE-BINDING-CONTRACT-001` (PR #3409) is the authoritative reference for the binding-contract design rationale; this SD layers the prompt-pipeline integration on top of that contract.

## Scope amendment / provenance disclosure

The implementation pre-existed this SD. The work was authored across 2026-04-28 in a session that committed to a misnamed branch (`qf/QF-20260428-RETRO-AGENT-LESSON-TRIAGE`, intended for retro-agent lesson triage shipped via PR #3407, but reused for unrelated Stage 19 + Replit-prompt work after that PR merged). One commit (`a7c9bf812b`) was local-only at the start of the salvage operation; it was pushed to the misnamed branch's remote 2026-04-28 to eliminate data-loss risk before any cleanup, then cherry-picked onto the new branch.

This SD wraps the existing implementation for proper LEO governance and a clean PR off `origin/main`. EXEC phase is documentation/verification of code already written; PLAN phase produces a PRD that retrospectively captures FRs, NFRs, and acceptance criteria from the existing code + tests.

## Acceptance criteria

1. PR opens off `feat/replit-prompts-marketing-copy-binding-contract` against `main`.
2. CI passes (vitest, lint, type-check, DB Verify, Test Coverage Enforcement, DOCMON).
3. `tests/unit/eva/replit-format-strategies.test.js` reports ≥ 44 tests passing.
4. `GET /api/stage19/:ventureId/replit-prompts` returns 200 with `{plan_mode_prompt, feature_prompts}` for a venture with marketing-copy + features; returns 404 cleanly for an unknown venture.
5. Plan Mode prompt for any venture with > 5 features ranks features by priority tier and references `docs/tasks.md` for overflow.
6. Repo seeder re-run on an already-seeded venture exits 0 with no git commit.
7. Playbook §0 lists 7 methodology rules; §3 references Rule 7 in its Stage 18 lesson summary.

## Out of scope

- S20 QA / S21 Integration / S22 Release prompt templates (named in the playbook §0 Rule 7 description as future-applicable, but not implemented here).
- Replit Agent end-to-end smoke test against the new `/api/stage19/:ventureId/replit-prompts` endpoint (manual chairman smoke owed post-merge; not a PR-blocking CI step).
- Migration of legacy non-Plan-Mode prompt formatters (out of scope; Plan Mode is the primary entry point).
