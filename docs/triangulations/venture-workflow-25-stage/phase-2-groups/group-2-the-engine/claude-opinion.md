# Claude Phase 2 Opinion — Group 2: THE_ENGINE (Stages 6-9)

**Model**: Claude Opus 4.6
**Date**: 2026-03-10
**Source files examined**: 4 stage renderers (1,445 LOC total), venture-workflow.ts config, stage-primitives.ts shared utilities

## Methodology

This analysis is grounded in direct source code examination of the four renderer components in the EHG frontend repo (`C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\`), the workflow configuration (`src/config/venture-workflow.ts`), and the shared primitives library (`src/components/stages/shared/stage-primitives.ts`). Every finding references specific files and line numbers. Where this opinion differs from OpenAI or Gemini, the dispute is flagged explicitly.

---

## Per-Stage Analysis

### Stage 6: Risk Evaluation

**File**: `Stage6RiskEvaluation.tsx` (410 LOC)
**Source**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage6RiskEvaluation.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 9 | `normalizeRisk` (lines 83-100) is the strongest normalizer in Group 2. Handles string fallback, type-checks every numeric field individually, defaults `status` to `"open"`. The `ADVISORY_EXCLUDE` filter (lines 206-210) prevents double-rendering of already-visualized keys. |
| Visual Hierarchy | 9 | Summary banner (lines 221-265) puts the verdict first (risk level badge + counts). Metric cards follow. Risk table sorted worst-first (line 189). Category breakdown last. Textbook progressive disclosure. |
| Responsiveness | 7 | Metric cards use `grid-cols-2 md:grid-cols-4` (line 268). Risk table has a 7-column layout with `max-w-[250px]` on description (line 113) — but the 7-column table will overflow on mobile viewports. No horizontal scroll wrapper. |
| Gate Implementation | N/A | No gate (correct per `venture-workflow.ts` line 109). No phantom gate rendered. |
| Accessibility | 3 | Zero `aria-*` attributes, zero `role` attributes, zero `tabIndex` assignments, zero `onKeyDown` handlers across the entire 410-line file. Risk rows are `onClick`-only (line 179) with no keyboard alternative. The chevron expand/collapse on table rows is mouse-only. Screen readers get no indication that rows are expandable. |

**Top 3 Strengths:**
1. **Exemplary normalization pattern**: `normalizeRisk` (line 83) handles every edge case — string-only input, missing fields, wrong types. This is the gold standard that other stages should follow.
2. **Dual-scale color coding**: Banner uses `SCORE_BANNER` mapped to normalized 1-10 scale via `getRiskLevel` (line 68), while individual row badges use `getScoreBadgeColor` on the raw 0-125 composite score (line 76). Both scales are correct for their context.
3. **Category breakdown visualization**: The horizontal bar chart (lines 346-361) uses percentage-width fills relative to `totalRisks`, giving an instant distribution view. Sorted by count descending.

**Top 3 Concerns:**
1. **Risk table overflows on mobile (Gap Importance: 3)**: The 7-column table (Description, Category, Score, Sev, Prob, Impact, Status) has no responsive fallback. At `< 768px`, columns will compress to illegibility or overflow the container. Unlike Stage 8's explicit `hidden lg:grid` / `lg:hidden` pattern, Stage 6 renders the same table at all breakpoints.
2. **Expandable rows are mouse-only (Gap Importance: 3)**: `RiskRow` uses `onClick` (line 179) but provides no `onKeyDown`, `tabIndex`, or `aria-expanded` attributes. Keyboard users cannot expand mitigations. This is a WCAG 2.1 failure (2.1.1 Keyboard).
3. **Color maps are entirely local (Gap Importance: 2)**: `SCORE_BANNER` (lines 47-52), `SCORE_BADGE` (lines 54-59), and `STATUS_COLORS` (lines 61-66) are identical to `SEVERITY_BANNER_COLORS`, `SEVERITY_BADGE_COLORS`, and near-identical to `STATUS_COLORS` in `stage-primitives.ts` — but Stage 6 does not import from the shared file.

**Top 3 Recommendations:**
1. Wrap the risk table in an `overflow-x-auto` container, or implement a responsive card-based layout for mobile (similar to Stage 8's `lg:hidden` fallback).
2. Add `tabIndex={0}`, `role="button"`, `aria-expanded={expanded}`, and `onKeyDown` (Enter/Space) to expandable risk rows.
3. Import `SEVERITY_BANNER_COLORS` and `SEVERITY_BADGE_COLORS` from `stage-primitives.ts` instead of redefining as `SCORE_BANNER` and `SCORE_BADGE`.

---

### Stage 7: Revenue Architecture

**File**: `Stage7RevenueArchitecture.tsx` (358 LOC)
**Source**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage7RevenueArchitecture.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 8 | Derived metrics (LTV, LTV:CAC, ARR) are safely computed with zero-division guards (lines 100-105). `normalizeTier` handles string fallback (line 68). However, derived fields are computed in the renderer rather than being persisted, creating a contract gap with Stage 9. |
| Visual Hierarchy | 8 | Positioning banner (lines 132-170) establishes context immediately. Metric cards, tier cards, unit economics table, rationale — logical top-to-bottom flow. |
| Responsiveness | 8 | Metric cards: `grid-cols-2 md:grid-cols-4`. Tier cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (line 221). Good breakpoint cascade. |
| Gate Implementation | N/A | No gate (correct per `venture-workflow.ts` line 118). |
| Accessibility | 3 | Zero accessibility attributes across the entire file. No `aria-label` on metric cards, no `aria-labelledby` on the unit economics table. |

**Top 3 Strengths:**
1. **In-component derived economics**: Lines 100-105 safely compute LTV, LTV:CAC ratio, and projected ARR with explicit null/zero guards. The LTV formula `(arpa * (grossMarginPct / 100)) / (churnRateMonthly / 100)` is financially correct.
2. **Conditional health warnings**: LTV:CAC ratio turns amber when `< 3:1` (line 197, 284). Monthly churn turns red when `> 5%` (line 298). These thresholds surface actionable warnings without overwhelming the user.
3. **Comprehensive tier card design**: Each tier card (lines 222-249) renders name, price with billing period, target segment, and included units in a clean layout with sensible responsive breakpoints.

**Top 3 Concerns:**
1. **`formatCurrency` duplication with behavioral divergence (Gap Importance: 4)**: Stage 7's `formatCurrency` (lines 59-65) handles negative numbers with explicit sign prefixing (`${value < 0 ? "-" : ""}$...`), but Stage 9's copy (lines 74-80) does NOT handle negative numbers — it uses `abs` for the threshold check but renders `$${(abs / 1_000_000).toFixed(1)}M` without the negative sign. This means a negative valuation estimate in Stage 9 would display as a positive number. The shared `stage-primitives.ts` version (line 139) has yet another signature (`value: unknown` instead of `value: number | null | undefined`) and does not handle negatives either. **Three implementations, three different behaviors.**
2. **Renderer-only derivations create a Stage 7 to Stage 9 contract gap (Gap Importance: 4)**: Stage 7 computes `ltv`, `ltvCacRatio`, and `projectedArr` entirely in the React component (lines 100-105). These values are never persisted back to `advisory_data`. OpenAI's opinion correctly identifies that Stage 9's backend `evaluateRealityGate()` expects `stage07?.ltv` — but Stage 7 only stores the raw inputs (`arpa`, `gross_margin_pct`, `churn_rate_monthly`), not the derived LTV. The frontend re-derives them for display; the backend gate checks fail because the persisted data does not contain them.
3. **Hardcoded business thresholds (Gap Importance: 2)**: The `3:1` LTV:CAC warning (line 197) and `5%` monthly churn alarm (line 298) are buried in JSX. These are domain-significant thresholds that should be configurable constants.

**Top 3 Recommendations:**
1. Extract `formatCurrency` to use the shared `stage-primitives.ts` version, and fix the shared version to handle negative numbers and accept `number | null | undefined` (not just `unknown`).
2. Ensure Stage 7's backend (`stage-07-pricing-strategy.js`) persists derived metrics (`ltv`, `ltv_cac_ratio`, `projected_arr`) in `advisory_data` so that Stage 9's reality gate can reliably read them.
3. Move financial health thresholds to a shared constants file (e.g., `HEALTHY_LTV_CAC_RATIO = 3`, `MAX_ACCEPTABLE_MONTHLY_CHURN = 5`).

---

### Stage 8: Business Model Canvas

**File**: `Stage8BusinessModelCanvas.tsx` (276 LOC)
**Source**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage8BusinessModelCanvas.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 8 | `normalizeBlock` (lines 74-89) handles null/non-object input, string-only items, and missing priorities with sensible defaults. `BMC_BLOCKS` config (lines 46-60) cleanly maps keys to labels and grid areas. |
| Visual Hierarchy | 9 | The summary banner (lines 177-199) gives an immediate completeness picture (X/9 blocks, Y items, Z critical). The CSS Grid canvas (lines 203-223) faithfully reproduces the Osterwalder layout with color-coded regions. |
| Responsiveness | 9 | Dual-layout strategy is excellent. Desktop gets the full 5-column CSS Grid with named areas (lines 203-223, `hidden lg:grid`). Mobile/tablet gets a stacked layout (lines 226-236, `lg:hidden`) with Value Propositions spanning full width and blocks paired logically (Partners/Segments, Activities/Relationships). This is the best responsive implementation in Group 2. |
| Gate Implementation | N/A | No gate (correct per `venture-workflow.ts` line 128). |
| Accessibility | 4 | No `aria-*` attributes, but the BMC grid does use semantic HTML structure. The `BMCCell` component renders `<ul>` for items (line 108), which is proper list semantics. However, no `aria-label` on the grid regions, and the desktop CSS Grid `gridTemplateAreas` visual order may not match DOM reading order for screen readers. |

**Top 3 Strengths:**
1. **CSS Grid with named areas**: Lines 206-213 use `gridTemplateAreas` to reproduce the exact Osterwalder BMC layout. The three-row structure (Key Partners/Activities/Value/Relations/Segments, Partners/Resources/Value/Channels/Segments, Costs/Revenue) is spatially correct. Color coding groups Infrastructure (blue), Value (purple), and Customer-facing (emerald) blocks visually.
2. **Intelligent mobile fallback**: Lines 226-236 don't just stack blocks vertically. Value Propositions spans full width (`md:col-span-2`), and blocks are paired by their logical relationships (Partners-Segments, Activities-Relationships, Resources-Channels), preserving the canvas's conceptual structure even on small screens.
3. **Evidence filtering**: Line 120 filters out placeholder evidence strings (`item.evidence.startsWith("No evidence")`), preventing auto-generated filler from cluttering the display. This directly addresses OpenAI's concern about placeholder quality.

**Top 3 Concerns:**
1. **Grid area DOM order vs. visual order (Gap Importance: 2)**: The CSS Grid renders blocks in DOM order (Partners, Activities, Value, Relations, Segments, Resources, Channels, Costs, Revenue) but the grid places them visually in the Osterwalder layout. Screen readers will read them in DOM order, which differs from the visual top-left-to-bottom-right flow. The `PRIORITY_LABELS` constant (lines 68-72) helps somewhat, but `aria-label` on grid regions would clarify.
2. **No item count limits or overflow protection (Gap Importance: 2)**: If the LLM generates 20+ items for a single block, the grid cell will stretch vertically, distorting the canvas proportions. No `max-height` or `overflow-y-auto` is applied to `BMCCell`.
3. **Priority color map is numeric-keyed (Gap Importance: 1)**: `PRIORITY_COLORS` (lines 62-66) uses `Record<number, string>` with keys `1, 2, 3`, while the shared `stage-primitives.ts` `PRIORITY_COLORS` uses `Record<string, string>` with keys `"critical", "high", "medium", "low"`. These are semantically the same concept but incompatible in structure.

**Top 3 Recommendations:**
1. Add `aria-label` attributes to each `BMCCell` div (e.g., `aria-label="Key Partners - Business Model Canvas"`) and consider adding `role="region"` to the grid container.
2. Add `max-h-[300px] overflow-y-auto` to `BMCCell` containers to maintain canvas proportions when blocks have many items.
3. Align `PRIORITY_COLORS` with the shared primitives by mapping numeric priorities to string keys, or extend `stage-primitives.ts` to support both keying strategies.

---

### Stage 9: Exit Strategy

**File**: `Stage9ExitStrategy.tsx` (401 LOC)
**Source**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage9ExitStrategy.tsx`

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 7 | `normalizeExitPath` and `normalizeAcquirer` (lines 82-100) are solid with string fallbacks. Sorting by probability/fit_score descending is correct. However, milestones (line 122) are passed through without normalization — `Array.isArray(rawMilestones) ? rawMilestones : []` with no per-element type checking, unlike every other entity in Group 2. |
| Visual Hierarchy | 8 | Reality gate verdict appears first (lines 149-175), which is the right call — blockers must be front-and-center. Summary banner follows with exit thesis. Valuation cards, exit paths with probability bars, acquirers with fit score dots, milestones. Good layering. |
| Responsiveness | 7 | Valuation cards use `grid-cols-2 md:grid-cols-4` (line 211). Exit paths and acquirers are single-column lists that work fine at any width. However, the milestone timeline (lines 339-361) is a flat list with no visual timeline indicator (connecting line/dots) — functional but visually flat on all viewports. |
| Gate Implementation | 5 | **The phantom gate.** Lines 149-175 render a full "Phase 2->3 Reality Gate" banner with PASS/BLOCKED badge, rationale, and blockers list. But `venture-workflow.ts` line 136 sets `gateType: 'none'`. The stage-advance-worker will not enforce this gate. A user seeing "BLOCKED" will believe they cannot proceed, but nothing actually prevents advancement. A user seeing "PASS" will believe they passed a system-enforced check, but it is purely decorative. |
| Accessibility | 3 | Zero `aria-*`, zero `role`, zero `tabIndex`, zero `onKeyDown`. The fit score dot matrix (lines 316-325) communicates score purely through color — no text alternative for the numeric score value, no `aria-label` on the dot container. |

**Top 3 Strengths:**
1. **Fit score dot matrix visualization**: Lines 316-325 render a 5-dot visual using `FIT_SCORE_COLORS` (lines 66-72) where filled dots use the score-appropriate color (emerald for 5, red for 1) and unfilled dots are `bg-muted`. Sorted by fit score descending. This is highly scannable.
2. **Probability bar sorting**: Exit paths are sorted by `probability_pct` descending (line 114) and rendered with proportional purple bars (lines 284-289, capped at 100% via `Math.min`). This gives an instant visual ranking of exit likelihood.
3. **Reality gate data richness**: The `RealityGate` interface (lines 52-57) includes `pass`, `rationale`, `blockers[]`, and `required_next_actions[]`. When the backend populates this well, the gate banner provides genuinely useful decision context.

**Top 3 Concerns:**
1. **Phantom gate creates false trust (Gap Importance: 5)**: This is the most serious issue in Group 2. Lines 149-175 render a gate banner that says "Phase 2->3 Reality Gate" with a PASS/BLOCKED badge. The config says `gateType: 'none'` (venture-workflow.ts line 136). This disconnect will cause one of two failures: (a) users trust a BLOCKED verdict and stop working when they could proceed, losing velocity; or (b) users learn the gate is not enforced, reducing trust in all gates across the entire 25-stage workflow. **Both OpenAI and Gemini identify this issue. I agree it is the #1 problem in Group 2, and I rate it higher (5) than Gemini (4) because trust erosion in the gate system affects all 25 stages, not just Stage 9.**
2. **`formatCurrency` is subtly broken for negatives (Gap Importance: 4)**: Stage 9's version (lines 74-80) strips negative signs. Compare line 62 in Stage 7: `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M` vs. line 77 in Stage 9: `$${(abs / 1_000_000).toFixed(1)}M`. If a valuation estimate or revenue base is negative (possible for net-loss scenarios), Stage 9 will display it as positive. **Neither OpenAI nor Gemini caught this specific behavioral divergence between the two copies.**
3. **Milestones lack normalization (Gap Importance: 3)**: Line 122 passes milestones through without per-element normalization: `Array.isArray(rawMilestones) ? rawMilestones : []`. If the LLM returns a milestone as a string instead of an object with `{date, success_criteria}`, the renderer will silently produce empty badges and blank criteria text. Every other entity in Group 2 (risks, tiers, exit paths, acquirers, BMC items) has a `normalize*` function.

**Top 3 Recommendations:**
1. **Resolve the phantom gate immediately.** Two options: (a) Change `venture-workflow.ts` line 136 to `gateType: 'reality'` and implement enforcement in the stage-advance-worker; or (b) Rename the UI from "Phase 2->3 Reality Gate" to "Viability Assessment" and change the badge from "PASS/BLOCKED" to "Favorable/Concerns Identified", making it clear this is advisory, not enforced.
2. Delete the local `formatCurrency` and import from `stage-primitives.ts`, after fixing the shared version to handle negatives.
3. Add a `normalizeMilestone` function that handles string input, missing `date`, and missing `success_criteria` with sensible defaults.

---

## Cross-Stage Analysis

### formatCurrency Duplication: Worse Than Previously Reported

The duplication is not just a DRY issue — there are **three distinct implementations with different behaviors** across the codebase:

| Location | Signature | Handles null? | Handles negatives? | Small values |
|----------|-----------|:---:|:---:|---|
| Stage 5, line 89 | `(value: number \| null \| undefined): string` | Yes, returns "—" | Yes (sign prefix) | `$${value.toLocaleString()}` |
| Stage 7, line 59 | `(value: number \| null \| undefined): string` | Yes, returns "—" | Yes (sign prefix) | `$${value.toLocaleString()}` |
| Stage 9, line 74 | `(value: number \| null \| undefined): string` | Yes, returns "—" | **NO** (drops sign) | `$${value.toLocaleString()}` |
| stage-primitives.ts, line 139 | `(value: unknown): string` | No (treats null as 0) | **NO** (no negatives) | `$${num.toFixed(0)}` (no locale) |
| Stage 12, line 87 | `(value: number \| null \| undefined): string` | Yes | Yes | Same as Stage 5 |
| Stage 16, line 58 | `(val: number \| undefined): string` | Partial (no null) | No | `$${val.toFixed(0)}` |

**Six different implementations.** The shared utility exists but has the weakest behavior of all (no null handling, no negatives, no locale formatting). This means that even if stages migrated to the shared version today, they would regress. The shared version must be fixed first.

### Stage 7 to Stage 9 Runtime Contract

OpenAI correctly identifies that Stage 7's backend does not emit derived metrics that Stage 9's backend reality gate expects. From the frontend perspective, I can confirm:

- **Stage 7 renderer** computes `ltv`, `ltvCacRatio`, `projectedArr` at lines 100-105 from raw inputs `arpa`, `gross_margin_pct`, `churn_rate_monthly`, `cac`.
- These derived values exist only in React component state — they are never written back to `advisory_data`.
- **Stage 9 renderer** reads `reality_gate` from `advisory_data` (line 123), which is populated by the backend.
- The backend reality gate evaluator checks `stage07?.ltv`, `stage07?.payback_months` etc. — fields that Stage 7's backend never persists.

**Result**: The reality gate will likely always report blockers related to missing Stage 7 data, making the phantom gate even more misleading — it will almost always show "BLOCKED" regardless of actual business viability.

### No-Gate Philosophy: Agreement With Nuance

I agree with Phase 1 consensus and both other opinions that Stages 6-8 correctly have no gates. Business modeling is iterative — forcing a pass/fail checkpoint on risk evaluation or BMC completion would add friction without value.

However, the Stage 9 situation is not "no gate" — it is "fake gate." The no-gate philosophy should mean "we deliberately chose not to gate here." The current implementation says "we render a gate but don't enforce it," which is a different and worse thing. The backend appears to intend a real gate (it has `evaluateRealityGate()`), but the config and stage-advance-worker do not enforce it.

### Pattern Consistency

**Consistent:**
- All 4 stages use the identical "Full Advisory Details" collapsible pattern with the same CSS classes, chevron animation, and key/value rendering.
- All 4 stages use the same metric card pattern: `text-[10px]` uppercase label + `text-2xl` bold value.
- All 4 stages use `const ad = stageData.advisoryData` as the first data access.
- All 4 stages use the `ADVISORY_EXCLUDE` pattern to prevent double-rendering.

**Inconsistent:**
- Stage 6 imports `Table` components (from `@/components/ui/table`) and `ChevronRight`; no other Group 2 stage does.
- Stage 8 is the only stage with a dual-layout responsive strategy (`hidden lg:grid` + `lg:hidden`). Stages 6, 7, 9 all render a single layout.
- Color map naming varies: `SCORE_BANNER` (Stage 6) vs `POSITIONING_BANNER` (Stage 7) vs hardcoded class (Stage 8) vs inline ternary (Stage 9).

### Collapsible Advisory Details: 22+ Copies

The "Full Advisory Details" Collapsible section is copy-pasted across at least 22 stage files (from the grep results above). It consists of roughly 20 lines of identical JSX each time. This is approximately 440 lines of pure duplication across the codebase. A single `<AdvisoryDetailsCollapsible entries={advisoryEntries} />` shared component would eliminate all of it.

---

## Group-Level Synthesis Scores

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| **Logic & Flow** | **8.5** | Risk -> Revenue -> BMC -> Exit is the right sequence. Each stage builds conceptually on the previous: risks inform revenue modeling, revenue informs the broader BMC, and BMC informs exit viability. No stages feel misplaced or redundant. |
| **Functionality** | **7.5** | All 4 stages render correctly when data is well-formed. Defensive normalization prevents crashes from malformed LLM output. Deducted for: the phantom gate causing functional ambiguity, the formatCurrency behavioral divergence that silently drops negative signs, and the unnormalized milestones in Stage 9. |
| **UI/Visual Design** | **8.5** | Stage 8's BMC canvas is the design highlight of the entire 25-stage workflow. Stage 6's risk table with expandable mitigations, Stage 7's positioning banner system, and Stage 9's probability bars and fit-score dot matrices are all domain-appropriate visualizations. Professional color coding with dark mode support throughout. |
| **UX/Workflow** | **7.0** | Verdict-first banner pattern across all 4 stages gives users instant orientation. Progressive disclosure (collapsed advisory details) is well-applied. Deducted for: the phantom gate's trust damage (the single biggest UX problem), and the risk table's mobile overflow. |
| **Architecture** | **5.5** | This is where Group 2 falls short. A shared utilities file (`stage-primitives.ts`) exists with the exact functions these stages need, but none of the 4 stages import from it. Six different `formatCurrency` implementations exist across the codebase with behavioral differences. The "Full Advisory Details" section is duplicated 22+ times. Color maps are redefined per-stage with different variable names for identical values. The code works but is actively hostile to maintenance. |

---

## Disputes With Other Opinions

### Dispute with OpenAI

1. **OpenAI rates Stage 6 UI/Visual Design at 4/10.** I rate it 9/10 for visual hierarchy. OpenAI's analysis was conducted against backend template files (`lib/eva/stage-templates/`), not the actual TSX renderers. OpenAI explicitly acknowledges: "The prompt's table/row-expansion/mobile claims cannot be validated because the Stage 6 TSX renderer is missing." The TSX file does exist at `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage6RiskEvaluation.tsx` (410 LOC). OpenAI's low scores across all stages for UI/Visual Design (4, 4, 5, 4) reflect that it was scoring backend code, not frontend renderers. **This is a significant methodological difference.**

2. **OpenAI rates Stage 7 Functionality at 3/10.** While the backend contract drift is real, the frontend renderer functions correctly — it safely computes all derived metrics from raw inputs and renders them accurately. The "functionality" score should separate frontend rendering correctness (high) from backend contract adherence (low).

3. **OpenAI's "21 failures out of 84 assertions" claim** cannot be verified from frontend source code alone. These appear to be test failures against the backend, not the UI renderers being evaluated in this prompt.

### Dispute with Gemini

1. **Gemini rates the phantom gate concern at Significance 4.** I rate it 5 (Critical). A phantom gate does not just affect Stage 9 — it erodes trust in the entire gate system. If users discover that one "gate" is fake, they will question whether the kill gates at Stages 3 and 5 are also fake. Gate credibility is system-wide, not per-stage.

2. **Gemini rates Architecture at 6.5/10 for the group.** I rate it 5.5/10. Gemini acknowledges duplication but does not account for the specific fact that `stage-primitives.ts` already exists with the shared utilities and no stage imports from it. This is not "should extract utilities" — the utilities are already extracted and being ignored. This is worse than pre-extraction duplication because it means the extraction work was done and then not adopted.

3. **Gemini rates Stage 7 Architecture at 6/10 primarily for `formatCurrency` duplication.** The deeper architecture issue is that Stage 7's derived metrics (LTV, ARR) are renderer-only computations that are never persisted, creating an invisible contract violation with Stage 9's backend. This is more architecturally significant than simple code duplication.

### Agreement with Both

All three opinions agree that:
- The business modeling sequence (Risk -> Revenue -> BMC -> Exit) is correct and coherent.
- The phantom gate is a significant issue requiring resolution.
- `formatCurrency` duplication needs consolidation.
- Stage 8's CSS Grid BMC canvas is the design highlight.
- Stages 6-8 correctly have no enforced gates.

---

## The 3 Most Impactful Changes for Group 2

### 1. Resolve the Phantom Gate (Impact: Critical)

**What**: Stage 9 renders a "Phase 2->3 Reality Gate" PASS/BLOCKED banner but `gateType: 'none'` in the config means it is not enforced.

**Why it matters**: This is the highest-severity issue across both the frontend and backend. A gate that looks real but is not enforced damages user trust across the entire 25-stage workflow. Combined with the broken Stage 7->9 data contract (which will cause the gate to show BLOCKED even when the venture is viable), this creates a compounding trust failure.

**Action**: Pick one:
- **(A) Enforce it**: Set `gateType: 'reality'` in `venture-workflow.ts`. Fix the Stage 7->9 data contract so the gate evaluates against real data. Wire the stage-advance-worker to check it.
- **(B) De-gate it**: Rename the UI to "Viability Assessment" with "Favorable" / "Concerns Identified" badges. Remove the word "Gate." Make the visual treatment clearly advisory (use blue/info styling instead of red/green pass/fail).

### 2. Consolidate formatCurrency and Adopt Shared Primitives (Impact: High)

**What**: Six separate `formatCurrency` implementations exist, with the Stage 9 version silently dropping negative signs. A shared `stage-primitives.ts` file already exists but is not imported by any Group 2 stage.

**Why it matters**: The behavioral divergence (Stage 9 dropping negative signs) is a real bug that will manifest when valuation data includes negative values. Beyond the bug, 4 stages each define their own color maps, normalizer patterns, and the advisory details section when shared versions already exist.

**Action**:
1. Fix `stage-primitives.ts` `formatCurrency` to: accept `number | null | undefined`, return "—" for null, handle negatives with sign prefix, use `toLocaleString()` for small values.
2. Delete all 5 local `formatCurrency` definitions and import the shared one.
3. Import `SEVERITY_BANNER_COLORS` and `SEVERITY_BADGE_COLORS` in Stage 6 instead of redefining them.
4. Extract the ~20-line "Full Advisory Details" Collapsible section into a shared component, eliminating 22+ copies.

### 3. Fix the Stage 7 to Stage 9 Data Contract (Impact: High)

**What**: Stage 7's renderer computes LTV, LTV:CAC ratio, and projected ARR in React state (never persisted). Stage 9's backend reality gate expects these as persisted fields in Stage 7's `advisory_data`.

**Why it matters**: This causes the reality gate to always report missing data blockers, making the phantom gate problem even worse — it shows BLOCKED not because the venture fails viability checks, but because the upstream data contract is broken. Fixing this is a prerequisite for making the phantom gate meaningful (if option A is chosen above).

**Action**: Ensure Stage 7's backend (`stage-07-pricing-strategy.js`) computes and persists `ltv`, `ltv_cac_ratio`, `projected_arr`, and `payback_months` in `advisory_data` alongside the raw inputs. The frontend renderer can then read these directly instead of recomputing them.
