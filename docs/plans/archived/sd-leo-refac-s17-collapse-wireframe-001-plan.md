<!-- Archived from: docs/plans/sd-leo-refac-s17-collapse-wireframe-001-plan.md -->
<!-- SD Key: SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001 -->
<!-- Archived at: 2026-05-19T11:03:28.761Z -->

# S17 collapse wireframe approval to venture level

## Priority
high

## Type
refactor

## Target Application
EHG

## Goal

Collapse the per-wireframe upload + "Mark as approved" UI on Stage 17 (Blueprint Review) into a SINGLE venture-level artifact capture + approval at the bottom of the page, persisting to the generic `venture_artifacts` table (one row per venture, not per screen), and retire the legacy `s17_per_wireframe_sections` sub-flag fork plus the per-screen `WireframeArtifactCapture` pathway.

## Summary

Stage 17 currently renders N separate upload + approve flows — one per wireframe — even though chairman approval semantically applies to the whole venture's wireframe set. The per-wireframe surface (shipped by SD-LEO-ORCH-S17-PER-WIREFRAME-001 on 2026-05-14) stores upload + approval state in **pure local React state** with no DB persistence, while the legacy per-wireframe surface (`WireframeArtifactCapture`, shipped by SD-GVOS-S17-PROMPT-QUALITY-ORCH-001) persists per-screen to `venture_wireframe_artifact` but only operates on the currently-selected screen.

This SD collapses both surfaces into one venture-level UI:
- Per-wireframe sections keep their prompt + copy button only (badges removed, no upload, no approval toggle).
- One bottom-of-page artifact capture: file upload (HTML/image/video/design file, 25 MB) OR GitHub URL (full `github_sync` semantics — webhook + commit-sha tracking + downstream consumer compatibility). Inline-HTML mode is dropped.
- One bottom-of-page "Mark as approved" Switch.
- Continue gate simplified to "venture approved" (fidelity check dropped).
- Sub-flag `s17_per_wireframe_sections` retired; per-screen `WireframeArtifactCapture` pathway retired.
- New persistence target: ONE row in `venture_artifacts` table (artifact_type `design_mockups` is the default candidate from the existing CHECK enum, `(venture_id, artifact_type)` partial-unique on `is_current=true`) plus a venture-level approval flag (location TBD: column on `ventures`, column on the artifact row, or new `venture_blueprint_approval` table — PLAN to choose).

## Rationale

- **Chairman approval is venture-level, not per-wireframe.** Today's UI suggests independent decisions but the chairman makes one go/no-go on the wireframe set as a whole.
- **Per-wireframe state has no persistence today.** The N approval toggles + N upload slots are React-state-only in the production-on sub-flag path. There is nothing to migrate — only to replace.
- **Reduce blast surface in S17.** Five upload + approve flows per venture creates five "captured but not ready" states (github_sync webhook hasn't fired yet), five fidelity score lookups, etc. Collapsing to one halves the user-visible failure modes.
- **`venture_artifacts` was just shipped (2026-05-18, PR rickfelix/ehg#612, SD-LEO-FEAT-S11-VENTURE-GVOS-001)** as the canonical generic per-venture artifact store. S17 should use it instead of the per-screen `venture_wireframe_artifact` table.
- **Sub-flag fork carries cognitive load.** `s17_per_wireframe_sections` is ON in production, but the OFF path still ships code via `GvosS17Sections` + `WireframeArtifactCapture`. Retiring the OFF path eliminates the parallel UI permanently.

## Success Criteria

- [ ] Per-wireframe sections render prompt + copy button only — no upload slot, no "Mark as approved" Switch, no quality badge, no fidelity badge
- [ ] ONE bottom-of-page artifact capture control accepting file upload OR GitHub URL (two modes; inline-HTML dropped)
- [ ] ONE bottom-of-page "Mark as approved" Switch covering all wireframes
- [ ] Captured artifact persists to ONE row in `venture_artifacts` keyed by `(venture_id, artifact_type='design_mockups')` with `is_current=true`
- [ ] Venture-level approval flag persists (location chosen in PLAN: column on `ventures` OR column on artifact row OR `venture_blueprint_approval` table)
- [ ] Continue gate (`canContinueStage17` in `src/lib/gvos/stage17-gate.ts`) returns canContinue=true iff venture is approved (fidelity check dropped)
- [ ] Sub-flag `s17_per_wireframe_sections` reads removed from production code paths
- [ ] `WireframeArtifactCapture` component removed (legacy per-screen capture retired)
- [ ] `WireframeUploadSlot` component removed
- [ ] `GvosS17Sections` renders ArchetypeDisplayPanel + ComposerPreviewPanel + the new collapsed list (the per-screen `WireframeArtifactCapture` mount is removed)
- [ ] Downstream consumers (S19 prompt regen, adherence validator) continue working — either via consumer migration (PLAN choice i) OR shadow-write to legacy `venture_wireframe_artifact` during transition (PLAN choice ii)
- [ ] Vitest covers: (a) new venture-level mutation; (b) Continue gate one-flag logic; (c) artifact-resolver compatibility with new persistence; (d) per-wireframe section renders prompt-only
- [ ] Playwright e2e covers: upload file → approve → Continue enabled; GitHub URL → approve → Continue enabled

## Smoke Test Steps

| # | Instruction | Expected Outcome |
|---|-------------|------------------|
| 1 | Load a venture mid-flight at S17 with N>1 wireframes generated | Per-wireframe sections render prompt + copy button only; no upload control or approve toggle visible inside any section |
| 2 | Scroll to the bottom of S17 | One file-upload control + one GitHub URL text field + one "Mark as approved" Switch are visible |
| 3 | Click "Choose file" and select an HTML file | File uploads; approval Switch still disabled until "Mark as approved" toggled |
| 4 | Toggle "Mark as approved" | Switch flips to approved; one `venture_artifacts` row written with `artifact_type='design_mockups'`, `is_current=true`; venture-level approval flag persists |
| 5 | Click Continue | Stage advances to S18 |
| 6 | Reload S17 for the same venture | Bottom upload preview shows the previously uploaded artifact; approval Switch is checked; Continue is enabled |
| 7 | Repeat steps 1-5 using a GitHub URL (paste e.g. `https://github.com/owner/repo`) instead of file upload | `venture_artifacts` row has `lovable_artifact.type='github_sync'`, webhook subscription registered |
| 8 | Grep production code for `WireframeArtifactCapture` and `WireframeUploadSlot` | Zero matches (components fully retired) |
| 9 | Grep production code for `s17_per_wireframe_sections` | Zero matches (sub-flag fully retired) |
| 10 | Inspect `canContinueStage17` predicate signature | No fidelity-score parameter; depends only on venture-level approval flag |

## Scope

### Files Affected (Estimated)

| Path | Action |
|------|--------|
| src/components/stages/Stage17BlueprintReview.tsx | MODIFY — remove sub-flag fork mounting; mount the single collapsed list (~10 LOC delta) |
| src/components/stage17/gvos/WireframeSectionList.tsx | MODIFY — strip per-wireframe upload + approve UI; add bottom-of-page venture-level capture + approval block; rewire Continue gate |
| src/components/stage17/gvos/WireframeUploadSlot.tsx | DELETE — per-wireframe upload retired (logic merged into new venture-level component) |
| src/components/stage17/gvos/WireframeArtifactCapture.tsx | DELETE — legacy per-screen capture retired |
| src/components/stage17/gvos/GvosS17Sections.tsx | MODIFY — remove `WireframeArtifactCapture` mount; remove sub-flag supersession check |
| src/components/stage17/gvos/VentureArtifactCapture.tsx | CREATE — new venture-level capture component (file upload + GitHub URL; ~150 LOC; extracted from `WireframeArtifactCapture` + `WireframeUploadSlot`) |
| src/lib/gvos/stage17-gate.ts | MODIFY — drop fidelity check + per-wireframe approval map; new predicate reads venture-level approval flag only |
| src/hooks/gvos/useCaptureArtifact.ts | MODIFY (or CREATE useVentureArtifactCapture.ts) — write to `venture_artifacts`; legacy hook removed or kept for shadow-write window |
| src/hooks/gvos/useVentureApproval.ts | CREATE — read + write venture-level approval flag |
| supabase/migrations/<NNNN>_add_venture_blueprint_approval.sql | CREATE — schema change for approval flag (location decided in PLAN) |
| src/lib/gvos/artifact-resolver.ts | MODIFY — `resolveArtifact(ventureId)` reads from `venture_artifacts` instead of `venture_wireframe_artifact` (PLAN to choose: cutover vs shadow-read) |
| tests/unit/gvos/stage17-gate.test.ts | MODIFY — assertions for simplified predicate |
| tests/unit/gvos/venture-artifact-capture.test.tsx | CREATE — unit coverage for new venture-level capture |
| tests/e2e/stage17/venture-level-approval.spec.ts | CREATE — Playwright e2e for the new flow |

LOC estimate: net somewhere between -100 and +200 (removing per-wireframe scaffolding + adding venture-level capture; PLAN to firm up).

### Out of Scope

- Migrating historical `venture_wireframe_artifact` rows into `venture_artifacts`. The new persistence is for new captures only; legacy rows remain queryable.
- Modifying the per-wireframe quality scoring or fidelity scoring algorithms — only the per-wireframe BADGE rendering is removed; the scorers continue running for any consumer that needs them.
- Touching `ArchetypeDisplayPanel` or `ComposerPreviewPanel` — they continue rendering above the new collapsed list.
- Stage 16 (wireframe generation) — only S17 (review/approval) is in scope.
- Implementing the inline-HTML "paste raw HTML body" capture mode — explicitly dropped per user direction.

## Key Changes

| Change | Type |
|--------|------|
| New `VentureArtifactCapture` component at bottom of S17 (file upload OR GitHub URL) | feature |
| Per-wireframe upload + approval UI removed | refactor |
| Continue gate simplified to venture-level approval only (fidelity dropped) | refactor |
| New `venture_artifacts` write path (artifact_type='design_mockups', is_current=true) | feature |
| Venture-level approval flag — new column or new table | infrastructure |
| Sub-flag `s17_per_wireframe_sections` retired | refactor |
| Legacy `WireframeArtifactCapture` + `WireframeUploadSlot` deleted | refactor |
| Downstream artifact-resolver migrated to new persistence (cutover OR shadow-read) | infrastructure |
| Vitest + Playwright coverage for new flow | testing |

## Key Principles

- **Chairman approval is venture-level.** Persistence shape matches user-mental-model, not implementation history.
- **One canonical persistence path.** New work writes to `venture_artifacts`; the parallel `venture_wireframe_artifact` table is not extended with new use cases.
- **Retire the sub-flag fork in the same SD.** Leaving two parallel UIs alive after the redesign reintroduces cognitive load that this work was meant to eliminate.
- **Reuse `github_sync` semantics whole-cloth.** The webhook + commit-sha tracking + downstream `resolveArtifact` plumbing all migrate forward; we are not redesigning that surface.

## Risks

| Risk | Mitigation |
|------|-----------|
| Downstream consumers (S19 Replit prompt regen, adherence validator) read `venture_wireframe_artifact` per-screen and break when persistence moves | PLAN chooses cutover vs shadow-write; shadow-write keeps both tables in sync during transition; consumer migration tracked in this SD or follow-up |
| In-flight ventures with React-state approvals lose state on deploy | Acceptable — state was never persistent. Document in retrospective; chairmen must re-approve once after deploy. |
| `github_sync` "captured but not ready" window confuses chairmen (webhook hasn't fired yet → `ArtifactNotReadyError`) | New UI shows a "syncing…" indicator with explicit "not ready yet, waiting on first commit" copy; approval Switch disabled until artifact is ready |
| Approval-flag location decision (column on `ventures` vs column on artifact row vs new table) impacts later analytics work | PLAN picks based on (a) join cost on common queries; (b) whether approval should be versioned independently of the artifact; (c) consistency with other per-venture state |
| Dropping the inline-HTML mode breaks chairmen who currently rely on it | Audit `venture_wireframe_artifact` rows for `type='inline_html'` before merge; if usage exists, file a follow-up SD to support the mode in venture-level capture (not in this SD's scope) |
| `WireframeArtifactCapture` deletion breaks tests that import it | Search test suites for the import; remove + replace assertions with `VentureArtifactCapture` equivalents |
| Sub-flag retirement leaves orphan `feature_flags` table rows | Add a cleanup migration removing the `s17_per_wireframe_sections` row from the feature_flags table |

## Strategic Objectives

- Align S17 UI semantics with venture-level approval mental model.
- Establish `venture_artifacts` as THE canonical per-venture artifact store going forward (continuing the trajectory set by SD-LEO-FEAT-S11-VENTURE-GVOS-001).
- Retire the `s17_per_wireframe_sections` sub-flag fork so future S17 changes don't need to support two parallel UIs.
- Reduce blast surface in S17 (fewer "captured but not ready" failure modes; simpler Continue gate; fewer DB writes).

## Reference Materials

### Antecedent SDs
- SD-LEO-FEAT-S11-VENTURE-GVOS-001 (shipped 2026-05-18, PR rickfelix/ehg#612) — created the `venture_artifacts` table this SD writes to.
- SD-LEO-ORCH-S17-PER-WIREFRAME-001 + children A/B (shipped 2026-05-14, PRs #605/#3764/#3766/#606) — introduced the per-wireframe rendering pattern this SD is collapsing.
- SD-GVOS-S17-PROMPT-QUALITY-ORCH-001 — original `WireframeArtifactCapture` + `useCaptureArtifact` + `venture_wireframe_artifact` migration.

### Open PLAN decisions
- Approval-flag location: column on `ventures` vs column on `venture_artifacts` row vs new `venture_blueprint_approval` table.
- Downstream consumer migration: cutover at merge vs shadow-write for soak period (and how long).
- `artifact_type` enum slot for the new venture-level artifact (`design_mockups` is the default candidate from existing CHECK constraint).
- Whether to delete legacy `venture_wireframe_artifact` rows after migration or leave them for audit history.
