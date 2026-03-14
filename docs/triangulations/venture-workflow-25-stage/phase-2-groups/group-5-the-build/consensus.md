# Phase 2 Consensus — Group 5: THE_BUILD (Stages 17-22)

> Synthesized from OpenAI, Gemini, and Claude opinions, adjusted by ground-truth validation. This is the authoritative assessment for Group 5.

---

## Consensus Scores

### Group-Level

| Dimension | Score | Confidence | Key Finding |
|-----------|:-----:|:----------:|-------------|
| Logic & Flow | **8/10** | High | The strongest sequential narrative in the 25-stage workflow. A textbook SDLC: Readiness -> Plan -> Execute -> Test -> Review -> Release. No redundant or missing stages. |
| Functionality | **7/10** | High | All 6 renderers correctly extract and display data with defensive fallbacks. Two genuine gates (17, 22) work. Deducted for 3 phantom gates actively misleading users and `sd_bridge_payloads` data loss. |
| UI/Visual Design | **7/10** | High | Consistent Card/Badge/Collapsible patterns. Test suite progress bars (Stage 20) and source-target flow (Stage 21) are standout designs. Deducted for the 3-col vs 4-col metric grid split. |
| UX/Workflow | **5/10** | High | 100% naming mismatch rate. 5 different gate vocabularies. Phantom gates that say "Gate Failed" or "REJECTED" but don't block. Users cannot build reliable mental models. |
| Architecture | **4/10** | High | ~210 lines of identical advisory collapsible code across 6 files. 5 independent gate enum systems. Color maps redeclared under different names. `venture` prop ignored by all 6 stages. Phantom gates are architecturally invisible to `useNextGate`. |
| **Overall** | **6.2/10** | -- | Strong workflow concept undermined by the worst architectural debt concentration in the 25-stage system. |

### Stage-Level

| Stage | L&F | Func | UI | UX | Arch | Avg |
|:-----:|:---:|:----:|:--:|:--:|:----:|:---:|
| 17 | 8 | 8 | 8 | 7 | 6 | **7.4** |
| 18 | 8 | 7 | 7 | 5 | 5 | **6.4** |
| 19 | 8 | 7 | 7 | 5 | 4 | **6.2** |
| 20 | 8 | 7 | 8 | 5 | 3 | **6.2** |
| 21 | 7 | 7 | 7 | 5 | 4 | **6.0** |
| 22 | 8 | 8 | 7 | 6 | 6 | **7.0** |

Stage 17 (Build Readiness) and Stage 22 (Release Readiness) score highest because they are the two stages with genuine promotion gates and correct responsive metric grids (Stage 17) or richest content integration (Stage 22). Stage 21 (Build Review) scores lowest due to a phantom gate with "REJECTED" language, a fixed 3-column grid, and a naming mismatch.

---

## Unanimous Findings (All 3 AIs Agree)

1. **Stage 20 has the worst phantom gate in Group 5** -- UI literally says "Quality Gate" and "Gate Failed" while `gateType: 'none'` means the workflow engine ignores it. All three AIs rate this Gap Importance 4-5 and recommend immediate promotion to `gateType: 'promotion'`.

2. **5 incompatible gate value enums across 5 gated stages** -- Every stage invents its own tri-state vocabulary for conceptually identical green/amber/red decisions:
   - Stage 17: `go / conditional_go / no_go`
   - Stage 19: `complete / continue / blocked`
   - Stage 20: `pass / conditional_pass / fail`
   - Stage 21: `approve / conditional / reject`
   - Stage 22: `release / hold / cancel`

3. **~210 lines of identical advisory collapsible code** -- The "Full Advisory Details" block is copy-pasted 6 times with only the `ADVISORY_EXCLUDE` array varying. Clear extraction candidate for a shared component.

4. **All 6 naming mismatches should be fixed** -- Every component name diverges from what the UI actually renders. The build cycle is the strongest sequential workflow in the system; the naming undermines it.

5. **The build cycle sequence is the best workflow logic in the 25-stage system** -- Readiness -> Plan -> Execute -> Test -> Review -> Release is a textbook SDLC. No stages are redundant or missing.

6. **Metric grid inconsistency is unintentional** -- Stages 17/19/20 use responsive `grid-cols-2 md:grid-cols-4`; Stages 18/21/22 use fixed `grid-cols-3`. All three AIs recommend standardizing to responsive 4-column.

---

## Majority Findings (2 of 3 AIs Agree)

1. **Stage 21 should be promoted to an enforced gate** -- Gemini and Claude recommend promotion. OpenAI leaves it open (promote OR rephrase). Ground-truth consensus: promote, because "REJECTED" in a build review context should be a blocking state.

2. **`sd_bridge_payloads` data loss in Stage 18** -- Claude and OpenAI identify cross-SD orchestration data excluded from rendering and never surfaced. Gap Importance 4. Gemini does not mention it (likely requires codebase inspection to detect).

3. **Stage 19 should be restyled as informational, not promoted** -- Claude and OpenAI explicitly recommend restyling the banner as a status summary. Gemini recommends rebranding as a "Status View." All three effectively agree: Stage 19 is a continuous execution tracker, not a decision point.

---

## Codebase-Only Findings (Claude Exclusive)

These required direct source code access and were not identified by OpenAI or Gemini:

1. **`venture` prop ignored by all 6 stages** -- All components import `StageRendererProps` (including `venture`) but only destructure `stageData` and `className`. Low priority but worth noting.

2. **Color maps redeclared under different names** -- `SEVERITY_COLORS` (S17), `ISSUE_SEVERITY` (S19), `DEFECT_SEVERITY` (S20) all hold identical values. Same pattern for `STATUS_COLORS` / `TASK_STATUS_COLORS`.

3. **Task description exists but never renders** (Stage 19) -- `Task` interface includes `description?: string` but the task list only shows name, status, ref, and assignee.

4. **`allApproved` false-positive "Pending"** (Stage 22) -- When `allApproved` is `undefined` (data not loaded), the UI shows "Pending" with amber styling, conflating "no data" with "awaiting approval."

5. **Zero accessibility semantics across 1,604 combined lines** -- No `aria-*` attributes, no `role` attributes, no `sr-only` labels. Progress bars are bare `<div>` elements. Decision banners convey status via color alone (though text labels are present within badges).

---

## Consensus Naming Resolution

All three AIs agree on the correct functional names for all 6 stages:

| Stage | Current Component Name | Consensus Name | Backend File |
|:-----:|----------------------|----------------|-------------|
| 17 | `Stage17EnvironmentConfig` | `Stage17BuildReadiness` | `stage-17-build-readiness.js` |
| 18 | `Stage18MvpDevelopmentLoop` | `Stage18SprintPlanning` | `stage-18-sprint-planning.js` |
| 19 | `Stage19IntegrationApiLayer` | `Stage19BuildExecution` | `stage-19-build-execution.js` |
| 20 | `Stage20SecurityPerformance` | `Stage20QualityAssurance` | `stage-20-quality-assurance.js` |
| 21 | `Stage21QaUat` | `Stage21BuildReview` | `stage-21-build-review.js` |
| 22 | `Stage22Deployment` | `Stage22ReleaseReadiness` | `stage-22-release-readiness.js` |

The backend file names already match the consensus functional names. The component names are the only artifacts that lag behind.

---

## The 3 Most Impactful Changes (Consensus)

### 1. Resolve the Phantom Gate Crisis and Unify Gate Nomenclature

**Unanimous priority #1 across all three AIs.**

- Promote Stage 20 to `gateType: 'promotion'` in `venture-workflow.ts` (a quality gate that says "Gate Failed" but doesn't block is actively harmful)
- Promote Stage 21 to `gateType: 'promotion'` (a build review that says "REJECTED" but doesn't block undermines the review process)
- Restyle Stage 19's banner as informational (blue background, "Status Summary" label, remove decision-weight terminology)
- Define a canonical `GateDecision = 'pass' | 'conditional' | 'fail'` type and map all 5 banner constant sets to it

**Impact**: Eliminates the highest-severity functional gap in the group, restores user trust in gate indicators, and reduces 5 independent enum systems to 1.

### 2. Extract Shared Rendering Primitives

**Unanimous priority #2.**

Create 3 shared components:
- `<AdvisoryDetailsCollapsible>` -- replaces ~210 lines of duplicated code (6 identical copies)
- `<DecisionBanner>` -- parameterized by decision values, labels, and colors (replaces 5 independent banner implementations)
- `<MetricGrid>` -- responsive `grid-cols-2 md:grid-cols-4` as default (eliminates the inconsistent 3-col/4-col split)

Also extract `SEVERITY_COLORS`, `STATUS_COLORS`, `PRIORITY_COLORS` into a shared `stage-colors.ts`.

**Impact**: Reduces Group 5 code by ~25%, eliminates metric grid inconsistency, creates reusable primitives for the other 19 stages.

### 3. Fix All 6 Naming Mismatches and Add Accessibility Foundations

**Unanimous priority #3.**

- Rename all 6 components to match their functional purpose (see naming table above)
- Update `venture-workflow.ts` `stageName` values accordingly
- Add `role="progressbar"` with `aria-valuenow/min/max` to all progress bar divs
- Add `aria-live="polite"` to decision banners
- Convert list-like `<div>` chains (checklists, tasks, integrations, release items) to semantic `<ul>/<li>`

**Impact**: Resolves the 100% naming mismatch rate, brings accessibility from zero to baseline WCAG 2.1 A compliance, aligns the codebase with what the UI renders.

---

## Comparison to Phase 1 Estimates

| Dimension | Phase 1 Estimate | Phase 2 Ground-Truth | Delta | Explanation |
|-----------|:----------------:|:--------------------:|:-----:|-------------|
| Logic & Flow | 8 | 8 | 0 | Confirmed. The build cycle is the strongest sequence in the workflow. |
| Functionality | 8 | 7 | -1 | Phase 1 overestimated. The 3 phantom gates are functional defects, not just cosmetic issues. `sd_bridge_payloads` data loss not counted in Phase 1. |
| UI/Visual Design | 7 | 7 | 0 | Confirmed. Strong visual language with the metric grid inconsistency as the main gap. |
| UX/Workflow | 6 | 5 | -1 | Phase 1 underestimated the severity. 100% naming mismatch rate + 5 gate vocabularies + phantom gate trust-breaking is worse than a 6. |
| Architecture | 5 | 4 | -1 | Phase 1 underestimated. The full scope of duplication (~210 lines advisory, 3x color maps, 5 independent banner systems) and phantom gate architectural invisibility drives this down. |
| **Average** | **6.8** | **6.2** | **-0.6** | The deep dive reveals more severity than the Phase 1 survey captured. Group 5 has the best workflow logic but the worst architectural debt concentration in the system. |

---

## Prioritized Action Items

| Priority | Action | Stages | Effort Estimate | Consensus Strength |
|:--------:|--------|:------:|:---------------:|:------------------:|
| P0 | Promote Stage 20 to `gateType: 'promotion'` | 20 | Config change (~5 LOC) | Unanimous |
| P0 | Promote Stage 21 to `gateType: 'promotion'` | 21 | Config change (~5 LOC) | 2-of-3 (strong) |
| P0 | Restyle Stage 19 banner as informational status | 19 | ~20 LOC refactor | Unanimous |
| P1 | Define canonical `GateDecision` enum and map all banners | 17,19-22 | ~100 LOC shared + refactor | Unanimous |
| P1 | Extract `<AdvisoryDetailsCollapsible>` shared component | 17-22 | ~50 LOC new, -210 LOC removed | Unanimous |
| P1 | Extract `<DecisionBanner>` shared component | 17,19-22 | ~80 LOC new, ~150 LOC removed | Unanimous |
| P1 | Standardize metric grid to responsive 4-column | 18,21,22 | ~30 LOC per stage | Unanimous |
| P2 | Rename all 6 components + update config `stageName` | 17-22 | 6 file renames + config | Unanimous |
| P2 | Extract shared color maps to `stage-colors.ts` | 17,19-21 | ~40 LOC new, ~80 LOC removed | 2-of-3 |
| P2 | Surface `sd_bridge_payloads` in Stage 18 | 18 | ~30 LOC | 2-of-3 |
| P3 | Add ARIA attributes to progress bars and banners | 17-22 | ~5 LOC per stage | Claude + OpenAI (partial) |
| P3 | Add semantic list markup for list-like content | 17-22 | ~10 LOC per stage | Claude only |
| P3 | Fix `allApproved` false-positive "Pending" (Stage 22) | 22 | ~10 LOC | Claude only |
| P3 | Render task descriptions in Stage 19 | 19 | ~15 LOC | Claude + OpenAI |
