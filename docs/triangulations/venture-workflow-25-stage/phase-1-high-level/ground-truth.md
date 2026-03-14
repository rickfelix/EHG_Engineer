# Phase 1 Ground-Truth Validation — 25-Stage Venture Workflow

> This document compares claims from all three AI assessments (OpenAI, Gemini/AntiGravity, Claude/Anthropic) against the actual codebase. Claude/Anthropic has codebase access; OpenAI and Gemini evaluated from the prompt description only.

## Disputed Claims Resolution

### Claim 1: Stage 10 is 815 LOC (Oversized)
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | Stage 10 at 815 LOC is "the clearest architectural smell" (Architecture 5/10 for Group 3) | **INCORRECT** |
| Gemini | "815 LOC is a red flag" (Architecture 5/10 for Group 3) | **INCORRECT** |
| Claude | Stage 10 is 333 LOC after refactoring (commit `9b61b694`) | **CORRECT** |

**Evidence**: `wc -l Stage10CustomerBrand.tsx` = 333 lines. Git history shows refactoring commit "extract shared stage primitives, fix V2 chunk naming, improve gate UX, decompose Stage 10/11". Both external AIs based their assessment on the prompt's historical 815 LOC figure, which is now outdated.

**Impact on scores**: Both OpenAI and Gemini should revise Group 3 Architecture scores upward by ~1-2 points.

---

### Claim 2: Legacy Chunk Names ('foundation', 'validation')
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Legacy chunk naming in the first two groups weakens conceptual clarity" | **INCORRECT** |
| Gemini | "Uses legacy chunk name 'foundation'" and "'validation' chunk name" | **INCORRECT** |
| Claude | All 25 stages use Vision V2 names: THE_TRUTH, THE_ENGINE, THE_IDENTITY, THE_BLUEPRINT, THE_BUILD, THE_LAUNCH | **CORRECT** |

**Evidence**: `grep "chunk:" venture-workflow.ts` shows all 25 entries use Vision V2 names. No occurrences of 'foundation' or 'validation' in current config.

**Impact on scores**: Both external AIs deducted Architecture points for this. Group 1 and Group 2 Architecture scores should be revised upward.

---

### Claim 3: Stage 23 Kill Gate Bug
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Stage 23 is marked as a kill gate but does not render as one" | **CORRECT** |
| Gemini | "Kill gate is declared but NOT rendered — banner is missing" | **CORRECT** |
| Claude | Confirmed: `venture-workflow.ts:277` sets `gateType: 'kill'`, component comment says "kill gate", but no gate banner exists in code | **CORRECT** |

**Evidence**: `Stage23ProductionLaunch.tsx` (199 LOC) has no `DECISION_BANNER` constant, no gate decision extraction, and no banner rendering. Compare to Stage 13 (`Stage13TechStackInterrogation.tsx`) which has the equivalent kill gate implementation at lines 39-43 and 108-142.

**Unanimous agreement** — all three AIs identified this as a real bug.

---

### Claim 4: Stage 24 Should Be a Gate
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Stage 24 functions like a gate but is not classified as one" | **CORRECT** |
| Gemini | "Stage 24 IS a gate — it has a Go/Conditional/No-Go decision banner" | **CORRECT** |
| Claude | Confirmed: renders `DECISION_BANNER` with go/conditional_go/no_go values but config says `gateType: 'none'` | **CORRECT** |

**Evidence**: `Stage24GrowthMetricsOptimization.tsx:29-39` defines `DECISION_BANNER` and `DECISION_BADGE`. Lines 95-114 render the banner. But `venture-workflow.ts:287` sets `gateType: 'none'`. The stage-advance-worker won't enforce this "gate."

**Unanimous agreement** — phantom gate confirmed.

---

### Claim 5: Naming Mismatches in Groups 4-6
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Stage 13 and Stage 16 naming mismatches are not cosmetic" | **CORRECT (undercount)** |
| Gemini | "12 naming mismatches total across Stages 13-25" | **CORRECT** |
| Claude | 12 of 13 stages in Groups 4-6 have naming mismatches (Stage 14 is approximate match) | **CORRECT** |

**Evidence**: Full mismatch table verified with `grep` of component comments and backend references:

| Stage | Component Name | Actually Renders | Match? |
|-------|---------------|-----------------|--------|
| 13 | TechStackInterrogation | Product Roadmap | NO |
| 14 | DataModelArchitecture | Technical Architecture | ~YES |
| 15 | EpicUserStoryBreakdown | Risk Register | NO |
| 16 | SchemaFirewall | Financial Projections | NO |
| 17 | EnvironmentConfig | Build Readiness | NO |
| 18 | MvpDevelopmentLoop | Sprint Planning | NO |
| 19 | IntegrationApiLayer | Build Execution | NO |
| 20 | SecurityPerformance | Quality Assurance | NO |
| 21 | QaUat | Build Review | NO |
| 22 | Deployment | Release Readiness | NO |
| 23 | ProductionLaunch | Marketing Prep | NO |
| 24 | GrowthMetricsOptimization | Launch Readiness | NO |
| 25 | ScalePlanning | Launch Execution | NO |

**Unanimous agreement** on the existence and severity of this issue.

---

### Claim 6: No Shared Renderer Primitives
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Too much renderer-local logic" implies no shared components | **PARTIALLY INCORRECT** |
| Gemini | "No shared primitives" (repeated across groups) | **INCORRECT** |
| Claude | 6 shared components exist in `src/components/stages/shared/`: AdvisoryDataPanel, ArtifactListPanel, AssumptionsRealityPanel, GoldenNuggetsPanel, PhaseGatesSummary, StageEmptyState | **CORRECT** |

**Evidence**: `find src/components/stages/shared/ -name "*.tsx"` returns 6 files. However, these are mostly used by Stages 1-2 only. The later stages (3-25) do not use them, so the external AIs' concern about duplication is partially valid — shared components exist but are underutilized.

---

### Claim 7: Gate Decision Nomenclature Fragmentation
| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | Did not identify this issue specifically | — |
| Gemini | Did not identify this issue specifically | — |
| Claude | 8 different naming conventions for the same 3-way decision pattern | **CORRECT** |

**Evidence** (codebase-only finding):

| Stage | Constant Name | Values |
|-------|--------------|--------|
| 3 | (inline) | PASS / REVISE / KILL |
| 5 | (inline) | pass / conditional_pass / kill |
| 9 | (inline) | PASS / BLOCKED |
| 13 | DECISION_BANNER | pass / conditional_pass / kill |
| 16 | GATE_BANNER | promote / conditional / hold |
| 17 | DECISION_BANNER | go / conditional_go / no_go |
| 19 | COMPLETION_BANNER | complete / continue / blocked |
| 20 | QUALITY_BANNER | pass / conditional_pass / fail |
| 21 | REVIEW_BANNER | approve / conditional / reject |
| 22 | RELEASE_BANNER | release / hold / cancel |
| 24 | DECISION_BANNER | go / conditional_go / no_go |

This is an architecture concern that only codebase access reveals — the prompt described gate concepts but didn't surface the per-stage naming divergence.

---

## Score Adjustment Summary

### Group-Level Score Adjustments

| Group | Dimension | OpenAI | Gemini | Ground-Truth Adjusted |
|-------|-----------|--------|--------|-----------------------|
| G1 | Architecture | 6 | 6 | **7** (+1: chunk names fixed) |
| G2 | Architecture | 6 | 6 | **7** (+1: chunk names fixed) |
| G3 | Architecture | 5 | 5 | **7** (+2: Stage 10 refactored, chunk names fixed) |
| G3 | UX/Workflow | 7 | 7.5 | **8** (+1: Stage 10 tabbed UI reduces overload) |
| G6 | Functionality | 5 | 5 | **4** (-1: Stage 23 bug more severe than scored) |

### Aggregate Score Comparison

| Dimension | OpenAI | Gemini | Claude | Ground-Truth Consensus |
|-----------|--------|--------|--------|----------------------|
| Logic & Flow | 7 | 8 | 8 | **8** |
| Functionality | 7 | 7 | 7 | **7** |
| UI/Visual Design | 7 | 7.1 | 7 | **7** |
| UX/Workflow | 7 | 7.5 | 6 | **7** |
| Architecture | 5 | 5.5 | 6 | **6** |
| **Weighted Average** | **6.6** | **7.0** | **6.8** | **7.0** |

### Consensus Rationale

- **Logic & Flow (8)**: All three AIs agree the 25-stage sequence is logically sound. Gemini and Claude both score 8; OpenAI's 7 doesn't identify specific flow problems, just suggests tightening.
- **Functionality (7)**: Unanimous. One confirmed bug (Stage 23) in 25 stages.
- **UI/Visual Design (7)**: Strong consensus. All renderers follow consistent visual patterns with dark mode support (3 minor gaps).
- **UX/Workflow (7)**: Split. Claude scores lower (6) due to naming mismatch impact; OpenAI and Gemini score higher (7, 7.5). Consensus: naming is bad but the actual user journey through stages is still understandable.
- **Architecture (6)**: Revised upward from OpenAI's 5 and Gemini's 5.5 because their two biggest concerns (Stage 10 size, legacy chunk names) are already fixed. Gate fragmentation and naming mismatches keep it from being higher.

## Key Consensus Findings (All Three AIs Agree)

1. **Stage 23 kill gate is broken** — must be fixed immediately
2. **Naming mismatches are pervasive** — 12+ stages have component names unrelated to their content
3. **Gate modeling needs standardization** — some gates are enforced, some are cosmetic
4. **The workflow concept is strong** — the 25-stage lifecycle is a credible venture methodology
5. **Architecture is the weakest dimension** — but for different reasons than the external AIs assumed

## Key Ground-Truth Corrections

1. **Stage 10 is 333 LOC, not 815** — already refactored
2. **Chunk names are already Vision V2** — not legacy
3. **6 shared components exist** — not zero
4. **Gate nomenclature fragmentation is worse than reported** — 8 variants, only visible with codebase access
5. **Stages 9, 12, 19, 20, 21, 24 have phantom gates** — render decision UI but aren't enforced
