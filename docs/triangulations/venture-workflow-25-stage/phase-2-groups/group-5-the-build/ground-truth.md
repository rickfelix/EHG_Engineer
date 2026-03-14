# Phase 2 Ground-Truth Validation — Group 5: THE_BUILD (Stages 17-22)

> Compares claims from all three AI assessments (OpenAI, Gemini, Claude) against each other and against the codebase. Claude has direct codebase access; OpenAI and Gemini evaluated from prompt + Stage 1 consensus context. All line-number references below are from Claude's analysis, which provides the most granular sourcing.

---

## Disputed Claim 1: Stage 20 Phantom Gate Severity

**Question**: Claude calls Stage 20 the "worst phantom gate" in the entire 25-stage workflow because the UI literally says "Quality Gate" and "Gate Failed" while config sets `gateType: 'none'`. How do others rate this?

| AI | Claim | Gap Importance | Verdict |
|----|-------|:-:|---------|
| Claude | "Strongest phantom gate deception" and "single most trust-breaking UI element in the entire 25-stage workflow." Lines 104, 106-108 use the word "Gate" twice. `gateType: 'none'` in config. | 5 | **CORRECT** |
| OpenAI | "Most serious phantom gate." "UI presents 'Quality Gate' while config says `gateType: 'none'`." Recommends promoting to enforced gate first. | 5 | **CORRECT** |
| Gemini | "UI aggressively signals 'Quality Gate Failed', yet `gateType` is `none`, breaking user trust." Recommends promoting to `gateType: 'promotion'`. | 4 | **CORRECT** |

**Verdict: UNANIMOUS AGREEMENT.** All three AIs identify Stage 20 as the worst phantom gate in the group. Claude and OpenAI both assign Gap Importance 5 (maximum); Gemini rates it 4 (Significant). The distinction is minor -- all three recommend immediate promotion to an enforced gate.

**Evidence**: The UI at line 104 reads "Quality Gate" and lines 106-108 render "Gate Passed"/"Gate Failed". The `useNextGate` hook filters by `s.gateType !== "none"`, so the workflow engine is completely unaware this "gate" exists. A user who sees "Gate Failed" in red and then discovers they can freely advance will distrust every gate indicator in the system.

**Ground-truth score**: Gap Importance **5**. This is the single highest-priority fix in Group 5.

---

## Disputed Claim 2: Promoting Stages 20 and 21 to Enforced Gates

**Question**: Gemini proposes promoting both Stages 20 and 21 to `gateType: 'promotion'`. Do others agree?

| AI | Stage 20 | Stage 21 | Stage 19 |
|----|----------|----------|----------|
| Claude | Promote to `gateType: 'promotion'` (first priority) | Promote or rephrase (second priority) | Restyle as informational (third priority) |
| OpenAI | "Promote Stage 20 to an enforced gate first." | "Either make this a real gate or downgrade language." | "Either promote to real gate or relabel as informational." |
| Gemini | Promote to `gateType: 'promotion'` ("a standard build loop structurally depends on [QA] success") | Promote to `gateType: 'promotion'` ("manual review/UAT sign-offs are structurally required") | Rebrand visual to "Status View" rather than a hard stop |

**Verdict: STRONG CONSENSUS with nuance.**
- **Stage 20 promote**: Unanimous. All three recommend enforcement.
- **Stage 21 promote**: Gemini and Claude (preferred path) agree on enforcement. OpenAI leaves it open (promote OR downgrade language). Consensus leans toward promotion -- build reviews that say "REJECTED" but don't block undermine the review process.
- **Stage 19 informational**: Unanimous. All three agree Stage 19's "BLOCKED/CONTINUE/COMPLETE" banner should be restyled as a status summary, not promoted to a gate. The rationale: build execution is a continuous process, not a decision point.

**Ground-truth resolution**:
1. Stage 20: Promote to `gateType: 'promotion'` (unanimous)
2. Stage 21: Promote to `gateType: 'promotion'` (2-to-1 consensus, with OpenAI's alternative being to rephrase)
3. Stage 19: Restyle as informational status summary (unanimous)

---

## Disputed Claim 3: Gate Nomenclature -- 5 Incompatible Enums

**Question**: All three AIs identify 5 distinct gate value sets in 6 stages. Is the count correct, and how severe is it?

| AI | Count | Severity | Recommended Fix |
|----|:-----:|----------|----------------|
| Claude | 5 patterns in 6 stages | Gap Importance 4 per stage; group-level "epicenter of the taxonomy crisis" | Canonical `PASS | CONDITIONAL | FAIL` with per-stage display labels |
| OpenAI | 5 patterns | "Group's biggest structural issue" | Standardize to `pass | conditional | fail` internally |
| Gemini | 5 patterns ("five wildly unique gate parameter structures") | Architecture 5/10 group score driver | Global `GateDecision` enum: `APPROVED / CONDITIONAL / REJECTED` |

**Verdict: UNANIMOUS on count and severity.** All three independently identify the same 5 patterns:

```
Stage 17: go          | conditional_go   | no_go
Stage 19: complete    | continue         | blocked
Stage 20: pass        | conditional_pass | fail
Stage 21: approve     | conditional      | reject
Stage 22: release     | hold             | cancel
```

Stage 18 correctly has no gate, so 5 patterns across 5 gated stages. All three agree this is the group's biggest architectural problem.

**Minor divergence on canonical names**: Claude and OpenAI propose `pass/conditional/fail`; Gemini proposes `approved/conditional/rejected`. The difference is cosmetic -- the critical point is unification to a single enum.

**Ground-truth resolution**: Unify to a single canonical enum. The specific value names (`pass/conditional/fail` vs `approved/conditional/rejected`) should be decided during implementation based on the broader 25-stage context (8 total gate nomenclature variants identified in Phase 1).

---

## Disputed Claim 4: Code Duplication Volume (~210 Lines of Advisory Collapsible)

**Question**: Claude claims ~210 lines of identical advisory collapsible code copied across all 6 stages. Do others confirm?

| AI | Claim | Evidence Detail |
|----|-------|-----------------|
| Claude | "~210 lines of identical code (only `ADVISORY_EXCLUDE` varies)" with specific line ranges for all 6 stages | Lines 260-296 (S17), 186-222 (S18), 221-257 (S19), 233-269 (S20), 198-234 (S21), 289-316 (S22) |
| OpenAI | "collapsible advisory, then decision banner, then KPI grid" as duplication priority | No line-number evidence |
| Gemini | "The exact same STATUS_COLORS, SEVERITY_COLORS, and the full 30+ lines of the Collapsible 'Full Advisory Details' block are copypasted 6 consecutive times" | Qualitative confirmation |

**Verdict: UNANIMOUS.** All three identify the advisory collapsible as the primary duplication target. Claude provides exact line ranges; Gemini confirms the pattern and notes ~30+ lines per instance; OpenAI identifies it as the highest-priority extraction.

**Ground-truth finding**: 6 instances x ~35 lines = ~210 lines. Only the `ADVISORY_EXCLUDE` array varies between copies. This is a textbook shared component extraction.

**Additional duplication confirmed by Claude and Gemini**: `STATUS_COLORS`, `SEVERITY_COLORS`, and `PRIORITY_COLORS` maps are redeclared with identical values across multiple stages. Claude locates these in Stages 17 (line 68), 19 (line 55), and 20 (line 54) with different constant names for the same values. Gemini confirms the pattern without line numbers.

---

## Disputed Claim 5: Metric Grid Inconsistency (Responsive vs Fixed)

**Question**: Is the 3-column vs 4-column split intentional or accidental?

| AI | Finding | Assessment |
|----|---------|------------|
| Claude | Stages 17/19/20: `grid-cols-2 md:grid-cols-4` (responsive). Stages 18/21/22: `grid-cols-3` (fixed). "This split appears unintentional -- the fixed-3 stages simply have fewer natural metrics." | Specific line numbers for all 6 stages |
| OpenAI | "Fixed `grid-cols-3` inconsistent and weak on small screens." Metric grid noted in Stages 18, 21, 22. | Qualitative; no line numbers |
| Gemini | "3 vs 4 column grid bouncing." Stages 18/21/22 use 3-column; Stages 17/19/20 use 4-column responsive. | Qualitative confirmation |

**Verdict: UNANIMOUS.** All three identify the same 3-3 split. All three assess it as unintentional and recommend standardizing to responsive 4-column.

**Ground-truth table** (from Claude's line-number evidence):

| Stage | Grid Class | Line | Responsive? | Columns |
|-------|-----------|:----:|:-----------:|:-------:|
| 17 | `grid-cols-2 md:grid-cols-4` | 143 | Yes | 2 -> 4 |
| 18 | `grid-cols-3` | 99 | No | Fixed 3 |
| 19 | `grid-cols-2 md:grid-cols-4` | 117 | Yes | 2 -> 4 |
| 20 | `grid-cols-2 md:grid-cols-4` | 118 | Yes | 2 -> 4 |
| 21 | `grid-cols-3` | 123 | No | Fixed 3 |
| 22 | `grid-cols-3` | 122 | No | Fixed 3 |

**Fix consensus**: Standardize all to `grid-cols-2 md:grid-cols-4`. Add a 4th metric to the three stages that currently have 3: Sprint Duration (Stage 18), Failing Integration Count (Stage 21), Target Date (Stage 22).

---

## Disputed Claim 6: Accessibility Deficit Severity

**Question**: Claude claims zero accessibility semantics across 1,604 combined lines. Do others flag this?

| AI | Claim | Gap Importance |
|----|-------|:-:|
| Claude | "Zero `aria-*` attributes, zero `role` attributes, zero `sr-only` labels" across all 6 stages. Specific gaps: progress bars, decision banners, list-like divs. | 2 per stage (consistent) |
| OpenAI | "No accessibility semantics for progress indicators" (Stage 20 only). | 3 (Stage 20 only) |
| Gemini | Not mentioned. | -- |

**Verdict: PARTIALLY DISPUTED.** Claude identifies this as a systemic gap across all 6 stages with specific evidence (bare `<div>` progress bars, no `role="progressbar"`, no `aria-live` on banners, no semantic lists). OpenAI mentions it for Stage 20 only. Gemini does not address accessibility at all.

**Ground-truth assessment**: Claude's finding is correct -- the codebase evidence is unambiguous (zero ARIA attributes in 1,604 lines). However, the Gap Importance of 2 is appropriate because: (a) Radix collapsibles may inject some keyboard support automatically, and (b) most visual indicators do include text labels alongside color (though not in ARIA-accessible form). This is a real gap but lower priority than phantom gates and nomenclature fragmentation.

---

## Disputed Claim 7: All 6 Naming Mismatches -- Severity

**Question**: All three AIs identify 6/6 naming mismatches. How severe is each?

| Stage | Component Name | Actually Renders | OpenAI Gap | Gemini Gap | Claude Gap |
|:-----:|---------------|-----------------|:----------:|:----------:|:----------:|
| 17 | EnvironmentConfig | Build Readiness | 2 | 3 | 3 |
| 18 | MvpDevelopmentLoop | Sprint Planning | -- | 3 | -- |
| 19 | IntegrationApiLayer | Build Execution | -- | 3 | -- |
| 20 | SecurityPerformance | Quality Assurance | -- | 3 | 4 |
| 21 | QaUat | Build Review | -- | -- | -- |
| 22 | Deployment | Release Readiness | -- | 3 | -- |

**Verdict: UNANIMOUS on existence, SPLIT on severity.**

All three AIs agree that all 6 stages have naming mismatches and that they should be fixed. The severity assessment diverges:

- **Claude**: Identifies Stage 20 as "the worst in the group" (Gap Importance 4) because "Security & Performance" and "Quality Assurance" are entirely different concepts in software engineering. Others are rated 3.
- **Gemini**: Rates all uniformly at 3 (Moderate) and calls the 100% mismatch rate a group-level "severe cognitive dissonance" issue.
- **OpenAI**: Rates naming as Gap Importance 2-3 per stage, treating it as a secondary concern behind phantom gates.

**Ground-truth resolution**: Stage 20's mismatch IS more severe than the others. "Security & Performance" vs "Quality Assurance" involves fundamentally different engineering domains. "EnvironmentConfig" vs "Build Readiness" is misleading but at least adjacent. Consensus severity: Stage 20 is a 4; remaining five are 3.

---

## Disputed Claim 8: `sd_bridge_payloads` Data Loss (Stage 18)

**Question**: Claude flags `sd_bridge_payloads` as excluded and never surfaced. Do others agree?

| AI | Claim | Gap Importance |
|----|-------|:-:|
| Claude | Listed in `ADVISORY_EXCLUDE` (line 75) but never rendered. "Cross-SD orchestration data with no UI surface." | 4 |
| OpenAI | "`sd_bridge_payloads` is excluded but not surfaced elsewhere." | 4 |
| Gemini | Not specifically mentioned. | -- |

**Verdict: 2-of-3 AGREEMENT.** Claude and OpenAI both identify this as a significant data loss. Gemini does not mention it, likely because it requires codebase-level inspection to detect (the field name doesn't appear in the prompt context).

**Ground-truth assessment**: This is a real gap. The bridge payload data is relevant for cross-SD orchestration visibility. Gap Importance 4 is appropriate -- it's not trust-breaking like the phantom gate, but it's a meaningful data omission.

---

## Disputed Claim 9: `venture` Prop Universally Ignored

**Question**: Claude notes all 6 components ignore the `venture` prop from `StageRendererProps`. Is this significant?

| AI | Claim |
|----|-------|
| Claude | "None of the 6 stages destructure the `venture` prop from `StageRendererProps`." |
| OpenAI | Not mentioned. |
| Gemini | Not mentioned. |

**Verdict: CODEBASE-ONLY FINDING.** Only Claude (with codebase access) identifies this. The finding is correct but of moderate significance -- the `venture` prop would provide venture-level context (name, current stage, status) but is not critical for the stage-specific rendering these components perform.

**Ground-truth assessment**: Real finding, low priority. If a future change needs venture-level context in a stage renderer, all 6 would need updating. Worth noting but not an action item for the immediate remediation.

---

## Score Validation

### Stage-Level Score Comparison

**Stage 17: Environment Config / Build Readiness**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 8 | 8* | **8** |
| Functionality | 7 | 8 | 8* | **8** |
| UI/Visual Design | 7 | 8 | 8* | **8** |
| UX/Workflow | 6 | 6 | 7* | **7** |
| Architecture | 5 | 6 | 8* | **6** |

*Claude uses different dimension names (Data Handling, Visual Hierarchy, Responsiveness, Gate Implementation, Accessibility); mapped to closest equivalents.

Note: Claude's Gate Implementation score of 8 is warranted -- this is a genuine promotion gate and the implementation is correct. Architecture consensus settles at 6 because the stage still participates in the gate nomenclature fragmentation.

**Stage 18: MVP Development Loop / Sprint Planning**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 8 | 7* | **8** |
| Functionality | 6 | 8 | 7* | **7** |
| UI/Visual Design | 6 | 7 | 7* | **7** |
| UX/Workflow | 5 | 6 | 4* | **5** |
| Architecture | 5 | 6 | N/A* | **5** |

Note: UX score pulled down by naming mismatch and the fixed 3-column grid. Architecture at 5 reflects duplication and the `sd_bridge_payloads` data loss.

**Stage 19: Integration API Layer / Build Execution**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 8 | 8* | **8** |
| Functionality | 6 | 7 | 8* | **7** |
| UI/Visual Design | 7 | 8 | 7* | **7** |
| UX/Workflow | 5 | 5 | 7* | **5** |
| Architecture | 4 | 5 | 3* | **4** |

Note: Architecture score driven down by the phantom gate pattern. UX at 5 reflects the phantom gate's trust-breaking effect plus naming mismatch.

**Stage 20: Security Performance / Quality Assurance**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 8 | 8* | **8** |
| Functionality | 7 | 7 | 8* | **7** |
| UI/Visual Design | 7 | 8 | 8* | **8** |
| UX/Workflow | 5 | 6 | 7* | **5** |
| Architecture | 4 | 5 | 2* | **3** |

Note: Architecture at 3 is the lowest stage-level score in the group, justified by the worst phantom gate deception (explicit "Quality Gate" language with `gateType: 'none'`) plus the nomenclature variant. UX at 5 reflects that the phantom gate actively misleads users. UI at 8 because the test suite visualization is genuinely excellent.

**Stage 21: QA UAT / Build Review**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 7 | 8 | 7* | **7** |
| Functionality | 6 | 7 | 7* | **7** |
| UI/Visual Design | 6 | 7 | 7* | **7** |
| UX/Workflow | 5 | 6 | 4* | **5** |
| Architecture | 4 | 5 | 3* | **4** |

Note: Architecture at 4 driven by phantom gate with "REJECTED" language plus fixed 3-column grid.

**Stage 22: Deployment / Release Readiness**

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 9 | 8* | **8** |
| Functionality | 7 | 8 | 8* | **8** |
| UI/Visual Design | 7 | 7 | 8* | **7** |
| UX/Workflow | 6 | 6 | 4* | **6** |
| Architecture | 5 | 6 | 7* | **6** |

Note: Architecture at 6 is the highest in the group -- this stage has a genuine promotion gate and the richest content integration. The 5th nomenclature variant and fixed 3-column grid prevent a higher score. Logic & Flow consensus at 8 (Gemini's 9 is generous -- the stage is strong but not exceptional beyond the group's already-high standard).

### Group-Level Score Comparison

| Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-----------|:------:|:------:|:------:|:------------:|
| Logic & Flow | 8 | 8.5 | 8 | **8** |
| Functionality | 7 | 7.5 | 7 | **7** |
| UI/Visual Design | 7 | 7.5 | 7 | **7** |
| UX/Workflow | 5 | 5.5 | 5 | **5** |
| Architecture | 4 | 5 | 4 | **4** |
| **Average** | **6.2** | **6.9** | **6.2** | **6.2** |

**Score adjustment from Phase 1 consensus**: Phase 1 estimated Group 5 at 6.8/10 average. The deep-dive reveals architecture is worse than Phase 1 estimated (4 vs 5) due to the full scope of the phantom gate crisis and 5 nomenclature variants now being verified at the code level. UX also drops (5 vs 6) because the 100% naming mismatch rate and phantom gate trust-breaking are more severe upon close inspection.

---

## Findings Only Codebase Access Reveals

These findings appear only in Claude's analysis because they require direct code inspection:

1. **Exact line numbers for all phantom gate evidence** -- banner constant declarations, config lines, `useNextGate` hook filter logic
2. **`venture` prop universally ignored** -- all 6 stages destructure only `stageData` and `className` from `StageRendererProps`
3. **Precise duplication audit** -- exact line ranges for all 6 advisory collapsible copies, with evidence that only `ADVISORY_EXCLUDE` varies
4. **Color map redeclaration with different names** -- `SEVERITY_COLORS` (S17 line 68), `ISSUE_SEVERITY` (S19 line 55), `DEFECT_SEVERITY` (S20 line 54) all hold identical values
5. **Metric grid CSS class per stage** -- exact line numbers confirming which stages use responsive vs fixed patterns
6. **Stage 17 is the only stage with responsive metric grid in the group** -- `grid-cols-2 md:grid-cols-4` at line 143, which the other responsive stages (19, 20) also follow but 18/21/22 do not
7. **Task description field exists but is never rendered** (Stage 19) -- interface includes `description?: string` at line 24, task list renders only name/status/ref/assignee
8. **`allApproved` false-positive** (Stage 22) -- `undefined` falls through to "Pending" with amber styling at line 145, conflating "no data" with "awaiting approval"
