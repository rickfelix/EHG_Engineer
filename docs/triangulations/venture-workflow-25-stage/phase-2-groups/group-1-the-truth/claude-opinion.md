# Claude Phase 2 Opinion -- Group 1: THE_TRUTH (Stages 1-5)

**Reviewer**: Claude (Opus 4.6)
**Advantage**: Full codebase access with line-level verification
**Date**: 2026-03-10

---

## High-Impact Findings (Evidence-Based)

1. **Stage 5 ignores `stageData.gateDecision` entirely** -- confirmed via grep. The component reads its gate decision exclusively from `advisory.decision` (line 116 of `Stage5ProfitabilityForecasting.tsx`). If the chairman overrides the AI recommendation, the UI will display the wrong verdict. **Stage 3 partially addresses this** -- it reads `stageData.gateDecision` at line 89 for `healthScore`, `rationale`, and `briefData`, but derives the 3-way decision from `advisory.decision` first (line 97-98), falling back to `deriveDecision(healthScore)`. This means Stage 3 has a soft dependency on gateDecision but not a definitive one. Gap Importance: **5**.

2. **`BuildingMode.tsx` forces compact layout for ALL stages** -- confirmed at lines 55-56. The variables `isDesignStandardsStage` and `isEarlyStage` are both hardcoded to `true`, which means the 5-tab layout branch (lines 264-310) is dead code. The prompt's concern about a "compact to full layout transition at Stage 4" is **stale**. Both OpenAI and Gemini correctly identified this. Gap Importance: **4** (dead code, architecture confusion).

3. **A shared `StageEmptyState` component exists but Stages 4 and 5 do not use it** -- The file `shared/StageEmptyState.tsx` provides a clean empty-state card with stage name and contextual messaging. Stage 1 has its own loading spinner, Stage 2 has its own, Stage 3 has `ValidationProgressView`. Stages 4 and 5 have **no loading or empty state at all** -- if `advisoryData` is null, they render an empty `div` with `space-y-3` class and nothing visible. Gap Importance: **4**.

---

## Dispute Log: OpenAI and Gemini Claims

### OpenAI Claim: "Stage 3 ignores stageData.gateDecision.decision"
**Partially correct, partially wrong.** Stage 3 reads `stageData.gateDecision` at line 89 and uses it for `healthScore` (line 91), `rationale` (line 93), and `briefData` (line 94). However, the decision derivation chain at lines 97-98 prefers `advisory.decision` over the gate's own decision field. The fix is to check `gate?.decision` first in the priority chain, not to say Stage 3 "ignores" gateDecision entirely.

### OpenAI Claim: "Stage 5 ignores stageData.gateDecision"
**Correct.** Verified via grep: zero references to `gateDecision` in `Stage5ProfitabilityForecasting.tsx`.

### Gemini Claim: "Stage 2 dark mode issue is Gap 4 (Significant)"
**Correct but slightly overstated.** The colors `text-yellow-500`, `text-green-500`, `text-red-500` (lines 61, 132, 140, 152, 160) lack `dark:` variants. However, Tailwind's default `yellow-500`, `green-500`, and `red-500` are midtone hues that remain legible on most dark backgrounds. The issue is real but is more accurately a Gap 3 (Moderate) rather than Gap 4, because the colors do not "break" in dark mode -- they just lack the brightness adjustment that other stages provide.

### Gemini Claim: "Stage 5 kill gate is Gap 5 (Critical) -- fundamentally misplaced"
**Disagree.** This is a product philosophy opinion, not a code defect. The kill gate's `conditional_pass` path (line 58, line 229) explicitly provides a soft landing with `remediationRoute` text. The gate already functions as a "guidance checkpoint" when the backend returns `conditional_pass`. The real question is whether the backend model is accurate enough to warrant a hard `kill` outcome -- but that is a backend calibration issue, not a frontend code concern. I rate this Gap 2 (Minor, product-level debate) for the frontend review.

### Gemini Claim: "Stage 3 animation takes 36 seconds"
**Wrong.** The animation runs 9 steps at 4000ms each, but line 379 caps advancement: once `activeStep` reaches `VALIDATION_STEPS.length - 1` (index 8), the interval continues firing but the step counter stops incrementing. The animation takes at most 32 seconds (8 transitions x 4s), not 36. More importantly, this view only appears when `!hasAnyContent && stageData.artifacts.length === 0` (line 133), meaning it only shows before ANY data arrives. Once the backend responds, React re-renders and the actual results replace the animation. The effective wait time is backend latency, not animation duration.

### Gemini Claim: "Stage 4 has an abrupt layout transition to 5-tab layout (Gap 4)"
**Incorrect under current code.** `BuildingMode.tsx` hardcodes `isDesignStandardsStage = true` (line 55), so all stages use the compact header layout. There is no layout transition. This claim is based on stale architecture assumptions from the prompt.

---

## Per-Stage Analysis

### Stage 1: Draft Idea (`Stage1DraftIdea.tsx`, 124 LOC)
**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage1DraftIdea.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 8/10 | Safe fallback chain: advisory -> venture -> stage_zero. Minor: no runtime type validation (line 21-23 use `as` casts). |
| Visual Hierarchy | 8/10 | Venture name + status badge in card header, seed text in highlighted block, metadata below. Clear progression. |
| Responsiveness | 7/10 | Single-column layout works on all viewports. No breakpoints needed at this simplicity level, but the AdvisoryDataPanel below uses `sm:grid-cols-2`. |
| Gate Implementation | N/A | Not a gate stage. |
| Accessibility | 7/10 | Uses semantic `Card`/`Badge` components. No `aria-` labels on the loading spinner (line 38). Text contrast is good via `text-muted-foreground`. |

**Top 3 Strengths**
1. **Graceful degradation** (lines 35-42, 72-98): Falls back from advisory data to venture-level data to stage_zero data. The user always sees something meaningful.
2. **Shared component reuse** (lines 118-121): `AdvisoryDataPanel` with `exclude` prop and `ArtifactListPanel` keep the component to 124 LOC -- the leanest in the group.
3. **Clean loading state** (lines 36-42): A centered spinner with contextual message appears only when no data source has content.

**Top 3 Concerns**
| Concern | Gap |
|---------|-----|
| Unsafe `as` casts on advisory data (lines 21-23). If backend sends an object where a string is expected, it will render `[object Object]`. | 2 |
| Loading spinner lacks `aria-label` or `role="status"` for screen readers. | 2 |
| No timestamp or provenance metadata shown. User cannot tell when the idea was captured or which AI processed it. | 1 |

**Top 3 Recommendations**
1. Use `ensureString()` from `shared/stage-primitives.ts` (which already exists at line 97-99 of that file) instead of raw `as string` casts.
2. Add `role="status"` and `aria-label="Loading stage data"` to the spinner div.
3. Consider surfacing `stageData.stageStatus` change timestamp if available from the backend.

---

### Stage 2: AI Review (`Stage2AIReview.tsx`, 176 LOC)
**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage2AIReview.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 7/10 | Good pending-state logic (line 79). But `strengths` and `weaknesses` arrays are cast-not-validated (lines 22-23). If an element is an object, it renders as `[object Object]`. |
| Visual Hierarchy | 8/10 | Score displayed prominently with star icon (line 60-66), recommendation in highlighted block (line 70), strengths/weaknesses in side-by-side grid (line 127). |
| Responsiveness | 8/10 | `grid-cols-1 sm:grid-cols-2` on the strengths/weaknesses grid (line 127) is a sensible breakpoint. |
| Gate Implementation | N/A | Not a gate stage. |
| Accessibility | 5/10 | Hardcoded colors without `dark:` variants at 5 locations (lines 61, 132, 140, 152, 160). Score communicated only through number + color icon -- no semantic label like "Good" or "Needs Work". |

**Top 3 Strengths**
1. **Pending context preservation** (lines 79-123): Venture description, solution, and target market remain visible while AI review processes. This keeps the user oriented.
2. **2-column strengths/weaknesses grid** (lines 127-169): Scannable side-by-side layout with `ThumbsUp`/`ThumbsDown` icons and `+`/`-` markers.
3. **Shared component consistency** (lines 172-173): Same `AdvisoryDataPanel` + `ArtifactListPanel` pattern as Stage 1.

**Top 3 Concerns**
| Concern | Gap |
|---------|-----|
| Five hardcoded color values lack `dark:` variants: `text-yellow-500` (line 61), `text-green-500` (lines 132, 140), `text-red-500` (lines 152, 160). These icons and markers will have reduced contrast on dark backgrounds. | 3 |
| `Math.round(overallScore)` at line 63 will produce `NaN` if the backend sends a string value, because the `as number` cast at line 21 does not validate the type. | 3 |
| Empty `strengths` or `weaknesses` arrays cause the parent grid div (line 127) to render but one Card to be absent, creating asymmetric layout. The `strengths?.length \|\| weaknesses?.length` guard at line 126 evaluates truthy for `[].length` (0) which is falsy, so an empty array actually prevents the entire grid -- this is correct but non-obvious and fragile. | 2 |

**Top 3 Recommendations**
1. Add `dark:` variants: `text-yellow-500 dark:text-yellow-400`, `text-green-500 dark:text-green-400`, `text-red-500 dark:text-red-400`.
2. Guard `overallScore` with `ensureNumber()` from `stage-primitives.ts` and add an accessible text label (e.g., "Score: 72 out of 100").
3. Consider adding an empty state within each card body when the array is present but empty (e.g., "No significant weaknesses identified").

---

### Stage 3: Comprehensive Validation -- Kill Gate (`Stage3ComprehensiveValidation.tsx`, 490 LOC)
**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage3ComprehensiveValidation.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 7/10 | Good normalization for risks (lines 103-105) and go conditions (lines 107-109). Uses `gateDecision` for healthScore/rationale/briefData. But decision derivation prefers `advisory.decision` over `gate.decision` (lines 97-98). Evidence Brief uses `String(value)` which degrades nested objects (line 329). |
| Visual Hierarchy | 9/10 | Decision banner first (lines 148-175), then 3-column grid (line 178), then collapsible evidence. Best information architecture in the group. |
| Responsiveness | 8/10 | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (line 178) provides progressive column count. MetricBar is inherently responsive. |
| Gate Implementation | 7/10 | Correct 3-way logic: PASS >= 70, REVISE >= 50, KILL < 50 (lines 43-48). Dark mode supported on banners (lines 52-58). However, the decision source-of-truth is muddled -- it should prefer `gate.decision` over `advisory.decision`. |
| Accessibility | 7/10 | Collapsible Evidence Brief uses `CollapsibleTrigger` (proper ARIA). Color-coded MetricBar provides numeric label alongside color. Go conditions use `CheckCircle2`/`XCircle` but lack `aria-label`. |

**Top 3 Strengths**
1. **Verdict-first design** (lines 148-167): Decision badge, health score, and rationale appear as the first visual element. A user glancing at the page immediately knows the outcome.
2. **Metric sorting and grouping** (lines 112-118): Metrics sorted worst-first and split into "Failing" and "Passing" groups with count labels and color-coded headers. This makes the decision explainable.
3. **Defensive data handling for polymorphic inputs** (lines 102-109): Both `risk_factors` and `go_conditions` accept `string | object` union types and normalize them into consistent shapes.

**Top 3 Concerns**
| Concern | Gap |
|---------|-----|
| Decision derivation at line 97-98 prefers `advisory.decision` over `gate.decision`. If the chairman overrides the AI via `chairman_decisions`, the UI may show the wrong verdict. The fix is a one-line priority change. | 5 |
| Evidence Brief renders values with `String(value ?? "---")` at line 329. Nested objects degrade to `[object Object]`. Stage 5's advisory details panel (line 413) handles this better with `typeof value === "object" ? JSON.stringify(value) : String(value)`. | 3 |
| `ValidationProgressView` animation runs for up to 32 seconds before the last step stops advancing (line 379). While this is gated behind `!hasAnyContent` and gets replaced by real data on arrival, on slow backends this creates an artificially theatrical waiting experience. | 2 |

**Top 3 Recommendations**
1. Change lines 97-98 to: `const decision3Way = (gate?.decision?.toUpperCase() as GateDecision3Way) ?? advisoryDecision ?? deriveDecision(healthScore)` -- making `gate.decision` the authoritative source.
2. Replace `String(value ?? "---")` in the Evidence Brief (line 329) with a structured renderer that handles objects and arrays, or import `FormatValue` from `AdvisoryDataPanel.tsx`.
3. Consider reducing `STEP_DURATION_MS` from 4000 to 1500-2000ms to keep the animation under 15 seconds, or add a "Skip animation" link.

---

### Stage 4: Competitive Intelligence (`Stage4CompetitiveIntelligence.tsx`, 346 LOC)
**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage4CompetitiveIntelligence.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 9/10 | `normalizeCompetitor()` (lines 76-106) is the strongest defensive normalization in the group -- handles string-only competitors, validates threat level against enum, normalizes SWOT sub-arrays. |
| Visual Hierarchy | 8/10 | Market density banner first (lines 245-278), competitor table second (lines 281-306), advisory details collapsed third. Follows the verdict-first pattern established by Stage 3. |
| Responsiveness | 6/10 | Table layout (lines 289-303) has no horizontal scroll wrapper. On mobile, the 4-column table (`Name | Threat | Pricing | Position`) will be cramped. Position column uses `max-w-[300px] truncate` (line 149) which helps but does not solve the fundamental table-on-mobile problem. |
| Gate Implementation | N/A | Not a gate stage. |
| Accessibility | 5/10 | Table rows are `cursor-pointer` with `onClick` (line 123) but lack `tabIndex`, `role="button"`, and `aria-expanded`. Keyboard users cannot expand SWOT rows. `SwotQuadrant` has good empty state (line 202: "None identified"). |

**Top 3 Strengths**
1. **Robust competitor normalization** (lines 76-106): Handles every edge case -- string-only input, missing fields, invalid threat levels (defaults to "M"), nested SWOT with per-quadrant array validation.
2. **Expandable SWOT in-table** (lines 153-164): SWOT quadrant grid (`grid-cols-1 sm:grid-cols-2`) with 4 color-coded sections hides density until the user requests it. All colors include `dark:` variants (lines 178-183).
3. **Full dark mode support** (lines 52-56, 64-68, 178-183): Every color map includes explicit `dark:` variants, unlike Stage 2.

**Top 3 Concerns**
| Concern | Gap |
|---------|-----|
| No loading/empty state. If `competitors` array is empty and `density` is null, the component renders an empty `div`. The shared `StageEmptyState` component exists in `shared/StageEmptyState.tsx` but is not imported. | 4 |
| Table row expand/collapse is mouse-only (line 123: `onClick`). No `tabIndex`, `onKeyDown`, `role`, or `aria-expanded` attributes. Keyboard and screen-reader users cannot interact with SWOT data. | 4 |
| Advisory details panel (lines 309-342) reimplements the collapsible key-value pattern with `String(value ?? "---")` rendering (line 334), which degrades for nested objects. The existing `AdvisoryDataPanel` shared component handles nested objects properly via `FormatValue`. | 3 |

**Top 3 Recommendations**
1. Add `StageEmptyState` import and render it when `!hasCompetitors && !density && !hasAdvisoryDetails`.
2. Add keyboard accessibility to `CompetitorRow`: `tabIndex={0}`, `role="button"`, `aria-expanded={expanded}`, `onKeyDown` handler for Enter/Space.
3. Replace the custom advisory details section (lines 309-342) with `<AdvisoryDataPanel data={ad} exclude={ADVISORY_EXCLUDE} />`.

---

### Stage 5: Profitability Forecasting -- Kill Gate (`Stage5ProfitabilityForecasting.tsx`, 436 LOC)
**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage5ProfitabilityForecasting.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 7/10 | Good normalization of reasons (lines 145-150) and assumptions (lines 140-142). Currency/percent/ROI formatters (lines 89-105) handle null gracefully. But `formatPercent` and `formatRoi` do not guard against `NaN`/`Infinity`. |
| Visual Hierarchy | 9/10 | Decision banner with ROI and break-even inline (lines 192-235), ROI scenarios card (lines 238-272), then 2-column P&L + context layout (lines 275-384). Professional financial dashboard feel. |
| Responsiveness | 7/10 | 2-column layout uses `lg:grid-cols-2` (line 275), collapsing to single column on smaller screens. P&L table has 4 columns which may be tight on mobile but is manageable given the short labels. |
| Gate Implementation | 4/10 | **Does not read `stageData.gateDecision` at all** (confirmed via grep). Gets decision solely from `advisory.decision` (line 116). If the chairman table has a different verdict, the UI will disagree with the system of record. This is the most serious defect in Group 1. |
| Accessibility | 6/10 | P&L table uses proper `Table`/`TableHeader`/`TableBody` (lines 285-307) which provides implicit table semantics. Collapsible sections use proper `Collapsible`/`CollapsibleTrigger`. Negative values marked in red (line 431) but no text indicator beyond color. |

**Top 3 Strengths**
1. **Professional financial layout** (lines 171-177, 285-307): The P&L table with Year 1/2/3 columns, separate Unit Economics panel, and ROI scenarios card create a cohesive financial dashboard.
2. **Remediation route messaging** (lines 229-233): When a venture fails or conditionally passes, the banner explicitly shows the remediation path with an arrow glyph. This is excellent UX for a gate stage.
3. **Advisory details use `JSON.stringify` for objects** (line 413): Unlike Stages 3 and 4, this stage's advisory detail section handles nested objects by calling `JSON.stringify(value)` rather than `String(value)`, preventing `[object Object]` degradation.

**Top 3 Concerns**
| Concern | Gap |
|---------|-----|
| Zero usage of `stageData.gateDecision`. The decision at line 116 reads only from `advisory.decision`. If the chairman overrides the AI recommendation, the UI displays the wrong verdict. This is the **highest-severity issue in Group 1**. | 5 |
| No loading or empty state. If `advisory` is null (backend hasn't processed yet), every conditional guard evaluates false and the user sees a blank page with only `space-y-3` vertical spacing. | 4 |
| `formatPercent` (line 97-100) and `formatRoi` (line 102-105) do not guard against `NaN` or `Infinity`. If the backend sends a division-by-zero result, the UI will display "NaN%" or "Infinity%". The shared `stage-primitives.ts` already has `ensureNumber()` which checks `!isNaN(value)`. | 3 |

**Top 3 Recommendations**
1. Add `stageData.gateDecision` integration: `const gateDecisionValue = stageData.gateDecision?.decision?.toLowerCase() as GateDecision | undefined; const decision = gateDecisionValue ?? (ad?.decision as string)?.toLowerCase() as GateDecision | undefined;`
2. Add empty state handling: `if (!hasDecision && !hasYearData && !hasUnitEcon && !hasRoiBands) return <StageEmptyState stageName="Profitability Forecasting" stageNumber={5} />;`
3. Guard formatters against `NaN`/`Infinity`: add `if (!isFinite(value)) return "---";` as the first line of `formatPercent` and `formatRoi`.

---

## Group-Level Synthesis

### Group-Level Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Logic & Flow | 8/10 | Strong funnel from raw idea to financial viability. Each stage builds on prior outputs. Kill gates at 3 and 5 provide appropriate checkpoints with REVISE/conditional_pass soft landings. |
| Functionality | 7/10 | Most renderers work correctly end-to-end. Deducted for: Stage 5 missing gateDecision integration (critical), Stages 4-5 missing empty states (functional gap). |
| UI/Visual Design | 8/10 | Professional appearance. Verdict-first banners, consistent color schemes with dark mode support (except Stage 2). MetricBars, SWOT quadrants, and P&L tables are well-designed. |
| UX/Workflow | 7/10 | Good pending states for Stages 1-3. Stages 4-5 can render blank. Stage 3 animation is long but functionally harmless (replaced on data arrival). |
| Architecture | 7/10 | Stages 1-2 use shared components well. Stage 3 partially shares via Collapsible. Stages 4-5 reimplement advisory details locally. Shared primitives (`stage-primitives.ts`) exist but are underutilized by this group. The `StageEmptyState` shared component exists but only Stage 1/2/3 provide their own loading states. |

**Overall Group Score: 7.4 / 10**

### Cross-Stage Analysis

**Progressive Complexity**
Excellent. Stage 1 is 124 LOC with simple text cards. Stage 2 adds a score + grid layout at 176 LOC. Stage 3 introduces metric bars, 3-column grid, and animation at 490 LOC. Stage 4 brings table + expandable rows at 346 LOC. Stage 5 peaks with financial tables and multi-card layout at 436 LOC. The visual density scales proportionally to data complexity.

**Pattern Consistency**
Mixed. Stages 1-2 share `AdvisoryDataPanel` + `ArtifactListPanel`. Stages 3-5 each reimplement a collapsible advisory details section locally. All three implementations use the same Collapsible/CollapsibleTrigger pattern with ChevronDown rotation, but Stage 3's Evidence Brief uses `String(value)`, Stage 4's uses `String(value)`, and Stage 5's uses `typeof value === "object" ? JSON.stringify(value) : String(value)`. This inconsistency means nested objects render differently across stages. The existing `AdvisoryDataPanel` handles all types via `FormatValue` -- it should be used universally.

**Transition Quality**
The prompt's concern about compact-to-full layout transition at Stage 4 is **moot** under current code. `BuildingMode.tsx` hardcodes all stages to the compact layout with header row (lines 55-56). The 5-tab layout (lines 264-310) is dead code. There is no transition to worry about, but the dead code should be cleaned up or the feature flag should be made dynamic.

**Information Flow**
Strong. The venture story progresses clearly:
- Stage 1: "Here is the raw idea"
- Stage 2: "Here is what AI thinks of it" (score + strengths/weaknesses)
- Stage 3: "Should this venture continue?" (7 metrics + kill decision)
- Stage 4: "What does the competitive landscape look like?" (competitor table + SWOT)
- Stage 5: "Can this venture make money?" (P&L + unit economics + kill decision)

**Gate Philosophy**
The two kill gates at Stages 3 and 5 are appropriately aggressive for a 25-stage pipeline. Stage 3's REVISE path (loop back to Stage 2) provides a soft landing that prevents premature kills. Stage 5's `conditional_pass` path with `remediationRoute` similarly softens the blow. The concern about "premature financial projections" raised by Gemini is a valid product debate but is mitigated by the gate's 3-way decision structure -- only `kill` terminates the venture, and that should be reserved for ventures with clearly unviable economics.

**Shared Component Utilization**
The `shared/` directory contains 7 files. Of these, only `AdvisoryDataPanel` and `ArtifactListPanel` are used by Group 1 stages (Stages 1-2 only). The remaining 5 files (`AssumptionsRealityPanel`, `GoldenNuggetsPanel`, `PhaseGatesSummary`, `StageEmptyState`, `stage-primitives.ts`) are available but unused by this group. Notable:
- `StageEmptyState` should be used by Stages 4 and 5 for their missing empty states.
- `stage-primitives.ts` exports `ensureString`, `ensureNumber`, `ensureArray`, `formatPercent`, `formatCurrency`, and color maps -- many of which are reimplemented locally in Stages 3-5.
- `THREAT_LEVEL_COLORS` in `stage-primitives.ts` (line 44-48) exactly matches Stage 4's local `THREAT_COLORS` (line 52-56). This is pure duplication.

---

## The 3 Most Impactful Changes

### 1. Fix gate decision authority in Stage 5 (and harden Stage 3)
**Files**: `Stage5ProfitabilityForecasting.tsx`, `Stage3ComprehensiveValidation.tsx`
**What**: Stage 5 must read `stageData.gateDecision.decision` as the primary source of truth, falling back to `advisory.decision` only when gateDecision is null. Stage 3 should reorder its priority chain similarly.
**Why**: This is a data integrity issue. The chairman's decision in `chairman_decisions` table is the authoritative verdict. The UI displaying a different verdict than the system of record breaks user trust and could lead to a venture proceeding (or being killed) when the chairman decided otherwise.
**Effort**: ~10 lines changed across 2 files.

### 2. Add empty/loading states to Stages 4 and 5
**Files**: `Stage4CompetitiveIntelligence.tsx`, `Stage5ProfitabilityForecasting.tsx`
**What**: Import and render `StageEmptyState` (from `shared/StageEmptyState.tsx`) when no displayable data is available. Both stages currently render blank content.
**Why**: Users navigating to these stages before backend processing completes see a blank page with no indication that work is in progress. This makes the application feel broken.
**Effort**: ~5 lines added to each file (import + conditional render).

### 3. Replace local advisory detail implementations with shared AdvisoryDataPanel
**Files**: `Stage3ComprehensiveValidation.tsx` (Evidence Brief), `Stage4CompetitiveIntelligence.tsx` (Full Advisory Details), `Stage5ProfitabilityForecasting.tsx` (Full Advisory Details)
**What**: Replace the 3 local collapsible key-value renderers with `<AdvisoryDataPanel data={ad} title="Evidence Brief" exclude={[...]} />`. The shared component already handles nested objects, arrays, booleans, and deep structures via its `FormatValue` subcomponent.
**Why**: Reduces duplication (~40 LOC per stage = ~120 LOC total), eliminates the inconsistent `String(value)` vs `JSON.stringify(value)` rendering, and ensures future improvements to advisory data rendering propagate automatically.
**Effort**: ~20 lines removed + 1-2 lines added per stage.

---

## Appendix: Per-Stage Score Summary

| Stage | Data Handling | Visual Hierarchy | Responsiveness | Gate Implementation | Accessibility |
|-------|-------------:|----------------:|--------------:|-------------------:|-------------:|
| 1 | 8 | 8 | 7 | N/A | 7 |
| 2 | 7 | 8 | 8 | N/A | 5 |
| 3 | 7 | 9 | 8 | 7 | 7 |
| 4 | 9 | 8 | 6 | N/A | 5 |
| 5 | 7 | 9 | 7 | 4 | 6 |
| **Avg** | **7.6** | **8.4** | **7.2** | **5.5** | **6.0** |
