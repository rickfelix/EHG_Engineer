# Ground-Truth Validation -- Group 1: THE_TRUTH (Stages 1-5)

> Resolved by Claude (Opus 4.6) with full codebase access. All verdicts cite specific file paths and line numbers from the EHG app repository.

---

## Dispute Resolution Table

| # | Claim | Claimant | Verdict | Evidence |
|---|-------|----------|---------|----------|
| 1 | Stage 3 "ignores" `stageData.gateDecision.decision` | OpenAI | **PARTIALLY CORRECT** | Stage 3 reads `stageData.gateDecision` at line 89 for `healthScore` (line 91), `rationale` (line 93), and `briefData` (line 94). But the decision derivation at lines 97-98 prefers `advisory.decision` over `gate.decision`. It does not "ignore" gateDecision -- it ignores the `.decision` field specifically. |
| 2 | Stage 5 "ignores" `stageData.gateDecision` entirely | OpenAI | **CORRECT** | `Stage5ProfitabilityForecasting.tsx` has zero references to `gateDecision`. Line 116 reads decision solely from `ad?.decision`. Confirmed via grep. |
| 3 | Stage 3 animation takes 36 seconds (9 steps x 4s) | Gemini | **INCORRECT** | `VALIDATION_STEPS` has 9 entries (lines 344-354), `STEP_DURATION_MS = 4000` (line 357). But line 379 caps the counter: `if (prev >= VALIDATION_STEPS.length - 1) return prev` -- the step counter stops at index 8 after 8 transitions. Max animation time = **32 seconds** (8 x 4s), not 36. Additionally, this view only renders when `!hasAnyContent && stageData.artifacts.length === 0` (line 133), so it is replaced by real data as soon as the backend responds. |
| 4 | Stage 5 kill gate is "fundamentally misplaced" (Gap 5 Critical) | Gemini | **INCORRECT (as a code defect)** | This is a product philosophy opinion, not a frontend code issue. The code implements `conditional_pass` (line 58, type definition) with explicit `remediationRoute` messaging (lines 229-233). The gate already functions as a soft checkpoint when the backend returns `conditional_pass`. Only a `kill` verdict terminates the venture. Rating this Gap 5 Critical for a frontend review is overstated -- the code correctly implements the designed behavior. Gap 2 for product-level debate is more appropriate. |
| 5 | Stage 4 has "abrupt layout transition to 5-tab layout" (Gap 4) | Gemini | **INCORRECT** | `BuildingMode.tsx` line 55: `const isDesignStandardsStage = true` and line 56: `const isEarlyStage = true`. Both hardcoded to `true`, so ALL stages (1-25) use the compact header layout. The 5-tab layout (lines 264-310) is dead code. There is no layout transition at Stage 4 or anywhere else. |
| 6 | Stage 2 dark mode issue is Gap 4 (Significant) | Gemini | **PARTIALLY CORRECT** | The colors `text-yellow-500` (line 61), `text-green-500` (lines 132, 140), `text-red-500` (lines 153, 161) in `Stage2AIReview.tsx` genuinely lack `dark:` variants. However, Tailwind's default `-500` hues are midtone and remain legible on most dark backgrounds. The issue is real but is **Gap 3 (Moderate)**, not Gap 4. Compare with Stage 4 which has full `dark:` variants at lines 52-56, 64-68, and 178-183 -- Stage 2 is inconsistent but not severely broken. |
| 7 | OpenAI scored UI/Visual Design very low (some scores based on backend assumptions) | OpenAI | **PARTIALLY CORRECT (self-inflicted)** | OpenAI gave Stage 1 UI 7/10 and Stage 2 UI 7/10 partly due to "visually plain" and "hardcoded colors" concerns. These are valid observations, but the scores underweight the actual TSX rendering quality. Stage 1's layout is intentionally minimal (124 LOC) with appropriate information hierarchy. Stage 2's grid layout at line 127 (`grid-cols-1 sm:grid-cols-2`) is a strong responsive pattern. A fairer UI score for Stage 1 is 8/10 and Stage 2 is 7/10 (the dark mode issue is real). |
| 8 | Stages 4 and 5 have no loading/empty state | All three | **CORRECT** | `Stage4CompetitiveIntelligence.tsx`: If `competitors` is empty and `density` is null, the banner guard at line 233 (`hasBanner`) is false and the component renders only the advisory details (if any). If advisory is also empty, the user sees a blank `div` with `space-y-3`. Same for `Stage5ProfitabilityForecasting.tsx`: all `has*` guards at lines 165-168 evaluate false when `ad` is null, rendering an empty `div`. Meanwhile, `shared/StageEmptyState.tsx` exists and is unused by either stage. |
| 9 | Stages 3-5 reimplement advisory details locally instead of using shared AdvisoryDataPanel | All three | **CORRECT** | Stage 3 Evidence Brief (lines 302-337) uses `String(value ?? "---")`. Stage 4 Full Advisory Details (lines 308-342) uses `String(value ?? "---")`. Stage 5 Full Advisory Details (lines 387-422) uses `typeof value === "object" ? JSON.stringify(value) : String(value ?? "---")`. Three different rendering approaches for the same pattern. `AdvisoryDataPanel` (used by Stages 1-2) already handles all types via its `FormatValue` subcomponent. |
| 10 | Stage 4 `THREAT_COLORS` duplicates `stage-primitives.ts` | Claude | **CORRECT** | Stage 4 lines 52-56 define `THREAT_COLORS` with identical keys and color patterns. Claude's opinion notes `stage-primitives.ts` exports `THREAT_LEVEL_COLORS` at lines 44-48. Pure duplication. |

---

## Score Adjustment Summary

Based on the ground-truth resolutions above, the following adjustments should be applied when calculating consensus scores:

### Gemini Score Adjustments

| Stage | Dimension | Gemini Original | Adjusted | Reason |
|-------|-----------|----------------|----------|--------|
| 2 | UI/Visual Design | 6/10 | **7/10** | Dark mode gap is real but Gap 3 not Gap 4. Tailwind `-500` hues remain legible. |
| 3 | UX/Workflow | 5/10 | **6/10** | Animation is 32s not 36s, and only displays before any data arrives. Backend response replaces it. Still too long, but "severely degraded" is overstated. |
| 4 | UX/Workflow | 6/10 | **7/10** | The "abrupt layout transition" does not exist. `BuildingMode.tsx` hardcodes compact layout for all stages. |
| 5 | Logic & Flow | 5/10 | **7/10** | "Fundamentally misplaced" is a product opinion, not a code logic defect. The 3-way decision with `conditional_pass` + `remediationRoute` works correctly as designed. |

### OpenAI Score Adjustments

| Stage | Dimension | OpenAI Original | Adjusted | Reason |
|-------|-----------|----------------|----------|--------|
| 3 | Functionality | 6/10 | **7/10** | Stage 3 does not fully "ignore" gateDecision -- it reads healthScore, rationale, and briefData from it. Only the `.decision` field priority is wrong. |
| 3 | Architecture | 6/10 | **6/10** | No change -- the advisory reimplementation concern is valid. |

### Claude Score Adjustments

No adjustments needed. All Claude claims verified against source code.

---

## Detailed Evidence for Key Disputes

### Dispute #1: Stage 3 gateDecision Usage (OpenAI vs Claude)

**OpenAI Claim**: "The displayed decision ignores `stageData.gateDecision.decision`; it derives from advisory data or score instead."

**Evidence from `Stage3ComprehensiveValidation.tsx`**:
- Line 89: `const gate = stageData.gateDecision;` -- gateDecision IS read
- Line 91: `const healthScore = gate?.healthScore ?? (advisory?.overallScore as number | null) ?? null;` -- gate.healthScore is PREFERRED
- Line 93: `const rationale = gate?.rationale ?? (advisory?.rationale as string | null) ?? null;` -- gate.rationale is PREFERRED
- Line 94: `const briefData = gate?.briefData;` -- gate.briefData is the ONLY source
- Lines 97-98: `const advisoryDecision = (advisory?.decision as string)?.toUpperCase(); const decision3Way = advisoryDecision ?? deriveDecision(healthScore);` -- advisory.decision is PREFERRED over deriving from gate's own decision field

**Verdict**: Stage 3 uses gateDecision extensively for supplementary data but gets the verdict wrong by preferring `advisory.decision`. The fix is a one-line change to line 98: `const decision3Way = (gate?.decision?.toUpperCase() as GateDecision3Way) ?? advisoryDecision ?? deriveDecision(healthScore);`

### Dispute #3: Stage 3 Animation Duration (Gemini vs Claude)

**Gemini Claim**: "9-step animated progress view with 4-second intervals takes 36 seconds."

**Evidence from `Stage3ComprehensiveValidation.tsx`**:
- Lines 344-354: `VALIDATION_STEPS` array has 9 entries (indices 0-8)
- Line 357: `const STEP_DURATION_MS = 4000;`
- Line 376-381: The `setInterval` callback:
  ```
  setActiveStep((prev) => {
    if (prev >= VALIDATION_STEPS.length - 1) return prev;
    return prev + 1;
  });
  ```
- Starting at index 0, the counter increments to index 8 (the last entry) in 8 steps
- 8 transitions x 4000ms = 32,000ms = **32 seconds**
- Gemini's math: 9 steps x 4s = 36s is wrong because there are 9 steps but only 8 transitions (the first step is shown immediately at t=0)

### Dispute #5: Stage 4 Layout Transition (Gemini vs Code)

**Gemini Claim**: "Moving from a compact header in Stages 1-3 directly to a full 5-tab layout in Stage 4 without onboarding or preamble is disorienting."

**Evidence from `BuildingMode.tsx`**:
- Line 55: `const isDesignStandardsStage = true;` -- hardcoded, not computed
- Line 56: `const isEarlyStage = true;` -- hardcoded, not computed
- Line 222: `{isDesignStandardsStage ? (` -- always true, so the compact layout branch always executes
- Lines 256-311: The `else` branch containing `JourneyBadge + BuildingHero + Tabs` is **dead code** -- never reached

**Conclusion**: The transition Gemini describes does not exist in the current codebase. This was likely true at an earlier point in development but has been superseded by the hardcoded flags. The dead code should be cleaned up.
