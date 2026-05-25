<!-- Archived from: docs/plans/converge-venture-build-claude-code-model.md -->
<!-- SD Key: SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001 -->
<!-- Archived at: 2026-05-25T12:30:59.484Z -->

# Finalize the Claude-Code-from-repo venture build model + Stage-0 app-type capture

## Type
feature

## Priority
medium

## Summary
Finish the cost-pivot rewiring of the venture build/deploy path that was started but never completed. Building a venture's features is governed by the **venture stage pipeline (S17–S26, incl. the S20 Code Quality Gate)** — NOT by LEO platform SDs. So the single venture build model is: **Lovable conduits the Stitch landing → GitHub; Claude Code builds the rest from the Claude-Code-ready seeded repo (`CLAUDE.md` + `docs/build-tasks.md` + `.replit`); Replit hosts.** This SD makes that model honest, gives it a real completion gate, and adds the missing front-end capture of the venture's target platform. It does NOT generate LEO SDs per venture-feature (a rejected, separately-attempted-and-cancelled approach that conflates building-the-factory with building-the-products).

## Scope
Cross-repo (EHG app frontend + EHG_Engineer backend/worker/DB-config). Four focused changes:

- **FR-1 — Build-model honesty.** Correct the stale pre-pivot semantics: the build model is "Claude Code builds from the seeded repo; Replit hosts," NOT "Replit Agent builds." Drop the build-method selector in `ehg/src/components/stages/shared/BuildMethodSelector.tsx`; fix the misleading comment in `lib/eva/stage-execution-worker.js` `_postStageHook_S19_Bridge`; update the `lifecycle_stage_config` S19 row description (drop `build_method: replit_agent` framing). The `replit_agent` SD-bridge skip STAYS (no SDs by design under model (b)).
- **FR-2 — Real completion gate.** Gate the S19→S20 advance on `docs/build-tasks.md` build-task completeness (the features are actually built), not merely on a registered deployment URL. The existing S20 Code Quality Gate (npm audit/lint/tests on the real repo) remains the downstream validator.
- **FR-3 — Stage-0 app-type capture.** Add a front-end control at Stage 0 to set `ventures.target_platform` (web | mobile | both). The backend already consumes this column (`lib/eva/bridge/replit-prompt-formatter.js`, `mobile-security-defaults.js`) to select Expo/mobile vs web templates; only the capture UI is missing (it currently defaults to `web`). Surface the existing decision rubric (`docs/reference/target-platform-decision-rubric.md`) as guidance.
- **FR-4 — Cleanup.** Delete the dead/legacy `ehg/src/types/workflowStages.ts` (the live SSOT is `ehg/src/config/venture-workflow.ts`, already aligned to the marketing-first pipeline) — after confirming zero imports.

## Key Changes
- Relabel/clarify the venture build model across UI + worker comment + stage config (FR-1).
- New build-completeness gate at S19 advance, keyed off `docs/build-tasks.md` (FR-2).
- New Stage-0 UI control writing `ventures.target_platform` (FR-3).
- Remove dead `workflowStages.ts` (FR-4).

## Success Criteria
- No surface refers to the venture build as "Replit Agent builds"; the single model is "Claude Code builds from the seeded repo, Replit hosts"; the build-method selector is gone.
- S19→S20 advance is blocked until the seeded `docs/build-tasks.md` tasks are complete (not merely a registered URL).
- A venture's `target_platform` (web/mobile/both) is settable from the Stage-0 UI and flows to the backend template selection that already consumes it.
- `workflowStages.ts` is removed with no broken imports; `venture-workflow.ts` remains the SSOT.

## Out of Scope
- NO generation of LEO Strategic Directives for venture builds (the rejected model (c)); `lib/eva/lifecycle-sd-bridge.js` stays unused for ventures.
- NO changes to the already-live backend platform-branching, Expo templates, mobile-security defaults, marketing-first S18–S26 pipeline, or the venture→LEO bridge.
- The register-deployment 3-layer live fix (service-role client in `server/routes/stage19.js` + the two `ehg/supabase/migrations/` files already applied to prod) ships as a SEPARATE QF/PR, not in this SD.
- Retiring the obsolete `replit_agent` skip + re-entry-adapter machinery is a possible follow-up only if it proves to be dead code (guarded deletion with tests), not part of this SD.

## Risks
- `docs/build-tasks.md`-based completion gating needs a reliable "task done" signal; design it to degrade safely (don't hard-block on a parse failure).
- Deleting `workflowStages.ts` requires a verified zero-import check first (legacy type file; confirm nothing imports it).

## Vision
VISION-S19-CLAUDE-CODE-READY-REPO-L2-001 (arch: ARCH-S19-CLAUDE-CODE-READY-REPO-001)
