# Claude Phase 2 Opinion -- Group 5: THE_BUILD (Stages 17-22)

## Methodology

This analysis is grounded in direct source code examination of all 6 stage renderer components, the `venture-workflow.ts` configuration file, the `useNextGate` hook, and the `StageRendererProps` interface contract. Every finding below references specific files and line numbers from the EHG frontend codebase.

**Key Evidence Summary**: 5 distinct gate nomenclature patterns across 6 stages. 3 phantom gates rendering decision banners with `gateType: 'none'` in config. Zero ARIA attributes or accessibility semantics across all 1,604 combined lines of renderer code. All 6 components ignore the `venture` prop from `StageRendererProps`. Every stage copy-pastes an identical ~35-line "Full Advisory Details" collapsible block.

---

## Stage-by-Stage Analysis

### Stage 17: `Stage17EnvironmentConfig.tsx` (299 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage17EnvironmentConfig.tsx`
**Config**: `venture-workflow.ts` line 214-222 -- `gateType: 'promotion'`, `stageName: 'Environment Config'`
**Backend**: `stage-17-build-readiness.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 8 | Defensive extraction at lines 84-91: `rawBlockers` array-guarded, `blockerCount` falls back to `blockers.length`, `readinessPct` null-checked. Checklist keyed by category with `CATEGORY_ORDER` (line 75) controlling render sequence. |
| Visual Hierarchy | 8 | Clear top-down flow: Decision banner (line 109) -> 4-col metrics (line 143) -> progress bar (line 179) -> checklist by category (line 189) -> blockers (line 229) -> advisory. Banner prominence is correct for a promotion gate. |
| Responsiveness | 7 | Metric grid uses `grid-cols-2 md:grid-cols-4` (line 143) -- the only stage in this group with a responsive breakpoint on the metric grid. Progress bar is percentage-width. Badge text at 9-10px may be unreadable on small screens. |
| Gate Implementation | 8 | Genuine promotion gate. Decision banner maps `go/conditional_go/no_go` through three parallel lookup tables: `DECISION_BANNER` (line 35), `DECISION_BADGE` (line 41), `DECISION_LABELS` (line 47). Fallback to `no_go` styling (line 110) is sensible. Config confirms `gateType: 'promotion'` at line 218. |
| Accessibility | 2 | Zero `aria-*` attributes, zero `role` attributes, zero `sr-only` labels. Progress bar (line 180) is a bare `<div>` with no `role="progressbar"`, no `aria-valuenow`, no `aria-valuemin/max`. Collapsible uses Radix (inherits some keyboard support) but no explicit ARIA on the trigger. |

**Top 3 Strengths:**
1. **Best metric grid responsiveness in the group** -- `grid-cols-2 md:grid-cols-4` (line 143) is the correct responsive pattern that Stages 18, 21, 22 fail to implement.
2. **Strong defensive data handling** -- `blockerCount` double-fallback at line 90 (`ad?.blocker_count ?? blockers.length`) handles both top-level aggregate and derived count.
3. **Well-structured checklist rendering** -- `CATEGORY_ORDER` array (line 75) with `CATEGORY_LABELS` fallback (line 202: `?? catKey`) ensures unknown categories render their raw key rather than silently dropping.

**Top 3 Concerns:**
1. **Naming mismatch** -- Component is `Stage17EnvironmentConfig` but renders "Build Readiness Promotion Gate" (line 118). Config says `stageName: 'Environment Config'` (venture-workflow.ts line 215). Backend file is `stage-17-build-readiness.js`. Three different names for one concept. Gap Importance: 3.
2. **Checklist silently drops unknown categories** -- `CATEGORY_ORDER` on line 75 iterates only 5 fixed categories. If the backend sends a 6th category (e.g., `compliance`), it renders nothing. The `CATEGORY_LABELS[catKey] ?? catKey` fallback at line 202 is good but unreachable for keys not in `CATEGORY_ORDER`. Gap Importance: 3.
3. **Missing data indistinguishable from zero** -- `totalItems ?? 0` (line 149) and `completedItems ?? 0` (line 157) mean "no data loaded" and "legitimately zero items" look identical. Gap Importance: 3.

**Top 3 Recommendations:**
1. After iterating `CATEGORY_ORDER`, render any remaining categories not in the order array, using the raw key as label.
2. Add `role="progressbar"` with `aria-valuenow={readinessPct}` `aria-valuemin={0}` `aria-valuemax={100}` to the progress bar div at line 180.
3. Use a loading/skeleton state when `ad` is undefined, distinct from the zero-value state.

---

### Stage 18: `Stage18MvpDevelopmentLoop.tsx` (225 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage18MvpDevelopmentLoop.tsx`
**Config**: `venture-workflow.ts` line 223-229 -- `gateType: 'none'`, `stageName: 'MVP Development Loop'`
**Backend**: `stage-18-sprint-planning.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 7 | Derived fallbacks for `totalItems` (line 70: `?? items.length`) and `totalPoints` (line 71: `?? items.reduce(...)`) are good. `sd_bridge_payloads` is excluded in `ADVISORY_EXCLUDE` (line 75) and never rendered anywhere -- data loss. Average points computation (line 122) guards against division by zero. |
| Visual Hierarchy | 7 | Sprint goal banner (line 86) correctly sits at top with blue informational styling. Item cards (line 136) show priority/type/layer badges in logical left-to-right order. Story points in outline badge at top-right of each card (line 142). |
| Responsiveness | 4 | Metric grid is **fixed** `grid-cols-3` with no responsive breakpoint (line 99). On mobile, three columns compress to unreadable widths. No `md:` or `sm:` prefixes. This is the first of three stages in this group with this problem. |
| Gate Implementation | N/A | Correctly has no gate. Config confirms `gateType: 'none'`. No decision banner rendered. Architecturally appropriate -- sprint planning is informational, not a decision point. |
| Accessibility | 2 | Zero `aria-*` or `role` attributes. Sprint item cards are flat `<div>` elements with no semantic list markup (`<ul>/<li>`). Badge color alone conveys priority/type -- no text-only fallback for color-blind users (though text labels are present within badges). |

**Top 3 Strengths:**
1. **Intelligent derived fallbacks** -- `totalPoints` at line 71 computes from item array when top-level field is missing, preventing silent zero display.
2. **Rich badge taxonomy** -- Three independent badge dimensions (priority, type, architecture layer) on lines 149-163 give immediate multi-axis scanning capability per item.
3. **Sprint goal banner correctly prioritized** -- Blue informational banner (line 87) with sprint name and duration badge sets context before detailed items appear.

**Top 3 Concerns:**
1. **`sd_bridge_payloads` silently dropped** -- Listed in `ADVISORY_EXCLUDE` (line 75) but never rendered in any section. This is cross-SD orchestration data with no UI surface. Gap Importance: 4.
2. **Fixed 3-column grid has no responsive fallback** -- `grid-cols-3` at line 99 will compress to ~100px columns on 375px mobile screens. Stage 17 and 19-20 use `grid-cols-2 md:grid-cols-4` correctly. Gap Importance: 3.
3. **No empty state** -- When `items` is empty and no `sprintGoal` exists, the component renders only the advisory collapsible (or nothing). No indication that sprint planning has not yet begun. Gap Importance: 3.

**Top 3 Recommendations:**
1. Surface `sd_bridge_payloads` in a compact card or collapsible section showing cross-SD dependencies.
2. Change `grid-cols-3` to `grid-cols-2 md:grid-cols-4` and add a 4th metric (e.g., Sprint Duration from `sprint_duration_days`).
3. Add an explicit "Sprint planning not yet started" empty state when `!sprintGoal && items.length === 0`.

---

### Stage 19: `Stage19IntegrationApiLayer.tsx` (260 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage19IntegrationApiLayer.tsx`
**Config**: `venture-workflow.ts` line 232-238 -- `gateType: 'none'`, `stageName: 'Integration & API Layer'`
**Backend**: `stage-19-build-execution.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 8 | Three-tier fallback for metrics: top-level field -> derived from tasks array -> zero (lines 73-76). `completionPct` on line 76 computes `Math.round((completedTasks / totalTasks) * 100)` when top-level is missing. Task `description` field exists in interface (line 24) but is never rendered. |
| Visual Hierarchy | 7 | Decision banner -> 4-col metrics -> progress bar -> task list -> issues. Logical flow. Issues section uses amber header (line 198) to distinguish from task list. Progress bar color thresholds (line 155: 80/50) match Stage 17's pattern. |
| Responsiveness | 7 | Metric grid uses `grid-cols-2 md:grid-cols-4` (line 117) -- correct responsive pattern matching Stage 17. Progress bar is percentage-width. Task list items are single-row flex layouts that compress well. |
| Gate Implementation | 3 | **Phantom gate.** `COMPLETION_BANNER` at line 36 with values `complete/continue/blocked` renders a full decision banner (lines 94-113) that looks indistinguishable from Stage 17's promotion gate. But config says `gateType: 'none'` (venture-workflow.ts line 237). `useNextGate` hook (line 40: `s.gateType !== "none"`) skips this entirely. Users see "BLOCKED" in red but can freely advance. |
| Accessibility | 2 | Zero `aria-*` attributes. Progress bar (line 153) has no `role="progressbar"`. Task list is `<div>` elements, not `<ul>/<li>`. QA Ready badge (line 105) conveys status via color only (though text "QA Ready" is present). |

**Top 3 Strengths:**
1. **Robust three-tier metric derivation** -- `completedTasks` (line 74) falls back to filtering the tasks array for `status === "done"`, then `completionPct` (line 76) derives from that. Resilient against partial backend data.
2. **QA readiness badge** -- Line 104-108 surfaces `readyForQa` as an emerald badge within the banner, providing forward-looking context about downstream stage 20.
3. **Issue severity separation** -- Issues rendered in a distinct amber-titled card (line 198) with per-issue severity badges (line 205-206), clearly separated from the task progress section.

**Top 3 Concerns:**
1. **Phantom gate is trust-breaking** -- The `COMPLETION_BANNER` (lines 36-46) renders a red "BLOCKED" badge identical in visual weight to Stage 17's "NO-GO" promotion gate. But `gateType: 'none'` means the workflow engine ignores it. A user seeing "BLOCKED" who then advances will lose trust in all gate indicators. Gap Importance: 5.
2. **Task descriptions never rendered** -- The `Task` interface (line 24) includes `description?: string`, and tasks may carry descriptions from the backend, but the task list (lines 168-188) only renders `name`, `status`, `sprint_item_ref`, and `assignee`. Gap Importance: 3.
3. **Completion banner uses unique nomenclature** -- `complete/continue/blocked` is distinct from Stage 17's `go/conditional_go/no_go`, Stage 20's `pass/conditional_pass/fail`, Stage 21's `approve/conditional/reject`, and Stage 22's `release/hold/cancel`. Five incompatible value sets in one group. Gap Importance: 4.

**Top 3 Recommendations:**
1. Either promote to a real gate (`gateType: 'promotion'` in config) or restyle the banner as informational (blue background, "Status Summary" label, remove decision-weight terminology like "BLOCKED").
2. Add a collapsible or inline `description` display to task cards when the field is populated.
3. If keeping as a decision indicator, map `complete/continue/blocked` to the canonical enum (e.g., `pass/conditional/fail`) at the rendering boundary.

---

### Stage 20: `Stage20SecurityPerformance.tsx` (272 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage20SecurityPerformance.tsx`
**Config**: `venture-workflow.ts` line 243-249 -- `gateType: 'none'`, `stageName: 'Security & Performance'`
**Backend**: `stage-20-quality-assurance.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 8 | Extracts both aggregate metrics (`overallPassRate`, `coveragePct`, `criticalFailures`, `totalTests` at lines 72-75) and per-suite details (`test_suites` at line 68). Per-suite pass rate derived at line 168-170 with guard against zero total. `qualityGatePassed` boolean (line 76) coexists with `qualityDecision` object (line 77) -- redundant but handled. |
| Visual Hierarchy | 8 | Decision banner -> 4-col metrics -> test suite cards with inline progress bars -> known defects. Test suite cards (lines 172-199) are the visual highlight: name, type badge, pass count ratio, inline progress bar, and coverage. Strong scan-ability. |
| Responsiveness | 7 | Metric grid uses `grid-cols-2 md:grid-cols-4` (line 118). Suite cards and defect list use full-width stacking. Progress bars within suites are flex with percentage width (line 188-190). |
| Gate Implementation | 2 | **Most deceptive phantom gate in the group.** The banner explicitly says "Quality Gate" (line 104) and renders "Gate Passed"/"Gate Failed" badges (lines 106-108) using `qualityGatePassed`. This is the strongest gate-language in any phantom gate -- it literally uses the word "Gate" twice. Config: `gateType: 'none'`. `useNextGate` skips it. Users see "Gate Failed" in red and can still proceed. |
| Accessibility | 2 | Zero `aria-*` attributes. Per-suite progress bars (line 187-191) are bare divs. Color-coded pass rate metrics (line 124: conditional coloring by threshold) have no text-alternative beyond the number. Defect list is not a semantic list. |

**Top 3 Strengths:**
1. **Best data visualization in the group** -- Per-suite test cards (lines 167-199) combine name, type badge, numeric ratio, inline progress bar, and coverage percentage in a compact, highly scannable layout.
2. **Threshold-aware metric coloring** -- Pass rate (line 124) uses 95%/85% thresholds; coverage (line 134) uses 60% threshold. These align with industry-standard quality benchmarks and provide immediate visual signal.
3. **Dual quality signal** -- Both `qualityDecision.decision` (semantic: pass/conditional_pass/fail) and `qualityGatePassed` (boolean) are surfaced, giving both nuanced and binary quality assessment.

**Top 3 Concerns:**
1. **Strongest phantom gate deception** -- Line 104 says "Quality Gate", lines 106-108 say "Gate Passed"/"Gate Failed". This is not just a status indicator -- it explicitly claims to be a gate. With `gateType: 'none'` in config, this is the single most trust-breaking UI element in the entire 25-stage workflow. Gap Importance: 5.
2. **Aggregate metrics not derived from suite data** -- `overallPassRate` (line 72) reads from top-level `ad?.overall_pass_rate` with no fallback to computing from `test_suites`. If the backend omits the aggregate but provides suites, the display shows "--" while individual suites show valid data. Gap Importance: 3.
3. **Naming mismatch is the worst in the group** -- "Security & Performance" (config) vs "Quality Assurance" (backend/content). These are entirely different concepts in software engineering. A user looking for security audit data or performance benchmarks will find test suites and defects instead. Gap Importance: 4.

**Top 3 Recommendations:**
1. **Promote to `gateType: 'promotion'` immediately.** This is the single highest-priority change in Group 5. A quality gate that says "Gate Failed" but doesn't block is actively harmful. Of all 3 phantom gates, this one has the strongest case for enforcement.
2. Add fallback computation: if `overall_pass_rate` is null, derive it from `suites.reduce()` over `passing_tests / total_tests`.
3. Rename to `Stage20QualityAssurance.tsx` and update `venture-workflow.ts` `stageName` to `'Quality Assurance'`.

---

### Stage 21: `Stage21QaUat.tsx` (237 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage21QaUat.tsx`
**Config**: `venture-workflow.ts` line 251-258 -- `gateType: 'none'`, `stageName: 'QA & UAT'`
**Backend**: `stage-21-build-review.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 7 | Integration test data extraction (lines 64-71) with derived fallbacks for `passingIntegrations` (line 68: filter for `status === "pass"`), `passRate` (line 69: computed from ratio), and `allPassing` (line 70). `failing_integrations` is in `ADVISORY_EXCLUDE` (line 77) but never surfaced -- count of failures is derivable but not shown as a metric. |
| Visual Hierarchy | 7 | Decision banner -> 3-col metrics -> integration test cards with source->target flow -> advisory. Integration cards (lines 162-191) with conditional red background for failures (line 165) and inline error messages (line 186) are well-structured. |
| Responsiveness | 4 | Metric grid is **fixed** `grid-cols-3` (line 123) with no responsive breakpoint. Second occurrence of this problem in the group (also Stage 18). Integration cards stack well but the metric grid will compress badly on mobile. |
| Gate Implementation | 3 | **Phantom gate.** `REVIEW_BANNER` (lines 32-36) with `approve/conditional/reject` renders a decision banner saying "APPROVED"/"CONDITIONAL"/"REJECTED" (line 95). The "REJECTED" state in red is gate-like language. Config: `gateType: 'none'`. A reviewer rejection that doesn't block advancement undermines the review process. |
| Accessibility | 2 | Zero `aria-*` attributes. No semantic list for integrations. The source->target arrow (line 181: `<span>-></span>`) is a visual indicator with no text alternative for screen readers. Environment badge color-codes without ARIA label. |

**Top 3 Strengths:**
1. **Source-to-target integration flow** -- Lines 178-184 render `source -> target` directional flow for each integration test, making data flow dependencies immediately visible.
2. **Inline error messages for failures** -- Line 185-188 renders `errorMessage` in a red background inline with the failing integration card, giving developers immediate debug context without expanding anything.
3. **Environment badge** -- Line 98-101 renders the testing environment (`development`/`staging`/`production`) with color-coded badges, giving instant context about the test scope.

**Top 3 Concerns:**
1. **Phantom gate with "REJECTED" language** -- Line 95 renders "REJECTED" in a red banner for `decision === "reject"`. In standard software review workflows, "rejected" is a blocking state. Allowing advancement after rejection contradicts universal review semantics. Gap Importance: 4.
2. **Fixed 3-column metric grid** -- Line 123 uses `grid-cols-3` without responsive breakpoint. Third metric ("Status") renders "All Pass" or "Issues" which could be a boolean badge instead of consuming a full column. Gap Importance: 3.
3. **`failing_integrations` excluded but not summarized** -- In `ADVISORY_EXCLUDE` (line 77) alongside other surfaced fields. The count of failing integrations is valuable as a top-level metric but is only derivable by scanning the full integration list. Gap Importance: 3.

**Top 3 Recommendations:**
1. Either promote to `gateType: 'promotion'` (preferred -- build reviews should block) or rephrase "REJECTED" to "Issues Found" and restyle as informational.
2. Change to `grid-cols-2 md:grid-cols-4` and add a 4th metric for failing integration count.
3. Add `aria-label` to the source->target flow pattern for screen reader comprehension.

---

### Stage 22: `Stage22Deployment.tsx` (319 LOC)

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage22Deployment.tsx`
**Config**: `venture-workflow.ts` line 262-268 -- `gateType: 'promotion'`, `stageName: 'Deployment'`
**Backend**: `stage-22-release-readiness.js`

| Dimension | Score | Evidence |
|-----------|------:|----------|
| Data Handling | 8 | Richest data extraction in the group: `releaseItems` (line 66), `releaseNotes` (line 67), `targetDate` (line 68), `sprintSummary` (line 73), `sprintRetrospective` (line 74), `promotionGate` (line 75). `allApproved` boolean (line 71) with derived fallback for `approvedItems` (line 70). Two independent collapsible sections (retro at line 63, advisory at line 61). |
| Visual Hierarchy | 8 | Decision banner -> 3-col metrics -> sprint summary -> release items -> release notes -> retro (collapsible) -> advisory (collapsible). This is the deepest content hierarchy in the group. Release notes get their own blue informational banner (line 224). Sprint retro uses +/- /arrow symbols for went well/poorly/action items (lines 251, 263, 275). |
| Responsiveness | 4 | Metric grid is **fixed** `grid-cols-3` (line 122) with no responsive breakpoint. Third occurrence. Release item list is flex-based and collapses acceptably. Sprint summary uses flex justify-between which works at all widths. |
| Gate Implementation | 7 | Genuine promotion gate. `RELEASE_BANNER` (lines 29-33) with `release/hold/cancel`. Correctly includes `promotionGate.pass` boolean badge (line 110) and blocker awareness (line 75). However, the `release/hold/cancel` nomenclature is the 5th distinct value set in this group. Also, `allApproved` falling through to `"Pending"` (line 145) conflates "not all approved" with "unknown data state". |
| Accessibility | 2 | Zero `aria-*` attributes across 319 lines. Sprint retro symbols (+, -, arrow at lines 251, 263, 275) are decorative spans with no ARIA labels. Two collapsible sections inherit basic keyboard from Radix but have no explicit ARIA. |

**Top 3 Strengths:**
1. **Richest content integration** -- Uniquely synthesizes sprint summary, release items with approval status, release notes, and sprint retrospective. This is the most comprehensive single-stage view in the group.
2. **Sprint retrospective visualization** -- Lines 245-281 use semantic symbols (+/-/arrow) with color-coded section headers (emerald/red/blue) to separate "went well", "went poorly", and "action items". Clear and immediately parseable.
3. **Proper promotion gate with multi-signal decision** -- Decision banner combines `releaseDecision` (semantic decision), `targetDate` (timeline context), and `promotionGate.pass` (binary enforcement) in one banner. Most information-dense gate in the group.

**Top 3 Concerns:**
1. **5th distinct gate nomenclature** -- `release/hold/cancel` (lines 29-33) is unique to this stage. Across the group: go/conditional_go/no_go, complete/continue/blocked, pass/conditional_pass/fail, approve/conditional/reject, release/hold/cancel. Five incompatible enums for conceptually identical tri-state decisions. Gap Importance: 4.
2. **`allApproved` false-positive "Pending"** -- Line 145: `allApproved ? "Ready" : "Pending"`. When `allApproved` is `undefined` (data not loaded), this shows "Pending" with amber styling, which falsely implies items exist but are awaiting approval. Gap Importance: 3.
3. **Fixed 3-column metric grid** -- Line 122 uses `grid-cols-3` without responsive breakpoint. Matches Stage 18 and 21's pattern, inconsistent with Stage 17/19/20's responsive pattern. Gap Importance: 3.

**Top 3 Recommendations:**
1. Map `release/hold/cancel` to a canonical gate enum at the rendering boundary. Internal storage can use domain-specific terms; display should use consistent vocabulary.
2. Add a tri-state for the Status metric: "Ready" (allApproved true), "Pending" (allApproved false), and "Loading" or "--" (allApproved undefined).
3. Change to `grid-cols-2 md:grid-cols-4` and add a 4th metric (e.g., "Target Date" as a formatted card rather than inline in the banner).

---

## Group-Level Synthesis Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| **Logic & Flow** | 8/10 | The strongest sequential narrative in the 25-stage workflow. Readiness (17) -> Plan (18) -> Execute (19) -> Test (20) -> Review (21) -> Release (22) is a textbook SDLC. Data flows logically forward: Stage 18's sprint items feed Stage 19's tasks; Stage 19's QA readiness badge previews Stage 20; Stage 20's quality metrics feed Stage 21's review; Stage 22 aggregates everything. |
| **Functionality** | 7/10 | All 6 renderers correctly extract and display their data. Defensive fallbacks are consistent. The two genuine gates (17, 22) work. Deduction: 3 phantom gates actively mislead users about workflow enforcement, and `sd_bridge_payloads` is silently dropped in Stage 18. |
| **UI/Visual Design** | 7/10 | Strong overall aesthetic with consistent Card/Badge/Collapsible patterns. Test suite progress bars (Stage 20) and source->target flow (Stage 21) are visual highlights. Deduction: metric grid inconsistency (Stages 17/19/20 use 4-col responsive; Stages 18/21/22 use fixed 3-col) breaks cross-stage visual rhythm. |
| **UX/Workflow** | 5/10 | All 6 stages have naming mismatches between component name, config `stageName`, and backend file name. Stage 20's "Security & Performance" vs "Quality Assurance" is the worst mismatch -- fundamentally different concepts. 5 different gate value sets in 6 stages means users must re-learn decision vocabulary at every step. |
| **Architecture** | 4/10 | The "Full Advisory Details" collapsible block (identical ~35-line pattern) is copy-pasted 6 times with only the `ADVISORY_EXCLUDE` array varying. `STATUS_COLORS`/`SEVERITY_COLORS` are redeclared with identical values in Stages 17/19/20. Each stage declares its own banner/badge/label lookup tables. None of the 6 stages destructure the `venture` prop from `StageRendererProps`. The `useNextGate` hook (line 40) filters by `gateType !== "none"` which means phantom gates are architecturally invisible -- they exist only in renderer code, not in any shared gate infrastructure. |

---

## Cross-Stage Analysis

### 1. Build Cycle Coherence (Strong)
The 6-stage sequence is the most credible end-to-end workflow in the entire 25-stage system. Each stage has a clear predecessor dependency and successor expectation. Stage 17's readiness checklist gates entry to the build cycle; Stage 18 plans the work; Stage 19 tracks execution; Stage 20 validates quality; Stage 21 reviews integrations; Stage 22 packages for release. There are no redundant stages, and none are missing from a standard SDLC perspective.

### 2. Phantom Gate Crisis (Critical -- Group's Single Biggest Problem)
Three consecutive stages (19, 20, 21) render decision banners that are visually indistinguishable from the genuine promotion gates at Stages 17 and 22. Concrete evidence:

| Stage | Banner Constant | Values | Strongest Term | Config `gateType` | `useNextGate` Visible? |
|-------|----------------|--------|---------------|-------------------|----------------------|
| 17 | `DECISION_BANNER` (line 35) | go/conditional_go/no_go | "NO-GO" | `promotion` | Yes |
| 19 | `COMPLETION_BANNER` (line 36) | complete/continue/blocked | "BLOCKED" | `none` | No |
| 20 | `QUALITY_BANNER` (line 36) | pass/conditional_pass/fail | "Gate Failed" (line 107) | `none` | No |
| 21 | `REVIEW_BANNER` (line 32) | approve/conditional/reject | "REJECTED" (line 95) | `none` | No |
| 22 | `RELEASE_BANNER` (line 29) | release/hold/cancel | "CANCEL" | `promotion` | Yes |

Stage 20 is the worst offender because it explicitly uses the word "Gate" twice in its UI (lines 104, 107). The `useNextGate` hook at `C:\Users\rickf\Projects\_EHG\ehg\src\hooks\useNextGate.ts` line 40 confirms these phantom stages are architecturally invisible: `s.gateType !== "none"` skips them entirely.

**Recommended resolution priority**: Stage 20 first (promote to `gateType: 'promotion'`), Stage 21 second (promote or rephrase), Stage 19 third (restyle as informational status).

### 3. Gate Nomenclature Fragmentation (5 patterns in 6 stages)
This is the epicenter of the taxonomy crisis across the entire 25-stage workflow. The tri-state pattern is conceptually identical -- green/amber/red -- but each stage invents its own vocabulary:

```
Stage 17: go          | conditional_go   | no_go      (DECISION_BANNER)
Stage 19: complete    | continue         | blocked    (COMPLETION_BANNER)
Stage 20: pass        | conditional_pass | fail       (QUALITY_BANNER)
Stage 21: approve     | conditional      | reject     (REVIEW_BANNER)
Stage 22: release     | hold             | cancel     (RELEASE_BANNER)
```

A canonical internal enum like `PASS | CONDITIONAL | FAIL` with per-stage display labels would reduce 5 independent type systems to 1.

### 4. Code Duplication Audit

**Identical "Full Advisory Details" collapsible** (each instance ~35 lines):
- Stage 17: lines 260-296
- Stage 18: lines 186-222
- Stage 19: lines 221-257
- Stage 20: lines 233-269
- Stage 21: lines 198-234
- Stage 22: lines 289-316

Total: ~210 lines of identical code (only `ADVISORY_EXCLUDE` varies). This is a clear extraction candidate for a shared `<AdvisoryDetailsCollapsible excludeKeys={[...]} data={ad} />` component.

**Duplicated color maps** -- `SEVERITY_COLORS` with identical values appears in Stages 17 (line 68), 19 (line 55 as `ISSUE_SEVERITY`), and 20 (line 54 as `DEFECT_SEVERITY`). `STATUS_COLORS` with overlapping values appears in Stages 17 (line 53), 19 (line 48 as `TASK_STATUS_COLORS`), and 21 (line 44). These should live in a shared `stage-colors.ts` utility.

### 5. Metric Grid Inconsistency (Split Pattern)

| Stage | Grid Class | Responsive? | Column Count |
|-------|-----------|-------------|-------------|
| 17 | `grid-cols-2 md:grid-cols-4` (line 143) | Yes | 2 -> 4 |
| 18 | `grid-cols-3` (line 99) | No | Fixed 3 |
| 19 | `grid-cols-2 md:grid-cols-4` (line 117) | Yes | 2 -> 4 |
| 20 | `grid-cols-2 md:grid-cols-4` (line 118) | Yes | 2 -> 4 |
| 21 | `grid-cols-3` (line 123) | No | Fixed 3 |
| 22 | `grid-cols-3` (line 122) | No | Fixed 3 |

Three stages responsive, three stages fixed. This split appears unintentional -- the fixed-3 stages simply have fewer natural metrics (3 each) while the responsive-4 stages have 4 metrics. The fix is to standardize on `grid-cols-2 md:grid-cols-4` for all, adding a 4th metric to stages 18, 21, and 22 (candidates: Sprint Duration, Failing Count, Target Date respectively).

### 6. Accessibility Deficit (Zero across all 6 stages)
Combined 1,604 lines of renderer code contain zero `aria-*` attributes, zero `role` attributes, zero `sr-only` labels, and zero `tabIndex` additions. Specific gaps:
- Progress bars (Stages 17, 19, 20 suite-level) are bare `<div>` elements -- need `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
- Decision banners convey critical status through color alone (green/amber/red) -- need `aria-live="polite"` for dynamic updates.
- List-like content (checklist items, tasks, integrations, release items) rendered as `<div>` chains -- should use semantic `<ul>/<li>`.
- Collapsible triggers inherit Radix's keyboard support but have no explicit `aria-expanded` or `aria-controls` (Radix may inject these; worth verifying).

### 7. `venture` Prop Universally Ignored
All 6 components import `StageRendererProps` (which includes `stageData`, `venture`, `className`) but only destructure `stageData` and `className`. The `venture` prop is never used. This means none of these renderers can access venture-level context (venture name, current stage number, venture status) without a code change.

---

## The 3 Most Impactful Changes

### 1. Resolve the Phantom Gate Crisis and Standardize Gate Nomenclature
**What**: Promote Stage 20 to `gateType: 'promotion'` in `venture-workflow.ts`. Promote or rephrase Stage 21. Restyle Stage 19 as informational. Define a canonical `GateDecision = 'pass' | 'conditional' | 'fail'` type and map all banner constants to it.
**Why**: Stage 20 explicitly says "Quality Gate Failed" but doesn't block. This is the single most trust-breaking element in the entire 25-stage workflow. Combined with 5 incompatible nomenclature patterns, users cannot build reliable mental models of what banners mean or which decisions actually enforce anything.
**Impact**: Eliminates the highest-severity functional gap (phantom gates), reduces 5 banner type systems to 1, and restores trust in all gate indicators system-wide.

### 2. Extract Shared Rendering Primitives
**What**: Create 3 shared components: (a) `<AdvisoryDetailsCollapsible>` (replaces ~210 lines of duplicated code), (b) `<DecisionBanner>` parameterized by decision values and labels (replaces 5 independent banner implementations), (c) `<MetricGrid>` with responsive `grid-cols-2 md:grid-cols-4` default. Also extract `SEVERITY_COLORS`, `STATUS_COLORS`, and `PRIORITY_COLORS` into a shared `stage-colors.ts`.
**Why**: The advisory collapsible is copied verbatim 6 times. The banner pattern is structurally identical (3-state, color-mapped, with badge + label + optional detail). The metric grid's responsive/fixed split is unintentional. Centralizing these eliminates ~400 lines of duplication, enforces visual consistency, and makes cross-stage changes a single edit.
**Impact**: Reduces total Group 5 code by roughly 25%, eliminates the metric grid inconsistency, and creates reusable primitives for the other 19 stages.

### 3. Fix All 6 Naming Mismatches and Add Accessibility Foundations
**What**: Rename components and update `venture-workflow.ts` `stageName` values to match their actual content. Add `role="progressbar"` with ARIA attributes to all progress bars. Add `aria-live="polite"` to decision banners. Convert list-like `<div>` chains to semantic `<ul>/<li>`.
**Why**: The naming mismatches are not just cosmetic -- "Security & Performance" vs "Quality Assurance" (Stage 20) represents fundamentally different concepts and actively misdirects developers and users. The complete absence of accessibility semantics across 1,604 lines means the build cycle is unusable for screen reader users. These are complementary changes that address the UX and accessibility dimensions simultaneously.
**Impact**: Resolves the 100% naming mismatch rate, brings accessibility from near-zero to baseline WCAG 2.1 A compliance for the group, and aligns the codebase with what the UI actually renders.
