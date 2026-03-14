# OpenAI Phase 2 Opinion — Group 4: THE_BLUEPRINT (Stages 13-16)

## Highest-Impact Findings
The biggest problem in Group 4 is not the content quality, it is semantic drift between names, config, and UI. The stage sequence itself is strong, but the implementation leaks legacy names badly enough to hurt developer trust, and in Stage 16 it is user-visible.

## Stage 13
| Dimension | Score |
|---|---:|
| Logic & Flow | 8 |
| Functionality | 7 |
| UI/Visual Design | 7 |
| UX/Workflow | 6 |
| Architecture | 5 |

Strengths:
- Good visual hierarchy: gate first, then vision, then summary metrics, then milestones/phases.
- Defensive data handling is solid; arrays are normalized before rendering.
- Milestone grouping by `now/next/later` makes roadmap data easy to scan.

Concerns:
- Naming mismatch is significant: `TechStackInterrogation` actually renders a product roadmap. Gap Importance `4`.
- Gate semantics are local and inconsistent with Stage 16. Gap Importance `3`.
- No explicit empty/loading state. Gap Importance `3`.

Recommendations:
- Rename to `Stage13ProductRoadmap.tsx` and update config.
- Extract gate banner into shared component.
- Reuse `StageEmptyState.tsx` when data is absent.

## Stage 14
| Dimension | Score |
|---|---:|
| Logic & Flow | 8 |
| Functionality | 8 |
| UI/Visual Design | 7 |
| UX/Workflow | 7 |
| Architecture | 6 |

Strengths:
- Best semantic fit in the group; adjacent to actual content.
- Layer ordering, security, entities, integrations create a coherent narrative.
- Defensive normalization is consistent and safe.

Concerns:
- Name still narrows the concept too much. Gap Importance `2`.
- Repeats advisory-details patterns instead of using shared primitives. Gap Importance `3`.
- Accessibility relies on color badges rather than textual cues. Gap Importance `2`.

Recommendations:
- Rename to `Stage14TechnicalArchitecture.tsx`.
- Pull shared "details panel" into reusable component.
- Add explicit empty states for sections.

## Stage 15
| Dimension | Score |
|---|---:|
| Logic & Flow | 7 |
| Functionality | 7 |
| UI/Visual Design | 7 |
| UX/Workflow | 6 |
| Architecture | 5 |

Strengths:
- Severity visualization is effective.
- Risk cards are information-rich without being unreadable.
- Fallback calculation for severity breakdown is good.

Concerns:
- Naming mismatch is severe: `EpicUserStoryBreakdown` renders a risk register. Gap Importance `4`.
- Budget status collapses nuance into "Aligned" or `—`. Gap Importance `3`.
- No explicit loading/empty state. Gap Importance `3`.

Recommendations:
- Rename to `Stage15RiskRegister.tsx`.
- Replace budget card with explicit states.
- Move currency formatting to shared utility.

## Stage 16
| Dimension | Score |
|---|---:|
| Logic & Flow | 7 |
| Functionality | 7 |
| UI/Visual Design | 8 |
| UX/Workflow | 5 |
| Architecture | 4 |

Strengths:
- Strongest individual screen in Group 4 from a presentation standpoint.
- Financial story is comprehensive.
- Advisory data extraction is defensive.

Concerns:
- `SchemaFirewall` is the worst mismatch — wrong concept is visible in the banner text. Gap Importance `5`.
- Gate nomenclature diverges from Stage 13. Gap Importance `4`.
- `formatCurrency` duplicated again. Gap Importance `3`.

Recommendations:
- Rename to `Stage16FinancialProjections.tsx` and fix banner label.
- Standardize gate values through shared type/enum.
- Move `formatCurrency` into shared utility.

## Group-Level Scores
| Dimension | Score |
|---|---:|
| Logic & Flow | 7 |
| Functionality | 7 |
| UI/Visual Design | 7 |
| UX/Workflow | 5 |
| Architecture | 5 |

## Cross-Stage Analysis
- Blueprint narrative coherence: `Roadmap -> Architecture -> Risks -> Financials` is a good strategic-planning arc.
- Naming mismatch pattern: legacy-generation problem where renderer shells kept old names while content shifted.
- Gate nomenclature fragmentation: Stage 13 and Stage 16 should not have separate vocabularies.
- Financial content placement: Stage 16 belongs in THE_BLUEPRINT as the integrated viability checkpoint.
- Content quality vs architecture: good UI does not offset bad semantics once the wrong name leaks into user-facing labels.

## The 3 Most Impactful Changes
1. Rename all 4 Group 4 renderer files and update config.
2. Create one shared gate model and banner component.
3. Add explicit empty/loading states to all four renderers.
