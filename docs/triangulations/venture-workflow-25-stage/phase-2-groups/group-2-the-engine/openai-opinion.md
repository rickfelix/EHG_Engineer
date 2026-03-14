# OpenAI Phase 2 Opinion — Group 2: THE_ENGINE (Stages 6-9)

## Scope
The prompt is partially stale against the current repo. The referenced UI files like `Stage6RiskEvaluation.tsx`, `Stage7RevenueArchitecture.tsx`, `Stage8BusinessModelCanvas.tsx`, and `Stage9ExitStrategy.tsx` are not present in the workspace. Analysis executed against the current Phase 2 implementation in `lib/eva/stage-templates/`, `lib/eva/reality-gates.js`, `lib/eva/eva-orchestrator.js`, and `docs/guides/workflow/cli-venture-lifecycle/stages/phase-02-the-engine.md`.

21 failures out of 84 assertions were found, confirming several concerns are real regressions.

## Key Evidence
Stage 7 says derived metrics are handled elsewhere, but its runtime fallback does nothing:

```
computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
```

Stage 7 analysis step does not return `ltv`, `cac_ltv_ratio`, `payback_months`, `warnings`, or `positioningDecision` — fields Stage 9 expects.

Stage 9's local gate depends on `ltv` and `payback_months` from Stage 7:

```
  if (stage07?.ltv === null || stage07?.ltv === undefined) {
    blockers.push('LTV not computed (likely zero churn rate)');
    required_next_actions.push('Set a non-zero monthly churn rate to compute LTV');
  }
```

There is a real enforced `9->10` system gate (artifact/quality based), separate from the local Stage 9 data-completeness gate.

Stage 8 can auto-fill placeholders, weakening trust in "complete" BMC output.

## Per-Stage Analysis

### Stage 6
| Dimension | Score |
|-----------|------:|
| Logic & Flow | 8 |
| Functionality | 7 |
| UI/Visual Design | 4 |
| UX/Workflow | 6 |
| Architecture | 7 |

Top 3 strengths:
- Strong schema and validation model.
- Good upstream grounding from Stages 1, 3, 4, and 5.
- Aggregate metrics like normalized score and category coverage make downstream use practical.

Top 3 concerns:
- Risk-count mismatch: Stage 6 generation targets `8` risks, but Stage 9 promotion requires `10`. Gap Importance: `4`.
- `computeDerived()` is effectively dead. Gap Importance: `3`.
- The prompt's table/row-expansion/mobile claims cannot be validated because the Stage 6 TSX renderer is missing. Gap Importance: `3`.

Top 3 recommendations:
- Align Stage 6 minimum successful output with the Stage 9 promotion threshold.
- Remove or restore `computeDerived()` as a real runtime contract.
- Split GUI audit prompts from backend template audits so future reviews are grounded in the actual code.

### Stage 7
| Dimension | Score |
|-----------|------:|
| Logic & Flow | 7 |
| Functionality | 3 |
| UI/Visual Design | 4 |
| UX/Workflow | 4 |
| Architecture | 3 |

Top 3 strengths:
- Validation coverage for tiers, billing periods, and bounds is good.
- The analysis step uses competitive, financial, and risk context well.
- Optional web-grounding is a useful enrichment path.

Top 3 concerns:
- Stage 7 runtime output is missing `ltv`, `cac_ltv_ratio`, `payback_months`, `warnings`, and `positioningDecision`. Gap Importance: `5`.
- Confirmed by tests: Stage 7 focused unit tests fail heavily on derived economics. Gap Importance: `5`.
- Substantial contract drift across template, analysis step, docs, and tests. Gap Importance: `4`.

Top 3 recommendations:
- Make Stage 7 emit the derived metrics in the actual execution path.
- Choose one canonical output shape and update docs/tests to match.
- Add an integration test that Stage 9 receives populated Stage 7 gate fields.

### Stage 8
| Dimension | Score |
|-----------|------:|
| Logic & Flow | 7 |
| Functionality | 6 |
| UI/Visual Design | 5 |
| UX/Workflow | 5 |
| Architecture | 5 |

Top 3 strengths:
- Strong enforcement of the 9-block BMC structure.
- Good upstream context usage from pricing, risk, finance, and market inputs.
- Financial consistency validation is a strong architectural safeguard.

Top 3 concerns:
- Placeholder autofill can make incomplete canvases look artificially complete. Gap Importance: `4`.
- Stage 9 only checks that blocks are populated, not that they are evidence-backed or non-placeholder. Gap Importance: `4`.
- The prompt's CSS grid / mobile fallback / visual canvas claims cannot be validated. Gap Importance: `3`.

Top 3 recommendations:
- Mark placeholder items explicitly and fail promotion if placeholders remain.
- Add evidence-quality checks, not just non-empty arrays.
- Treat Stage 8 "complete" as a semantic threshold, not a shape-only threshold.

### Stage 9
| Dimension | Score |
|-----------|------:|
| Logic & Flow | 6 |
| Functionality | 3 |
| UI/Visual Design | 4 |
| UX/Workflow | 3 |
| Architecture | 4 |

Top 3 strengths:
- `evaluateRealityGate()` is easy to read and clearly expresses intended business rules.
- Stage 9 properly consumes cross-stage context from Stages 6-8.
- The broader orchestrator does enforce a real `9->10` boundary.

Top 3 concerns:
- `computeDerived()` is dead, but docs/tests still expect it to attach a `reality_gate`. Gap Importance: `5`.
- Two different Phase 2 gate concepts create false trust. Gap Importance: `5`.
- Stage 7 does not provide required derived metrics, so local Stage 9 gate is effectively fail-closed. Gap Importance: `5`.

Top 3 recommendations:
- Make one authoritative Phase 2 promotion gate.
- If the local Stage 9 gate matters, enforce and persist it in orchestration.
- Rewrite docs to distinguish artifact gate, data gate, and chairman/manual checkpoints.

## Group-Level Scores
| Dimension | Score |
|-----------|------:|
| Logic & Flow | 7 |
| Functionality | 4 |
| UI/Visual Design | 4 |
| UX/Workflow | 4 |
| Architecture | 5 |

## Cross-Stage Analysis
- Business model coherence: `Risk -> Revenue -> BMC -> Exit` is still the right sequence.
- Pattern consistency: Moderate in template structure, weak across docs/tests/runtime behavior.
- Information flow: Intended flow is strong, but Stage 7 -> Stage 9 contract is currently broken.
- Stage 9 phantom gate: Not purely phantom. A real `9->10` gate exists, but it is an artifact-quality gate, not the local Stage 9 completeness gate. The prompt conflates the two.
- Code duplication: Bigger issue is repeated dead `computeDerived()` patterns and contract drift.
- No-gate philosophy: Keeping Stages 6-8 artifact-only is reasonable. The problem is unclear authoritative gate semantics at Stage 9.

## The 3 Most Impactful Changes
1. Repair the Stage 7 -> Stage 9 runtime contract so Stage 7 actually emits the derived economics that Stage 9 requires.
2. Unify Phase 2 promotion logic so there is one clearly documented and enforced gate model.
3. Tighten completion quality by removing Stage 8 placeholder pass-through and aligning Stage 6 risk generation thresholds with Stage 9 promotion rules.
