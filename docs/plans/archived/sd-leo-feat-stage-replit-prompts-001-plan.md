<!-- Archived from: C:/Users/rickf/.claude/plans/s19-prompts-build-into-aware.md -->
<!-- SD Key: SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001 -->
<!-- Archived at: 2026-05-23T17:31:24.180Z -->

# Stage-19 Replit prompts are build-into-aware (continue the existing app, don't scaffold a new one)

## Type
feature

## Priority
high

## Target Application
EHG_Engineer

## Summary
SD-LEO-FEAT-S19-BUILDS-INTO-001 made Stage 19 build INTO the venture's existing Stage-17 design repo (e.g. Canvas AI → rickfelix/contribution-hub, a real working Lovable app: Vite + TypeScript + TanStack Router + shadcn) and seed additive docs/ + an EHG-BUILD-CONTEXT marker into replit.md. But the Replit prompts the chairman pastes still assume a BLANK repo: the Step-2 scaffold prompt says "Scaffold a new web app", and the Plan-Mode / per-feature / replit.md prompts reference only generic seeded docs/ — including docs/designs/, which is EMPTY for github_sync-captured ventures — and never the actual app. No build-into signal reaches the prompt route (GET /api/stage19/:ventureId/replit-prompts is mode-agnostic; the frontend knows the mode via ventures.repo_url but doesn't pass it). Result: a chairman following the prompts would tell Replit to scaffold a fresh app alongside the existing one — re-doing the work build-into was meant to preserve. This SD makes the S19 prompts mode-aware: in build-into mode they instruct Replit to CONTINUE the existing app (inspect its stack/routes/design system and match them; build additively; do NOT scaffold or re-create) and stop pointing at the empty docs/designs/. create-new prompts are unchanged.

## Strategic Objectives
- Close the contradiction between the build-into plumbing (shipped) and the operator-facing prompts (still blank-repo).
- Make the chairman's Replit workflow continue from the real app, not re-scaffold it.
- Use the venture's existing app (already in the repo) as the design reference, not the empty docs/designs/, for github_sync ventures.
- Delegate repo introspection to Replit Agent (which is IN the repo) via prompt language, rather than adding heavy backend repo-cloning to the prompt route.

## Key Changes
| File | Action | Purpose |
|------|--------|---------|
| `EHG_Engineer/server/routes/stage19.js` | MODIFY | Resolve build-into vs create-new (via ventures.repo_url SSOT / resolveVentureRepoUrl, or an explicit `?mode=`) and thread `mode` into formatReplitOptimized |
| `EHG_Engineer/lib/eva/bridge/replit-prompt-formatter.js` | MODIFY | `formatReplitOptimized(ventureId, { mode })` passes mode to the three format strategies |
| `EHG_Engineer/lib/eva/bridge/replit-format-strategies.js` | MODIFY | Mode-aware `formatPlanModePrompt` / `formatFeaturePrompts` / `formatReplitMd`: build-into → "continue the existing app, inspect + match its stack/routes/design system, build additively"; drop the docs/designs/ reference when build-into / no designs |
| `ehg/src/components/stages/shared/BuildMethodSelector.tsx` | MODIFY | Pass `?mode=build-into` to the prompt route when ventures.repo_url is set; build-into variant of the static Step-2 scaffold prompt ("continue from the existing app") |

## Success Criteria
- For a venture with ventures.repo_url set (build-into), the S19 Step-2 / Plan-Mode / per-feature prompts instruct Replit to continue/build on the existing app and do NOT say "scaffold a new app" or reference docs/designs/.
- For a repo-less venture (create-new), every prompt is byte-identical to today's output (no regression).
- The build-into prompts reference the EHG-BUILD-CONTEXT marker + the existing app as the design source.
- Validated against Canvas AI (build-into) and a repo-less venture (create-new) by inspecting the generated prompts.

## Risks
- Prompt regression for create-new ventures → mode-guard every change; create-new is the default and stays byte-identical.
- Over-instructing Replit Agent (verbose prompts) → keep build-into language concise and additive.
- Mode detection drift between frontend (ventures.repo_url) and backend → resolve mode server-side from the SSOT as the source of truth; treat the frontend `?mode=` as a hint only.
- No new backend repo-cloning in the prompt route (latency/auth) → delegate introspection to Replit Agent via prompt language.

## Tasks
- [ ] FR-1: thread build-into mode to the prompt generators (server-side resolve from ventures.repo_url; optional `?mode=` hint from the frontend)
- [ ] FR-2: mode-aware prompt language (build-into = continue/extend the existing app; inspect + match its stack/routes/design system; build additively; never scaffold)
- [ ] FR-3: build-into prompts use the existing app + EHG-BUILD-CONTEXT marker as the design reference and drop the empty docs/designs/ reference
- [ ] FR-4: build-into variant of the static Step-2 scaffold prompt (BuildMethodSelector.tsx)
- [ ] FR-5: create-new behavior byte-identical (no regression for repo-less ventures)
- [ ] Validate generated prompts for Canvas AI (build-into) + a repo-less venture (create-new)
