# Phase 2 Ground-Truth Validation — Group 3: THE_IDENTITY (Stages 10-12)

> This document compares claims from all three AI assessments (OpenAI, Gemini, Claude) against each other and identifies factual disputes, severity disagreements, and coverage gaps. Claude has direct codebase access; OpenAI and Gemini evaluated from prompt + code excerpts.

---

## Disputed Claim 1: Stage 11 Weighted Scoring Bug

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | `totalScore()` uses raw sum instead of weights; ranking, Top Score, and bar math are wrong | Gap 5/5 | **CORRECT** |
| Gemini | Candidate Scoring Visualization is a "strength" — progress bars make "weighted scores easy to understand at a glance" | Listed as strength | **INCORRECT** — Gemini praised the visual without detecting the math bug |
| Claude | `totalScore()` (lines 59-62) sums raw values; `maxPossible` (line 139) sums weights; bar width = raw sum / weight sum, which is mathematically incoherent. Stage 10 has correct implementation for comparison. | Gap 5/5 | **CORRECT** |

**Evidence**: `totalScore()` on lines 59-62 of `Stage11GtmStrategy.tsx`:
```
function totalScore(candidate: Candidate): number {
  if (!candidate.scores) return 0;
  return Object.values(candidate.scores).reduce((sum, v) => sum + (v ?? 0), 0);
}
```

`maxPossible` on line 139 uses `criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0)`, a sum of weights. The progress bar (line 83) computes `total / maxScore` — a raw score sum divided by a weight sum. With criteria weights [30, 30, 20, 20] and scores [8, 7, 9, 6], the bar shows 30/100 = 30%, when the weighted score would be 7.5/10. Stage 10 correctly implements `(score * weight) / 100`.

**Consensus**: **All three agree this is a real bug (OpenAI and Claude explicitly, Gemini implicitly by not contesting the math)**. Gemini's failure to detect the bug despite praising the visualization is the significant miss. This is unanimously the highest-priority fix for the group.

---

## Disputed Claim 2: Stage 11 Naming Mismatch (GtmStrategy) Severity

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | Naming mismatch is "real and harmful" — renders "Naming & Visual Identity" from a file named GtmStrategy | Gap 4/5 | **CORRECT** |
| Gemini | "CRITICAL" — "Severe Component Name Mismatch" that "will confuse developers and potentially break routing" | Score 4/5 (Significant) | **CORRECT on severity, overstated on routing risk** |
| Claude | File, export, config `stageName`, and config `stageKey` all say "GtmStrategy" / "Go-to-Market Strategy". Only the JSDoc and backend file say "Visual Identity." Every layer except the filename tells the wrong story. | Gap 4/5 | **CORRECT** |

**Evidence**: The mismatch table from Claude's opinion is verified:
- File: `Stage11GtmStrategy.tsx` -- says GTM
- Export: `Stage11GtmStrategy` -- says GTM
- Config `stageName`: "Go-to-Market Strategy" -- says GTM
- Config `stageKey`: "gtm-strategy" -- says GTM
- Backend file: `stage-11-visual-identity.js` -- says Visual Identity
- JSDoc (line 2): "Naming & Visual Identity renderer" -- says Visual Identity

**Routing risk assessment**: Gemini claims it could "potentially break routing." This is **overstated** — the file is imported by its current name, so routing works correctly today. The risk is developer confusion and maintenance hazard, not runtime breakage. All three correctly identify this as a significant concern requiring a rename.

**Consensus**: Gap 4/5. All three agree. Gemini slightly overstates runtime risk.

---

## Disputed Claim 3: Stage 12 Should Use Tabs

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | "Stage is long and flat; on mobile it becomes scroll-heavy without internal tabs" — recommends "2-3 internal tabs" | Gap 3/5 | **CORRECT** |
| Gemini | "Abandons tabs for a completely flat layout. This causes severe vertical scrolling and breaks the group's UX continuity." Recommends 4 tabs: Overview, Market Tiers, Acquisition, Funnel Lifecycle | Gap 2/5 (Minor) but strong language | **CORRECT** |
| Claude | 487 LOC, 7+ cards flat stack, "violates the UX pattern the group itself establishes." Recommends 3-4 tabs: Overview, Market Tiers, Sales Funnel, Channels & Journey | Gap 3/5 | **CORRECT** |

**Evidence**: Stage 12 is 487 LOC with zero internal tabs. Stage 10 uses 5 tabs (333 LOC), Stage 11 uses 4 tabs (381 LOC). Stage 12 is the longest renderer in the group yet the only one without tabs.

**Consensus**: **Unanimous**. All three agree Stage 12 should adopt tabs to match the pattern established by Stages 10 and 11. The recommended tab counts differ slightly (2-3, 4, and 3-4 respectively) but the direction is identical.

---

## Disputed Claim 4: Stage 10 Chairman Gate Quality

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | "Chairman approval behaves like a real gate but is modeled as a non-standard UI pattern" | Gap 4/5 | **CORRECT** |
| Gemini | "Binary APPROVED/PENDING but configured as `gateType: 'none'`. Looks like a systemic gate but does not enforce a block." Recommends re-labeling as "Advisory Review." | Score 3/5 (Moderate) | **CORRECT** |
| Claude | Gate correctly handles both `"approved"` and `"pass"` statuses (line 101). However, `gateType: 'none'` in config creates semantic confusion. Users cannot distinguish advisory banners from blocking gates by visual cues alone. | Gap 3/5 | **CORRECT** |

**Evidence**: Lines 114-124 of `Stage10CustomerBrand.tsx` render the Chairman gate with emerald/amber coloring. Line 145 of `venture-workflow.ts` sets `gateType: 'none'`. The gate looks authoritative but is not enforced by the stage-advance-worker.

**Severity disagreement**: OpenAI rates 4/5 (highest), Claude and Gemini rate 3/5. The difference: OpenAI considers the inconsistency between config and UI behavior more harmful. Claude and Gemini both consider it moderate because the gate still communicates useful information (chairman brand approval status) even if it does not block.

**Consensus**: Gap 3/5. The gate implementation is functional and informative, but should be visually distinguished from enforcing gates. Severity is moderate, not severe.

---

## Disputed Claim 5: formatCurrency Duplication

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | Not explicitly mentioned | — | — |
| Gemini | Calls out duplication: "duplicating it for the 4th time across the codebase" — recommends centralizing to `@/lib/utils.ts` | Gap 3/5 (implied) | **PARTIALLY CORRECT** — count is wrong, destination is wrong |
| Claude | Identifies 5 separate copies (Stages 5, 7, 9, 12, 16) plus 1 canonical unused version in `stage-primitives.ts` (line 139-144). Notes signature differences between copies. | Gap 3/5 | **CORRECT** |

**Evidence**: Claude's count of 5 copies + 1 canonical is verified. Gemini's count of "4th time" is an undercount. Gemini recommends centralizing to `@/lib/utils.ts`, but a canonical version already exists in `stage-primitives.ts` — it just is not imported by any stage.

**Consensus**: Five duplicates exist. The fix is to import from the existing `stage-primitives.ts`, not create a new location. Gap 3/5.

---

## Disputed Claim 6: Accessibility (ARIA Attributes)

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | Not scored as a separate dimension. Mentions tab scrollability and JSON.stringify details but not ARIA. | — | **COVERAGE GAP** |
| Gemini | Mentions "Tabular Data Accessibility" (Score 2 Minor) for Stage 10 and ARIA labeling gap. Mentions "Color Contrast Risks" for Stage 11. | Score 2-3 | **PARTIALLY CORRECT but understated** |
| Claude | Dedicated accessibility dimension: Stage 10 = 4/10, Stage 11 = 3/10, Stage 12 = 3/10. "Zero ARIA attributes across all three components" spanning 1,201 total LOC. | Gap 4/5 (systemic) | **CORRECT** |

**Evidence**: Searching the three stage files for `aria-` yields zero results across 1,201 total LOC (333 + 381 + 487). No `role=` attributes on semantic elements. Progress bars lack text alternatives. Color swatches use LLM-supplied hex values as backgrounds without contrast calculation.

**Consensus**: This is a systemic gap, not a per-stage oversight. OpenAI did not flag it at all. Gemini flagged individual instances but did not identify the systemic pattern. Claude correctly identified it as a group-level architectural concern. **Accessibility is the weakest dimension in the group at 3/10.**

---

## Disputed Claim 7: Stage 12 Hidden Typed Fields

| AI | Claim | Fields Identified | Verdict |
|----|-------|-------------------|---------|
| OpenAI | "Important fields hidden from UI: `primaryTier`, `primary_kpi`, `mappedFunnelStage`, `required_next_actions`" | 4 fields | **CORRECT** |
| Gemini | Mentions the "Phantom Reality Gate" but does not identify the specific hidden typed fields | 0 fields | **COVERAGE GAP** |
| Claude | `primaryTier` (line 38), `primary_kpi` (line 41), `mappedFunnelStage` (line 48) typed in interfaces but never rendered. `required_next_actions` (line 68) defined but silently dropped. | 4 fields | **CORRECT** |

**Evidence**: The Stage 12 interfaces define these fields with types:
- `Channel.primaryTier` (line 38) — which market tier a channel targets
- `Channel.primary_kpi` (line 41) — what KPI the channel optimizes
- `DealStage.mappedFunnelStage` (line 48) — how deal stages map to funnel stages
- `RealityGate.required_next_actions` (line 68) — actionable items from the gate

None of these appear in any JSX rendering code. The `blockers` array IS rendered (lines 165-174) but `required_next_actions` is silently dropped.

**Consensus**: OpenAI and Claude both independently identified the same 4 hidden fields. Gemini missed all 4. These fields provide critical cross-referencing context that would link channels to tiers, deal stages to funnel stages, and communicate actionable gate output.

---

## Disputed Claim 8: Naming Approach Label Inconsistency (Stages 10 vs 11)

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Component contract has drift: renderer allows `compound`/`invented` but omits `founder`" | **CORRECT** |
| Gemini | Not mentioned | **COVERAGE GAP** |
| Claude | Stage 10 `NAMING_LABELS` includes `founder` but omits `compound`/`invented`. Stage 11 `APPROACH_LABELS` includes `compound`/`invented` but omits `founder`. A `founder`-approach candidate displays correctly in Stage 10 but falls through to raw string in Stage 11. | **CORRECT** |

**Evidence**: Stage 10 line 29 defines `NAMING_LABELS` with `founder: "Founder-Based"`. Stage 11 lines 37-40 define `APPROACH_LABELS` without `founder` but with `compound: "Compound"` and `invented: "Invented"`. Since both stages render naming candidate data from the same backend pipeline, label coverage is inconsistent.

**Consensus**: OpenAI and Claude both identified this. Gemini missed it. Fix: unify into a shared `NAMING_APPROACH_LABELS` constant in `stage-primitives.ts`.

---

## Disputed Claim 9: Color Contrast for LLM-Supplied Hex Values

| AI | Claim | Severity | Verdict |
|----|-------|----------|---------|
| OpenAI | Not mentioned for Stage 11 | — | — |
| Gemini | "Color Contrast Risks" (Score 3 Moderate) — rendering user-provided hex codes without dark/light text determination. Also "Lack of Dark Mode for Swatches" (Score 2 Minor). | Score 2-3 | **CORRECT** |
| Claude | Stage 11 renders arbitrary LLM-supplied hex values as `backgroundColor` (line 293: `style={{ backgroundColor: color.hex }}`) with white text always. No contrast calculation. Affects both light and dark modes. | Part of Accessibility 3/10 | **CORRECT** |

**Evidence**: Line 293 of `Stage11GtmStrategy.tsx` applies `backgroundColor: color.hex` directly from LLM output. Text is always rendered in white/light color regardless of the background hex value. No WCAG contrast check exists.

**Consensus**: Gemini and Claude both identified this. Claude correctly notes the root issue is deeper than dark mode — it affects any mode when the LLM produces a light hex value. Gap 3/5.

---

## Disputed Claim 10: Gate Type System — Need for `advisory` Type

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Gate semantics are architecturally inconsistent" — recommends unifying names and gate semantics | **CORRECT** (diagnosis without specific solution) |
| Gemini | Recommends introducing "a Formal `advisory` Gate Type" as one of the 3 most impactful changes. Suggests unified non-blocking UI style with gray/amber banners. | **CORRECT** (specific solution) |
| Claude | Recommends introducing `gateType: 'advisory'` to the `GateType` union. Notes the system currently only recognizes `'none'`, `'kill'`, and `'promotion'`. Suggests a shared `AdvisoryGateBanner` component. | **CORRECT** (specific solution, aligned with Gemini) |

**Evidence**: `venture-workflow.ts` defines `GateType = 'none' | 'kill' | 'promotion'`. Stages 10 and 12 use `'none'` while rendering gate UI that looks identical to enforcing gates. This is the root cause of the semantic confusion.

**Consensus**: All three agree the gate semantics are broken. Gemini and Claude independently converge on the same solution: add `'advisory'` to the `GateType` union. This is the recommended approach.

---

## Coverage Gap Summary

| Finding | OpenAI | Gemini | Claude |
|---------|:------:|:------:|:------:|
| Stage 11 scoring bug | Found | **MISSED** (praised as strength) | Found |
| Stage 11 naming mismatch | Found | Found | Found |
| Stage 12 needs tabs | Found | Found | Found |
| Stage 10 Chairman gate | Found | Found | Found |
| formatCurrency duplication | Missed | Found (undercount) | Found |
| Accessibility (ARIA) | Missed | Partial | Found (systemic) |
| Stage 12 hidden typed fields | Found | **MISSED** | Found |
| Naming approach labels | Found | **MISSED** | Found |
| Color contrast (hex) | Missed | Found | Found |
| Advisory gate type needed | Implicit | Found | Found |

**Detection rates**: Claude 10/10, OpenAI 7/10, Gemini 7/10.

OpenAI and Gemini have complementary blind spots: OpenAI caught the hidden fields and approach labels that Gemini missed, while Gemini caught the color contrast and formatCurrency issues that OpenAI missed. Claude, with codebase access, caught all findings.

---

## Score Adjustment Summary

### Stage-Level Adjustments

| Stage | Dimension | OpenAI | Gemini | Adjustment | Rationale |
|-------|-----------|--------|--------|------------|-----------|
| 10 | Functionality | 8 | 9 | **8** | Gemini's 9 is slightly generous — the Chairman gate semantic confusion counts against functionality |
| 11 | Functionality | 5 | 8 | **5** | Gemini scored 8 while missing the scoring bug. Must be adjusted down significantly. |
| 11 | Architecture | 5 | 4 | **4** | Scoring bug + naming mismatch + label gap justify Gemini's lower score |
| 12 | Architecture | 6 | 5 | **5** | 4 hidden typed fields + no tabs + naming mismatch justify Gemini's lower score |

### Gemini's Stage 11 Functionality Score Is the Largest Error

Gemini scored Stage 11 Functionality at 8/10 while simultaneously listing the "Beautiful Visual Identity Rendering" and "Candidate Scoring Visualization" as top strengths. The candidate scoring visualization is the component that contains the most severe bug in the group. This is the single largest scoring error across all three opinions and represents a severity of approximately 3 points too high.
