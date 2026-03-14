# Phase 2 Consensus — Group 2: THE_ENGINE (Stages 6-9)

> Synthesized from OpenAI, Gemini, and Claude Phase 2 deep-dive opinions, adjusted by ground-truth validation.
> Where disputes existed, verdicts from `ground-truth.md` are applied.

---

## Per-Stage Consensus Scores

### Stage 6: Risk Evaluation

| Dimension | OpenAI | Gemini | Claude | Consensus | Notes |
|-----------|--------|--------|--------|-----------|-------|
| Logic & Flow | 8 | 9 | 9 (Data Handling) | **9** | All agree: strong progression, excellent normalization |
| Functionality | 7 | 9 | 9 | **8** | Gemini/Claude rate higher from renderer perspective; OpenAI backend concern (risk count mismatch) is valid but separate |
| UI/Visual Design | 4 | 8 | 9 (Visual Hierarchy) | **8** | OpenAI score invalidated (analyzed backend, not TSX). Gemini/Claude authoritative. |
| UX/Workflow | 6 | 8 | 7 (Responsiveness) | **7** | Mobile table overflow concern (Claude) lowers score vs. Gemini's assessment |
| Architecture | 7 | 7 | 3 (Accessibility) | **6** | OpenAI/Gemini rate template/component structure; Claude's accessibility audit reveals zero a11y attributes |

**Consensus Stage Score: 7.6/10**

---

### Stage 7: Revenue Architecture

| Dimension | OpenAI | Gemini | Claude | Consensus | Notes |
|-----------|--------|--------|--------|-----------|-------|
| Logic & Flow | 7 | 8 | 8 (Data Handling) | **8** | Strong agreement on good logic grouping and safe derivations |
| Functionality | 3 | 8 | 8 | **6** | Split: OpenAI correctly identifies backend contract failures (21/84 test failures); Gemini/Claude confirm frontend renders correctly. Consensus averages frontend success + backend failure. |
| UI/Visual Design | 4 | 8 | 8 (Visual Hierarchy) | **8** | OpenAI score invalidated (backend analysis). Gemini/Claude authoritative. |
| UX/Workflow | 4 | 8 | 8 (Responsiveness) | **7** | OpenAI's low score reflects backend UX gaps; Gemini/Claude assess frontend experience |
| Architecture | 3 | 6 | 4 (formatCurrency + contract gap) | **4** | All agree architecture is weak; Claude identifies the deepest issue (renderer-only derivations creating invisible contract violation) |

**Consensus Stage Score: 6.6/10**

---

### Stage 8: Business Model Canvas

| Dimension | OpenAI | Gemini | Claude | Consensus | Notes |
|-----------|--------|--------|--------|-----------|-------|
| Logic & Flow | 7 | 9 | 8 (Data Handling) | **8** | Faithful Osterwalder layout implementation; strong normalization |
| Functionality | 6 | 8 | 8 | **8** | OpenAI's placeholder concern partially mitigated by renderer's evidence filter (line 120) |
| UI/Visual Design | 5 | 9 | 9 (Visual Hierarchy + Responsiveness) | **9** | Design highlight of Group 2 and arguably the entire 25-stage workflow. OpenAI score invalidated. |
| UX/Workflow | 5 | 8 | 9 (Responsiveness) | **8** | Best responsive implementation in Group 2 (dual desktop/mobile layouts) |
| Architecture | 5 | 8 | 4 (Accessibility) | **6** | Gemini scores component extraction highly; Claude notes a11y gaps and isolated color tokens |

**Consensus Stage Score: 7.8/10**

---

### Stage 9: Exit Strategy

| Dimension | OpenAI | Gemini | Claude | Consensus | Notes |
|-----------|--------|--------|--------|-----------|-------|
| Logic & Flow | 6 | 8 | 7 (Data Handling) | **7** | Good cross-stage context consumption; milestone normalization gap |
| Functionality | 3 | 7 | 5 (Gate Implementation) | **5** | Phantom gate + broken Stage 7 data contract = functional ambiguity. formatCurrency drops negatives. |
| UI/Visual Design | 4 | 8 | 8 (Visual Hierarchy) | **8** | OpenAI score invalidated. Probability bars, fit-score dot matrices are excellent. |
| UX/Workflow | 3 | 6 | 7 (Responsiveness) | **5** | Phantom gate is the #1 UX problem in Group 2; damages trust in entire workflow gate system |
| Architecture | 4 | 6 | 3 (Accessibility) | **4** | Third formatCurrency copy with unique bug; phantom gate architecture contradiction; zero a11y |

**Consensus Stage Score: 5.8/10**

---

## Group-Level Consensus Scores

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| **Logic & Flow** | 7 | 8.5 | 8.5 | **8** | Risk -> Revenue -> BMC -> Exit is the correct sequence. Each stage builds on the previous. No stages are misplaced or redundant. Unanimous agreement across all three opinions. |
| **Functionality** | 4 | 8.0 | 7.5 | **7** | Frontend renderers work correctly with well-formed data. Defensive normalization prevents crashes. Deductions for: phantom gate ambiguity, formatCurrency behavioral divergence (Stage 9 drops negatives), broken Stage 7->9 backend contract. OpenAI's 4 reflects backend failures; Gemini/Claude assess frontend rendering. |
| **UI/Visual Design** | 4 | 8.5 | 8.5 | **8** | OpenAI's group score invalidated (backend analysis). Stage 8 BMC canvas is the design highlight. Stage 6's risk table with expandable mitigations, Stage 7's positioning banner, and Stage 9's probability bars are all domain-appropriate. Consensus score slightly below Gemini/Claude due to Stage 6 mobile overflow. |
| **UX/Workflow** | 4 | 7.5 | 7.0 | **7** | Verdict-first banner pattern gives instant orientation. Progressive disclosure well-applied. Deductions for phantom gate trust damage and risk table mobile overflow. OpenAI's 4 reflects backend UX. |
| **Architecture** | 5 | 6.5 | 5.5 | **5** | The weakest dimension. stage-primitives.ts exists with shared utilities but no Group 2 stage imports from it. 6 formatCurrency implementations with 3 behaviors. Advisory Details section duplicated 22+ times. Renderer-only derivations create invisible backend contract violations. |

**Group 2 Consensus Score: 7.0/10**

*Phase 1 estimated this group at 7.6/10. The Phase 2 deep dive reveals the architecture and functionality scores were overestimated at the high level, primarily due to the phantom gate issue, the formatCurrency behavioral divergence, and the Stage 7->9 contract break, none of which were visible at Phase 1 granularity.*

---

## Unanimous Findings (All 3 AIs Agree)

1. **The business modeling sequence is correct.** Risk -> Revenue -> BMC -> Exit is logically coherent. Each stage builds on the previous, and no stage feels misplaced or redundant.

2. **The Stage 9 phantom gate must be resolved.** All three opinions identify the disconnect between the rendered "Phase 2->3 Reality Gate" banner (PASS/BLOCKED) and the `gateType: 'none'` config. All agree this must be fixed by either enforcing the gate or removing the gate terminology.

3. **formatCurrency duplication must be consolidated.** All three identify the repeated implementation across stages. Claude goes furthest by documenting 6 copies with 3 behaviors and a specific bug (Stage 9 drops negative signs).

4. **Stage 8's BMC CSS Grid canvas is the design highlight.** All three specifically call out the Osterwalder layout with named grid areas as excellent domain-specific visualization.

5. **Stages 6-8 correctly have no enforced gates.** The no-gate philosophy for iterative business modeling stages is unanimously supported. The problem is only at Stage 9, where a gate is displayed but not enforced.

6. **The normalize* function pattern is an architectural strength.** `normalizeRisk`, `normalizeTier`, `normalizeBlock`, `normalizeExitPath`, and `normalizeAcquirer` protect renderers from malformed LLM output. This is a Group 2 best practice.

7. **Architecture is the weakest dimension.** All three score it lowest, with duplication, unused shared utilities, and contract drift as the primary concerns.

---

## Key Disputes and Resolutions

### Resolved: OpenAI UI/Visual Design Scores (4/10 across all stages)
**Resolution**: Invalidated. OpenAI analyzed backend template files, not the TSX renderers. OpenAI explicitly acknowledges: "The prompt's table/row-expansion/mobile claims cannot be validated because the Stage 6 TSX renderer is missing." Gemini and Claude, who analyzed the actual source files, are authoritative. Consensus UI/Visual Design: 8/10.

### Resolved: Phantom Gate Severity (Gemini 4 vs. Claude 5)
**Resolution**: Severity 5 (Claude's assessment). The phantom gate does not just affect Stage 9 — it erodes trust in the entire gate system. Phase 1 consensus identified 6 phantom gates across the workflow (Stages 9, 12, 19, 20, 21, 24), confirming this is systemic. If users discover one gate is decorative, they will question whether the kill gates at Stages 3, 5, and 23 are also decorative. Additionally, the broken Stage 7->9 data contract compounds the issue: the gate will almost always show BLOCKED due to missing upstream data, not actual viability failure.

### Resolved: Architecture Score (Gemini 6.5 vs. Claude 5.5 vs. OpenAI 5)
**Resolution**: 5/10 consensus. The critical factor Gemini did not account for: `stage-primitives.ts` already contains the shared utilities (formatCurrency, color maps) that all four stages redefine locally. This is worse than needing to extract shared code — the extraction was done and then not adopted. OpenAI's backend architecture concerns (dead `computeDerived()`, contract drift) further support the lower score.

### Resolved: Stage 7 Functionality (OpenAI 3 vs. Gemini/Claude 8)
**Resolution**: 6/10 consensus (split). The frontend renderer functions correctly — it safely computes derived metrics and renders them. But the backend contract is genuinely broken (21/84 test failures per OpenAI). These are both true simultaneously. A pure frontend assessment would score 8; a full-stack assessment would score 3-4. The consensus splits the difference to reflect both realities.

### Noted: Stage 8 Placeholder Concern
**Resolution**: Partially mitigated. Stage 8's renderer filters placeholder evidence (line 120: `item.evidence.startsWith("No evidence")`), addressing OpenAI's concern at the UI layer. However, OpenAI's deeper concern — that Stage 9 promotion checks block population but not evidence quality — remains valid at the backend level.

---

## Findings Unique to Single Opinions

### Only Claude identified:
- **formatCurrency negative-sign bug in Stage 9** (silently displays negative valuations as positive)
- **Zero accessibility attributes across all 1,445 lines** (WCAG 2.1.1 and 1.4.1 failures)
- **22+ copies of Advisory Details Collapsible section** (~440 lines of pure duplication)
- **stage-primitives.ts exists but is unused by Group 2** (worse than pre-extraction duplication)
- **6 formatCurrency implementations with 3 distinct behaviors**

### Only OpenAI identified:
- **21/84 backend test assertion failures** for Stage 7 derived economics
- **Risk count mismatch** (Stage 6 generates 8, Stage 9 promotion requires 10)
- **Dead `computeDerived()` backend pattern** across multiple stages

### Only Gemini identified:
- **Misaligned scoring thresholds** (`getRiskLevel` uses 1-10 scale, `getScoreBadgeColor` uses 0-100)
- **Hardcoded health thresholds** buried in JSX (LTV:CAC < 3 amber, churn > 5% red)
- **PRIORITY_COLORS keying mismatch** (Stage 8 uses numeric keys, stage-primitives uses string keys)

---

## Prioritized Action Items

### P0 — Critical (Do First)

| # | Action | Evidence | Effort |
|---|--------|----------|--------|
| 1 | **Resolve the Stage 9 phantom gate** | All 3 opinions agree. `venture-workflow.ts` line 136 says `gateType: 'none'`; renderer lines 149-175 display PASS/BLOCKED. Choose: (A) Enforce it — set `gateType: 'reality'`, wire stage-advance-worker; or (B) De-gate it — rename to "Viability Assessment", change badges to "Favorable"/"Concerns Identified". | Option A: ~50 LOC config + backend. Option B: ~20 LOC UI. |
| 2 | **Fix Stage 7->9 data contract** | OpenAI (21/84 test failures) + Claude (renderer-only derivations never persisted). Stage 7 backend must persist `ltv`, `ltv_cac_ratio`, `projected_arr`, `payback_months` in `advisory_data`. Prerequisite for P0-1 Option A. | ~30-50 LOC in `stage-07-pricing-strategy.js` |

### P1 — High Priority

| # | Action | Evidence | Effort |
|---|--------|----------|--------|
| 3 | **Fix stage-primitives.ts formatCurrency, then consolidate all 6 copies** | Claude found 6 implementations with 3 behaviors. Stage 9's copy silently drops negative signs. Shared version must handle: `number \| null \| undefined`, negatives with sign prefix, `toLocaleString()` for small values. Then delete all 5 local copies. | ~20 LOC fix + ~30 LOC deletions across 5 files |
| 4 | **Extract Advisory Details Collapsible into shared component** | Claude found 22+ copies across the codebase (~440 LOC duplication). Create `<AdvisoryDetailsCollapsible entries={entries} />` in shared components. | ~40 LOC component + ~440 LOC deleted |
| 5 | **Import shared color maps in Group 2 stages** | Claude: Stage 6 redefines `SCORE_BANNER`/`SCORE_BADGE` (identical to `SEVERITY_BANNER_COLORS`/`SEVERITY_BADGE_COLORS` in stage-primitives.ts). Gemini: Stage 8 `PRIORITY_COLORS` uses numeric keys vs. string keys in shared file. | ~30 LOC refactor across 4 files |

### P2 — Medium Priority

| # | Action | Evidence | Effort |
|---|--------|----------|--------|
| 6 | **Add accessibility attributes to all Group 2 renderers** | Claude: zero `aria-*`, `role`, `tabIndex`, `onKeyDown` across 1,445 LOC. Specific WCAG failures: Stage 6 expandable rows mouse-only (2.1.1), Stage 9 fit-score dots color-only (1.4.1). | ~60-80 LOC across 4 files |
| 7 | **Fix Stage 6 risk table mobile overflow** | Claude: 7-column table has no responsive fallback. Add `overflow-x-auto` wrapper or card-based mobile layout (like Stage 8's `hidden lg:grid`/`lg:hidden` pattern). | ~20-30 LOC |
| 8 | **Add normalizeMilestone to Stage 9** | Claude: milestones pass through without per-element normalization. Every other entity in Group 2 has a normalize function. | ~15 LOC |
| 9 | **Align Stage 6 risk generation count with Stage 9 promotion threshold** | OpenAI: Stage 6 generates 8 risks, Stage 9 promotion requires 10. | ~5 LOC config change |

### P3 — Low Priority

| # | Action | Evidence | Effort |
|---|--------|----------|--------|
| 10 | **Centralize business threshold constants** | Gemini + Claude: LTV:CAC < 3 amber threshold, churn > 5% red, risk score boundaries all hardcoded in JSX. Move to shared constants file. | ~20 LOC shared + ~15 LOC refactor |
| 11 | **Add overflow protection to Stage 8 BMCCell** | Gemini + Claude: no `max-height` on BMC cells; long LLM output could distort canvas proportions. Add `max-h-[300px] overflow-y-auto`. | ~5 LOC |
| 12 | **Fix Stage 8 BMC grid DOM order for screen readers** | Gemini + Claude: CSS Grid visual order differs from DOM reading order. Add `aria-label` to grid regions. | ~15 LOC |

---

## Comparison With Phase 1 Estimates

| Dimension | Phase 1 Consensus | Phase 2 Consensus | Delta | Explanation |
|-----------|-------------------|-------------------|-------|-------------|
| Logic & Flow | 8 | 8 | 0 | Phase 1 assessment was accurate |
| Functionality | 8 | 7 | -1 | Phantom gate ambiguity and formatCurrency bug not visible at Phase 1 |
| UI/Visual Design | 7 | 8 | +1 | Phase 1 was influenced by OpenAI's backend-based UI scores; Phase 2 corrects upward |
| UX/Workflow | 7 | 7 | 0 | Phase 1 assessment was accurate |
| Architecture | 7 | 5 | -2 | Largest correction. Phase 1 revised architecture upward due to shared components existing; Phase 2 reveals they exist but are not used. formatCurrency behavioral divergence and Stage 7->9 contract break were not visible at high level. |
| **Overall** | **7.6** | **7.0** | **-0.6** | Architecture deficit is worse than Phase 1 estimated |

---

## Phase 2 Targeted Questions — Resolved

From the Phase 1 consensus, Group 2's targeted questions were:
1. **"Should Stage 9's reality gate be formalized?"** — Yes, unanimously. Either enforce it as a real gate or rename it to remove gate terminology. The current state (displayed but unenforced) is the worst of all options.
2. **"Is the BMC canvas mobile experience adequate?"** — Yes, it is the best responsive implementation in Group 2, with an explicit dual-layout strategy. Minor improvements (overflow protection, accessibility labeling) recommended but not critical.
