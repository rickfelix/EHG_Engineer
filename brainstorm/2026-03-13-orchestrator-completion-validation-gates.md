# Brainstorm: Orchestrator Completion Validation Gates

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed
- **Related Ventures**: None (internal protocol improvement)

---

## Problem Statement

SD-DISTILL-PIPELINE-CHAIRMAN-REVIEW-ORCH-001 completed with all gates passing despite its core feature (chairman interactive review via AskUserQuestion) never being wired into the pipeline. The module (`chairman-intake-review.js`) was built, unit-tested, and exported — but the pipeline entry point (`eva-intake-pipeline.js`) never imported or called it. The existing gate system validated artifacts (handoffs, PRDs, retrospectives, children marked complete) but never verified that the feature actually **works end-to-end**.

This is a class of bug where all individual components pass their tests but the system-level integration is broken. The current gate architecture has no mechanism to detect this.

## Discovery Summary

### Design Decisions (Chairman-Approved)
- **Failure mode**: Hard block — orchestrator CANNOT complete until all 4 gates pass
- **Scope**: ALL orchestrators (with justified skip for inapplicable SD types — e.g., wire check returns passed with "no new modules — documentation SD")
- **Smoke test source**: PRD declares `smoke_test_cmd` field; gate runs it at completion
- **Acceptance criteria source**: Vision doc `## Success Criteria` section
- **Wire check depth**: Full AST call graph — parse code structure to verify functions are reachable from entry point at runtime. Requires `acorn` or similar parser.
- **UAT mode**: Fully automated — script exercises user journey, no human input
- **Rollout**: All gates ship simultaneously (no graduated rollout)

### Existing Infrastructure to Leverage
- `smoke-test-runner.mjs` — already reads `smoke_test_steps` and runs them
- `pipeline-flow-verifier.js` — does import/export tracing (but missed the distill case because it's advisory-only)
- `scenario-generator.js` — generates Given/When/Then scenarios from user stories
- `OrchestratorCompletionGuardian` — validation point that expects `{ passed, score, max_score, issues }` return shape
- `validation_gate_registry` + `gate-policy-resolver.js` — per-type applicability rules
- `verifyPipelineFlow` — existing advisory check that logs warnings but never blocks

## Analysis

### Arguments For
1. **Prevents the exact class of bug we just found** — dead code passing all gates while the feature is unwired
2. **Leverages mature gate infrastructure** — `validation_gate_registry`, `gate-policy-resolver.js`, weighted scoring all exist
3. **Creates self-certifying completions** — an orchestrator that passes all 4 gates genuinely works end-to-end
4. **Enables higher autonomy** — trustworthy completions mean AUTO-PROCEED can chain without pause at orchestrator boundaries

### Arguments Against
1. **Gate 3 (wire check) is unprecedented** — no existing gate does AST analysis; introduces a new failure category with `acorn` dependency
2. **False positive risk on non-code SDs** — documentation, database-only, protocol SDs need justified skips
3. **Existing advisory checks partially cover this** — `verifyPipelineFlow` and `runCompletenessAudit` exist but are advisory-only and missed the failure
4. **All-at-once rollout is riskier** — but chairman chose this explicitly over graduated rollout

### Protocol Domain: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 8/10 | High current friction (dead features require manual discovery + corrective SDs). Affects all orchestrators. |
| Value Addition | 9/10 | Direct: prevents wasted downstream work. Compound: enables trusted autonomous chaining, feeds EVA quality scoring. |
| Risk Profile | 5/10 | Breaking change: medium (in-flight orchestrators). Regression: low (gates are additive). |
| **Decision** | **(8+9) > (5*2)** | **Implement** |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Existing advisory checks (`verifyPipelineFlow`, `runCompletenessAudit`) already partially do this — why were they ignored? (2) Vision docs are freeform text with no guaranteed parseable structure. (3) "Fully automated UAT" assumes deterministic user journeys exist for all SD types.
- **Assumptions at Risk**: (1) Hard block on ALL orchestrators assumes near-zero false positives on day one. (2) PRDs won't have `smoke_test_cmd` until the habit is established. (3) Static import chain analysis may not distinguish "imported and called" from "imported and dead."
- **Worst Case**: Gate false positives gridlock the entire AUTO-PROCEED pipeline; team adds `--skip-gates` bypass flags, reproducing the exact situation with more complexity.

### Visionary
- **Opportunities**: (1) Self-healing pipeline — gate failures map to deterministic corrective actions, enabling auto-fix. (2) PRD as executable contract — `smoke_test_cmd` seeds "PRD-as-code" paradigm. (3) Vision doc as single source of truth for done-ness — chairman intent governs completion.
- **Synergies**: Orchestrator Scope Governance (enforcement arm), Pipeline Flow Verifier (extend existing), EVA Translation Fidelity Gate (coverage score input), Dead Code Scanner (dead export signal), OrchestratorCompletionGuardian (integration point).
- **Upside Scenario**: Zero orchestrators complete with unwired features. Protocol becomes self-certifying. Chairman reviews results asynchronously rather than supervising transitions.

### Pragmatist
- **Feasibility**: 7/10 overall. Gate 1 (smoke test): 4/10 difficulty. Gate 2 (acceptance traceability): 6/10. Gate 3 (wire check): 8/10. Gate 4 (UAT): 7/10.
- **Resource Requirements**: 3-4 full SDs, ~2-3 weeks. Gate 3 may need `acorn` or `es-module-lexer` dependency.
- **Constraints**: (1) Non-code SDs need justified skips via `validation_gate_registry`. (2) Vision success criteria are unstructured — need schema enrichment or heuristic matching. (3) Wire check introduces static analysis as a new capability category with high blast radius if buggy.
- **Recommended Path**: Start with Gate 1 (80% built), but chairman chose all-at-once.

### Synthesis
- **Consensus Points**: Gate 3 is hardest/riskiest; non-code SDs need special handling; existing infrastructure should be leveraged
- **Tension Points**: Challenger says promote existing advisory checks vs. building new; Visionary says new gates create a new capability category
- **Composite Risk**: Medium

## Open Questions
- How does Gate 3 handle dynamic imports (`await import(...)`) and barrel files?
- What happens to the ~20 in-flight orchestrators when these gates activate?
- Should Gate 2 use structured tagging in vision criteria or heuristic matching against test files?

## Suggested Next Steps
- Create orchestrator SD with 4 children (one per gate)
- Gate 1: smoke test cmd in PRD + gate runner
- Gate 2: vision success criteria parser + test mapping
- Gate 3: AST-based call graph reachability analysis
- Gate 4: automated UAT scenario execution
