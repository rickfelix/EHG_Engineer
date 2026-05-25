<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/b1-lovable-preamble-plan.md -->
<!-- SD Key: SD-LEO-FEAT-S17-LOVABLE-BUILD-001 -->
<!-- Archived at: 2026-05-23T22:03:26.104Z -->

# Plan: S17 Lovable build preamble — inject Replit-native build requirements at the Stitch-to-Lovable handoff

## Summary
At Stage 17 a venture's brand-grounded GVOS prompt is pasted into Google Stitch (which produces an HTML/Tailwind design), then the design is transferred Stitch -> Lovable. That transfer opens Lovable pre-populated with the design image AND an EDITABLE prompt — the single moment where build requirements can steer Lovable before it scaffolds the full-stack foundation. Today nothing is injected there, so Lovable builds a generic, Supabase-coupled scaffold that ignores the venture's actual problem/scope and hard-wires Supabase. That later forces manual rework to reach the portfolio's Replit-native target (the Canvas AI migration was exactly this rework, done by hand). This SD generates a concise, copy-paste "Lovable build preamble" from the venture's planning artifacts and surfaces it on the Stage-17 Lovable-handoff panel so the chairman pastes it into Lovable's prompt at transfer time.

## Problem
The venture foundation is built by a design-tool chain (Stitch design-only -> Lovable fixed React/Vite/Supabase stack) that carries no build spec and defaults to Supabase. Nothing steers Lovable's initial build toward (a) the venture's real scope/problem (Replit flagged problem-statement + stack mismatches on the first build-into venture) or (b) a Replit-native-portable backend. Result: every venture's foundation diverges from plan and is Supabase-coupled, requiring downstream manual migration.

## Success Criteria
- The formatter produces a preamble containing the venture name, a one-line problem/value, target users, the key screens/features, brand tokens, and a Replit-native portability block.
- GET /api/stage17/:ventureId/lovable-preamble returns the preamble for a venture with S17 artifacts and degrades gracefully (never 500) when artifacts are sparse.
- The Stage-17 Lovable-handoff panel shows the preamble with a working Copy action and a one-line "paste into Lovable at Stitch transfer" instruction.
- Unit tests cover artifact extraction, presence of the portability block, char-budget enforcement, and graceful degradation; existing S17/S19 prompt behavior is unchanged (purely additive).

## Key Changes
- [EHG_Engineer] New lib/eva/bridge/lovable-preamble-formatter.js — pure formatter: venture + export_blueprint_review artifacts -> concise preamble (<~2500 chars). No DB writes.
- [EHG_Engineer] Replit-native portability block in the preamble: instruct Lovable to keep data access behind a thin typed data module (not Supabase calls scattered through components), read all backend config from env vars, avoid Supabase-only constructs as business logic (no app logic in RLS/Edge Functions), and include a /feedback page (feedback table: title+description) plus Sentry. Goal: the Supabase scaffold Lovable emits migrates cleanly to Replit-native at S19 instead of needing manual surgery. The preamble does NOT make Lovable use Replit directly (it can't) — it makes the coupling shallow and swappable.
- [EHG_Engineer] New route GET /api/stage17/:ventureId/lovable-preamble in server/routes/stage17.js — resolves venture, calls the formatter, returns { preamble, charCount }. Read-only.
- [EHG] New "Build preamble" section on the Stage-17 Lovable-handoff panel — reuse the existing CopyableBlock pattern in src/components/stage17/gvos/ComposerPreviewPanel.tsx, fetch the route, render the preamble + copy.
- [EHG_Engineer] tests/unit/bridge/lovable-preamble.test.js.

## Risks
- Lovable may ignore or override parts of an injected prompt. Severity: medium. Mitigation: keep the preamble concise + imperative; treat as best-effort steering and validate empirically on the next venture.
- The preamble could contradict the attached Stitch design image. Severity: low. Mitigation: the preamble defers all visual/layout decisions to the attached design; it adds only scope + backend-portability, never layout.
- Char-budget overflow truncating the portability block. Severity: low. Mitigation: enforce a budget that preserves the portability block (mirror formatPlanModePrompt's budget pattern).

## Out of Scope
- Automating the Stitch->Lovable transfer itself (remains a manual chairman action).
- Changing Lovable's scaffold stack (fixed by the tool).
- The portfolio-wide de-Supabase of the S19/replit.md generators (separate strategic SD).
- Retroactively fixing already-built ventures (handled per-venture, e.g., Canvas AI).
