# Phase 2 Consensus — Group 3: THE_IDENTITY (Stages 10-12)

> Synthesized from OpenAI, Gemini, and Claude opinions, adjusted by ground-truth validation. See `ground-truth.md` for detailed dispute resolution.

---

## Consensus Scores

### Per-Stage Scores

#### Stage 10: Customer & Brand Foundation

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|:------:|:------:|:------:|:---------:|-----------|
| Logic & Flow | 8 | 8 | — | **8** | Unanimous. 5-tab internal organization is well-justified by data density. |
| Functionality | 8 | 9 | 9 (Data) | **8** | Gemini's 9 adjusted down: Chairman gate semantic confusion is a functional issue. Data normalization and weighted scoring are genuinely strong. |
| UI/Visual Design | 8 | 9 | 8 (Visual) | **8** | Clean tab layout, clear summary banners, good information density. Gemini slightly generous. |
| UX/Workflow | 7 | 8 | — | **7** | Tab overflow on mobile (no `overflow-x-auto`) and hidden personas behind collapsibles limit UX score. |
| Architecture | 7 | 8 | — | **7** | Well-structured component, but Chairman gate using `gateType: 'none'` while rendering an authoritative gate UI is an architectural inconsistency. |
| Responsiveness | — | — | 6 | **6** | Only Claude scored this. 5 tabs with no scroll mechanism will break below ~480px. |
| Accessibility | — | — | 4 | **4** | Only Claude scored this. Zero ARIA attributes. Dynamic hex colors from `AVAIL_COLORS` untested for contrast. |

**Stage 10 Average: 7.4/10** — The strongest stage in the group. Correct weighted scoring, robust normalization, and effective tabbed layout.

---

#### Stage 11: Naming & Visual Identity (file: Stage11GtmStrategy.tsx)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|:------:|:------:|:------:|:---------:|-----------|
| Logic & Flow | 7 | 6 | — | **7** | Good conceptual flow from Stage 10 personas to naming to visual identity. Gemini's 6 reflects the naming mismatch impact on structural logic. |
| Functionality | 5 | 8 | 5 (Data) | **5** | **Gemini's 8 is the largest scoring error across all opinions.** The weighted scoring bug makes ranking, Top Score, and progress bars functionally incorrect. Gemini praised the scoring visualization as a strength while missing the underlying math bug. |
| UI/Visual Design | 7 | 8 | 8 (Visual) | **8** | Color palette swatches, typography displays, and brand expression cards are genuinely well-designed. Visual quality is high despite the data bug. |
| UX/Workflow | 6 | 7 | — | **6** | Good 4-tab structure, but the scoring bug means users see incorrect rankings, undermining decision trust. |
| Architecture | 5 | 4 | — | **4** | Scoring bug + naming mismatch at every layer (file, export, config stageName, config stageKey) + approach label inconsistency with Stage 10. Gemini's lower score is justified. |
| Responsiveness | — | — | 6 | **6** | Only Claude scored this. TabsList has no custom width classes. Typography grid uses `grid-cols-2` without responsive prefix. |
| Accessibility | — | — | 3 | **3** | Only Claude scored this. Zero ARIA attributes. Color swatches render LLM-supplied hex as backgrounds with white text always — no contrast calculation. |

**Stage 11 Average: 5.6/10** — Dragged down by the scoring bug and naming mismatch. Visual design quality is high, but functional correctness and architecture are poor.

---

#### Stage 12: GTM & Sales Strategy (file: Stage12SalesSuccessLogic.tsx)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|:------:|:------:|:------:|:---------:|-----------|
| Logic & Flow | 7 | 7 | — | **7** | Coherent business narrative: market tiers, channels, funnel, deal stages, customer journey. |
| Functionality | 7 | 8 | 7 (Data) | **7** | Data extraction is competent but 4 typed fields are never rendered. Gemini's 8 is slightly generous given the hidden fields. |
| UI/Visual Design | 7 | 7 | 6 (Visual) | **7** | TAM/SAM/SOM bars and funnel narrowing are effective. Claude's lower score reflects the flat layout harming visual hierarchy. |
| UX/Workflow | 6 | 6 | — | **6** | Unanimous agreement on UX issues. 487 LOC in a flat vertical stack with no tabs breaks the pattern established by Stages 10-11. |
| Architecture | 6 | 5 | — | **5** | Naming mismatch + 4 hidden typed fields + no tabs despite being the longest component. Gemini's lower score is justified by ground-truth. |
| Gate Implementation | — | — | 5 | **5** | Only Claude scored this. Reality gate renders PASS/BLOCKED identical to kill gates, but `gateType: 'none'`. `required_next_actions` silently dropped. |
| Responsiveness | — | — | 6 | **6** | Only Claude scored this. TAM/SAM/SOM `grid-cols-3` has no mobile breakpoint. No horizontal scroll for channel rows. |
| Accessibility | — | — | 3 | **3** | Only Claude scored this. Zero ARIA attributes. Funnel bars purely visual with no text alternative. Color-only differentiation in channel types. |

**Stage 12 Average: 5.9/10** — Comprehensive data coverage weakened by flat layout, hidden fields, and gate semantic confusion.

---

### Group-Level Consensus Scores

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|:------:|:------:|:------:|:---------:|-----------|
| Logic & Flow | 8 | 7 | — | **7** | Strong business narrative (brand -> visual identity -> market strategy). File naming confusion pulls it down from Stage 10's excellence. |
| Functionality | 6 | 8 | 7 (Data) | **6** | Stage 11 scoring bug is the only functionally broken feature, but it is severe. Stage 10 is excellent. Stage 12 omits typed fields. |
| UI/Visual Design | 7 | 8 | 7 (Visual) | **7** | High visual quality across Stages 10-11. Stage 12's flat layout and inconsistent gate styling reduce the group score. |
| UX/Workflow | 7 | 7 | — | **7** | Tabbed layouts work well in Stages 10-11. Stage 12 breaks the pattern. Gate semantic confusion harms trust. |
| Architecture | 6 | 5 | — | **5** | Naming mismatches in 2 of 3 stages, scoring bug, 5x formatCurrency duplication, inconsistent approach labels, hidden typed fields. |
| Responsiveness | — | — | 6 | **6** | No tab list has overflow-x-auto. Stage 12 grids lack mobile breakpoints. |
| Accessibility | — | — | 3 | **3** | Zero ARIA attributes across 1,201 LOC. Color-only differentiation. No text alternatives for progress bars or funnel visualizations. Systemic gap. |

**Group 3 Overall: 5.9/10** (compared to Phase 1 estimate of 7.8/10)

The Phase 1 estimate of 7.8/10 was inflated because Phase 1 did not examine the scoring bug, hidden fields, accessibility gaps, or formatCurrency duplication. The Phase 2 deep dive reveals genuine functional and architectural issues that Phase 1's high-level assessment missed. Stage 10 is solid (7.4), but Stages 11 (5.6) and 12 (5.9) bring the group down.

---

## Unanimous Findings (All 3 AIs Agree)

1. **Stage 11 weighted scoring is broken** — `totalScore()` uses raw sum while `maxPossible` uses weight sum. This produces incorrect candidate rankings and misleading progress bars.
2. **Stage 11 naming mismatch must be fixed** — `Stage11GtmStrategy.tsx` renders "Naming & Visual Identity" content. File, export, config stageName, and config stageKey are all wrong. Only JSDoc and backend filename are correct.
3. **Stage 12 naming mismatch must be fixed** — `Stage12SalesSuccessLogic.tsx` renders "GTM & Sales Strategy" content. Same cascading mismatch as Stage 11.
4. **Stage 12 should adopt tabs** — At 487 LOC and 7+ cards, it is the longest and most complex renderer in the group but the only one without internal tabs.
5. **Stage 10 Chairman gate is semantically confusing** — Renders with the visual authority of a blocking gate but `gateType: 'none'` means no enforcement.
6. **Identity narrative coherence is strong** — The business progression from brand foundation (10) to visual identity (11) to market strategy (12) is logically sound and well-sequenced.

## Majority Findings (2 of 3 AIs Agree)

7. **Stage 12 hides 4 typed fields** (OpenAI + Claude) — `primaryTier`, `primary_kpi`, `mappedFunnelStage`, and `required_next_actions` are defined in TypeScript interfaces but never rendered. Gemini missed all 4.
8. **formatCurrency is duplicated 5 times** (Gemini + Claude) — Five stage files define local copies. A canonical version exists in `stage-primitives.ts` but zero stages import it. OpenAI did not flag this.
9. **Naming approach labels are inconsistent** (OpenAI + Claude) — Stage 10 includes `founder` but omits `compound`/`invented`. Stage 11 includes `compound`/`invented` but omits `founder`. Gemini missed this.
10. **Color contrast for LLM-supplied hex values is a risk** (Gemini + Claude) — Stage 11 renders arbitrary hex values as background colors with no contrast check. OpenAI did not flag this.
11. **An `advisory` gate type is needed** (Gemini + Claude) — Both independently recommend adding `gateType: 'advisory'` to distinguish non-enforced informational gates from blocking gates. OpenAI identified the problem without proposing this specific solution.

## Unique Findings (1 AI Only)

12. **Accessibility is a systemic gap** (Claude only) — Zero `aria-label`, `aria-expanded`, `role`, or `scope` attributes across all 1,201 LOC. This is not visible without codebase search. **Validated as ground truth.**
13. **Stage 10 Details tab uses raw `JSON.stringify`** (Claude only) — Line 322 renders overflow advisory data as unformatted JSON blobs. The `KVRow` component on line 71-78 already exists and could be extended. **Validated.**
14. **Stage 12 reality gate `required_next_actions` is the most actionable field** (Claude only) — For a gate communicating "what to do next," the most user-relevant field is silently dropped while `blockers` is rendered. **Validated.** (Note: OpenAI also identified the field as hidden, but Claude specifically called out the actionability contrast with `blockers`.)

---

## Consensus Top Priorities — The 5 Most Impactful Changes

### Priority 1: Fix Stage 11 Weighted Scoring (Critical)
**Unanimous agreement.** Replace `totalScore()` (lines 59-62 of `Stage11GtmStrategy.tsx`) with a weighted implementation matching Stage 10's `weightedScore()` pattern: `criteria.reduce((s, c) => s + ((candidate.scores?.[c.name ?? ""] ?? 0) * (c.weight ?? 0)) / 100, 0)`. Update all call sites: `CandidateCard`, sorting logic (line 132), `topScore` (line 140), and progress bar denominators.

**Impact**: Fixes the only functionally incorrect feature in the group. Incorrect candidate rankings and misleading progress bars directly undermine user trust in the platform's evaluation logic.

### Priority 2: Resolve Naming Mismatches (Significant)
**Unanimous agreement.** Rename two files and update all references:
- `Stage11GtmStrategy.tsx` -> `Stage11VisualIdentity.tsx`
- `Stage12SalesSuccessLogic.tsx` -> `Stage12GtmSales.tsx`

Update config entries in `venture-workflow.ts` (`stageName`, `stageKey`, `componentPath`), export function names, and any import references.

**Impact**: Eliminates a persistent maintenance hazard. The cascading mismatch (Stage 11's real content was the name Stage 12 used, and Stage 12's real content was what Stage 11 was named) creates maximum confusion.

### Priority 3: Introduce `advisory` Gate Type (Significant)
**Gemini + Claude convergence, OpenAI implicit agreement.** Add `'advisory'` to the `GateType` union in `venture-workflow.ts` (currently `'none' | 'kill' | 'promotion'`). Update Stages 10 and 12 config to use `gateType: 'advisory'`. Create a shared `AdvisoryGateBanner` component with visually distinct styling (blue/info tone instead of emerald/red/amber) that clearly communicates "informational, not blocking."

**Impact**: Two non-enforced gates in a 3-stage group that look identical to enforcing gates erodes trust in the entire gate system. Users cannot tell which gates actually block progression. This also addresses the broader "6 phantom gates" finding from Phase 1.

### Priority 4: Surface Stage 12 Hidden Fields (Moderate)
**OpenAI + Claude agreement.** Render the 4 typed-but-hidden fields:
- `primaryTier` and `primary_kpi` as inline badges in the Acquisition Channels section
- `mappedFunnelStage` as a badge in the Deal Stages section
- `required_next_actions` below the `blockers` list in the reality gate banner, with distinct styling (blue/info vs red blockers)

**Impact**: These fields provide cross-referencing context that links channels to tiers, deal stages to funnel stages, and communicates actionable gate output. Without them, the UI presents disconnected lists.

### Priority 5: Refactor Stage 12 to Tabbed Layout (Moderate)
**Unanimous agreement.** Split Stage 12's flat 7+ card stack into 3-4 internal tabs. Recommended structure:
- **Overview**: Reality gate + summary metrics
- **Market**: Market tiers + acquisition channels (with `primaryTier`/`primary_kpi` badges)
- **Sales Flow**: Sales funnel + deal stages (with `mappedFunnelStage` badges) + customer journey

**Impact**: Restores UX consistency within the group. Stage 12 is the longest renderer (487 LOC) but the only one without tabs, creating a jarring shift from the patterns Stages 10-11 establish.

---

## Additional Recommended Changes (Lower Priority)

| Priority | Change | Source | Effort |
|----------|--------|--------|--------|
| P3 | Centralize `formatCurrency` — import from `stage-primitives.ts` instead of duplicating | Gemini + Claude | ~5 min per stage, 5 stages |
| P3 | Unify naming approach labels into shared `NAMING_APPROACH_LABELS` in `stage-primitives.ts` | OpenAI + Claude | ~30 LOC |
| P3 | Add `overflow-x-auto` to TabsList wrappers in Stages 10 and 11 | OpenAI + Claude | ~2 LOC per stage |
| P3 | Add contrast calculation utility for LLM-supplied hex color swatches | Gemini + Claude | ~30 LOC utility |
| P4 | Replace `JSON.stringify` in Stage 10 Details tab with structured key-value rendering | Claude | ~20 LOC |
| P4 | Add ARIA attributes to collapsibles, tables, and progress bars | Claude | ~50 LOC across group |
| P4 | Add responsive breakpoints to Stage 12 TAM/SAM/SOM grid | Claude | ~5 LOC |

---

## Comparison with Phase 1 Assessment

| Dimension | Phase 1 Consensus | Phase 2 Consensus | Delta | Explanation |
|-----------|:-----------------:|:-----------------:|:-----:|-------------|
| Logic & Flow | 8 | 7 | -1 | Naming mismatches reduce structural logic clarity |
| Functionality | 8 | 6 | -2 | Stage 11 scoring bug not detected in Phase 1 |
| UI/Visual Design | 8 | 7 | -1 | Stage 12 flat layout and gate styling inconsistency |
| UX/Workflow | 8 | 7 | -1 | Stage 12 breaks tabbed pattern; gate confusion |
| Architecture | 7 | 5 | -2 | Duplication, hidden fields, label gaps only visible at code level |

**Phase 1 Group Score: 7.8** -> **Phase 2 Group Score: 5.9** (delta: -1.9)

Phase 1's score was the highest of all 6 groups, largely due to the upward correction from the Stage 10 refactoring (333 LOC, no longer 815). Phase 2 reveals that while Stage 10 is indeed well-refactored, Stages 11 and 12 have genuine functional and architectural issues that Phase 1's high-level assessment could not detect. The Phase 1 score overcompensated for the Stage 10 correction without examining the other stages at code level.

---

## Detection Performance

| AI | Findings Detected (of 10 key findings) | Largest Miss | Largest Unique Contribution |
|----|:---------------------------------------:|--------------|----------------------------|
| **Claude** | 10/10 | None | Accessibility as systemic gap (3/10 across 1,201 LOC) |
| **OpenAI** | 7/10 | formatCurrency duplication, color contrast, accessibility | Concise severity calibration; identified hidden fields independently |
| **Gemini** | 7/10 | Scoring bug (praised as strength), hidden typed fields, approach labels | `advisory` gate type proposal; formatCurrency centralization |

OpenAI and Gemini have complementary blind spots. OpenAI caught structural issues (hidden fields, approach labels) that Gemini missed, while Gemini caught utility concerns (formatCurrency, color contrast) that OpenAI missed. Claude, with codebase access, caught all findings and provided the only accessibility assessment.
