<!-- Archived from: .claude/plans/2026-05-27-heal-vision-venture-support.md -->
<!-- SD Key: SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 -->
<!-- Archived at: 2026-05-27T16:49:39.275Z -->

# Plan: Make /heal vision venture-aware (rubric paths + arch-key + invalidation)

## Priority
critical

## Goal

Surfaced by CronGenius pilot 2026-05-27 (project_crongenius_first_venture_pilot_2026_05_27): the `/heal vision` infrastructure is EHG-only despite its API accepting any `--vision-key`. Three findings (2 P0 + 1 P2) prevent venture build-vs-vision evaluation:

**F1 (P0) — Deterministic rubric paths hardcoded to EHG_Engineer.** Rubric files in `scripts/eva/evidence-rubrics/V*.js` and `A*.js` check for specific file paths (`scripts/modules/auto-proceed/urgency-scorer.js`, `lib/eva/stage-execution-engine.js`, etc.) that only exist in EHG_Engineer. The rubric runner resolves these paths via `__dirname`/absolute resolution, ignoring CWD. Result: scoring ANY venture codebase against ANY vision returns the same EHG-self-scores, with display labels swapped to match the venture vision's dimension names by INDEX. This produced a false 100/100 score for CronGenius (id 63155810-2114-4eb8-a124-c971e199a011) that is now persistent in `eva_vision_scores` with no way to invalidate.

**F2 (P0) — Default arch-key fallback silently uses `ARCH-EHG-L1-001`.** `scripts/eva/vision-evidence-scorer.js` line 28 defaults `--arch-key` to `ARCH-EHG-L1-001`. When scoring a non-EHG vision without `--arch-key`, the scorer auto-loads EHG architectural dimensions and mixes them into the venture scoring context. The --llm-mode emits a `VISION_HEAL_SCORE_CONTEXT` block showing CronGenius vision dimensions + EHG arch dimensions side-by-side, which would confuse any downstream LLM scorer.

**F3 (P2) — `eva_vision_scores` table has no invalidation columns.** Schema: id, vision_id, arch_plan_id, sd_id, iteration, total_score, dimension_scores, threshold_action, generated_sd_ids, rubric_snapshot, scored_at, created_by. No `metadata jsonb`, no `invalidated_at`, no `invalidation_reason`. When a heal score is found to be wrong (as the CronGenius 100/100), the only options are hard-delete (loses audit) or overwrite an existing column (loses fidelity).

This SD makes /heal vision venture-aware for the first venture (CronGenius) and every future venture. It also adds the invalidation mechanism so the false-positive can be marked as such.

The rubric runner needs CWD-respecting OR target-path-aware OR per-venture-rubric-set design — the LEAD/PLAN phase will pick the specific approach from the design tradeoffs. The minimum bar is: scoring `cd <venture worktree> && heal vision score --vision-key <venture-vision>` MUST evaluate the venture worktree's code, not EHG_Engineer's.

## Steps

- [ ] LEAD: 8-question strategic validation gate + 6-step checklist; document scope reduction percentage
- [ ] LEAD: invoke validation-agent (LEAD strategic gate evidence), risk-agent (false-positive scoring breaks every venture heal), design-agent (rubric refactor approach evaluation)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute, gates pass
- [ ] PLAN: write PRD via add-prd-to-database.js capturing F1+F2+F3 functional requirements
- [ ] PLAN: define rubric refactor approach — options A (CWD-pass-through), B (venture-target-path arg), C (per-venture rubric directory), D (LLM-only mode for ventures); pick one with documented rationale
- [ ] PLAN: invoke design-agent (final rubric API design), database-agent (eva_vision_scores migration), testing-agent (test plan covering EHG self-score + venture scoring + invalidation)
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute, gates pass
- [ ] EXEC F1: refactor rubric runner to accept target-path or respect CWD; update rubric type handlers in scripts/eva/evidence-checks/check-runner.js
- [ ] EXEC F2: change vision-evidence-scorer.js arch-key default behavior: require explicit --arch-key when vision-key context is non-EHG, OR auto-derive arch-key from vision-key prefix and fail gracefully if missing
- [ ] EXEC F3: write migration adding metadata jsonb + invalidated_at timestamptz + invalidation_reason text to eva_vision_scores; apply via database-agent
- [ ] EXEC F3: update the false CronGenius score row 63155810 with invalidation metadata
- [ ] EXEC: tests in tests/unit/heal-vision/ — venture scoring scenario, EHG self-scoring still passes, invalidation roundtrip
- [ ] EXEC: run /heal vision against CronGenius worktree to verify it now produces a meaningful (non-100) score
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute, gates pass (TESTING evidence required)
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute (final verification by PLAN)
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute, retrospective generated, gates pass
- [ ] PR: create + auto-merge once LEAD-FINAL passes
- [ ] Resume CronGenius pilot: re-claim orchestrator, re-run /heal vision against CronGenius (now venture-aware), proceed to arch plan creation

## Target Application
EHG_Engineer

## Scope Notes
- Rubric files V01-V11 and A01-A07 stay as-is; they ARE EHG-specific rubrics and that's correct (they're checking EHG-platform features). The fix is in the RUNNER, not the rubrics.
- Venture rubrics (per-venture rubric files) are out of scope for this SD — future enhancement after we see how the venture LLM-mode scoring plays out.
- The eva_vision_scores invalidation column is in scope (F3) so the false CronGenius score can be flagged.

## Origin
- Pilot journal: project_crongenius_first_venture_pilot_2026_05_27.md (Findings F1, F2, F3)
- Session: ea257a69-f0ec-40fb-8818-ce66e2767b28
- Blocker SD: SD-CRONGENIUS-LEO-ORCH-SPRINT-SPRINT-2026-001 (paused 2026-05-27 awaiting this fix)
