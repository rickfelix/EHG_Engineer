# Brainstorm: Systemic Audit Findings Remediation

## Metadata
- **Date**: 2026-03-04
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (findings already fully characterized across 25 audits)
- **Related Ventures**: All EVA ventures (pipeline infrastructure)

---

## Problem Statement
After auditing all 25 EVA stage templates and their analysis steps (PRs #1747-#1772), a deferred findings tracker accumulated 9 categories of systemic issues. The top-priority items per stage were fixed during each audit, but recurring cross-cutting patterns were intentionally deferred for batch remediation. These affect security, code quality, contract integrity, and data reliability across the venture evaluation pipeline.

## Discovery Summary

### Full Audit Trail
- **26 PRs** shipped (Stages 0-25), **192+ E2E tests** added (Stages 22-25 alone: 263 tests)
- **Fixed during audits**: outputSchema (17 stages), field casing (12 stages), stale refs (11 stage transitions), gate rescue (5 stages), DRY documentation (16 stages), llmFallbackCount (7 stages)
- **Deferred**: 9 systemic categories with ~60 individual findings

### Systemic Issue Inventory

| # | Category | Stages | Severity | Est. LOC |
|---|----------|--------|----------|----------|
| 1 | Prompt injection — Stage 1 data interpolated raw into LLM prompts | 2-16 | Medium | ~200 |
| 2 | `computeDerived` dead code — entire function body unreachable | 3-25 | Low-High | ~500 |
| 3 | YAML contract `consumes` under-specified | 5-16 | Medium | ~50 |
| 4 | Silent fallback defaults — `clamp()`/`ensurePositive()` no logging | 3,5,6,7,8,9 | Low-Med | ~60 |
| 5 | Web search year hardcoded "2024 2025" | 4,5,7 | Low | ~15 |
| 6 | Empty/stub schema fields never populated | 2,3,5 | Low | ~30 |
| 7 | Contract field mismatches (unused, missing, mixed casing) | 2,3,5,9,16 | Low-Med | ~40 |
| 8 | GUI field mismatch — Stage 6 frontend != backend | 6 | Medium | ~30 |
| 9 | EVIDENCE_MAP missing 2/7 personas | 2 | Medium | ~10 |

**Total: ~935 estimated LOC**

## Analysis

### Arguments For Batch Remediation
- All findings are fully characterized with exact file locations and fix patterns
- No discovery work needed — pure execution
- Security issues (#1) have been open since early audits; batching accelerates resolution
- Dead code removal (#2) reduces cognitive load for all future maintenance
- YAML contract fixes (#3) make the contract system trustworthy for dependency tracking

### Arguments Against
- SD-B is large (~605 LOC) touching 23+ files — risk of merge conflicts if other work is in flight
- YAML contract fixes could trigger validation errors if contract system validates `consumes` at runtime
- GUI mismatch (#8) crosses repos (EHG_Engineer backend + EHG frontend)
- Some "Low" severity items (stubs, DRY) provide minimal runtime benefit

## Recommended SD Structure

### SD-A: EVA Prompt Injection Sanitization
**Type**: Security hardening
**Scope**: Stages 2-16 analysis steps
**Approach**: Create `lib/eva/utils/sanitize-for-prompt.js` utility that:
- Strips control characters and prompt injection patterns
- Truncates to reasonable length (500 chars per field)
- Wraps interpolated values in delimiters (`[USER_INPUT]...[/USER_INPUT]`)
- Apply to all `stage01Data` field interpolation points in analysis steps
**Files**: 15 analysis steps + 1 new utility + 1 test
**Est LOC**: ~200
**Dependencies**: None
**Risk**: Low (additive, wraps existing strings)

### SD-B: EVA Dead Code & Silent Defaults Cleanup
**Type**: Code quality
**Scope**: All stages
**Approach**:
- **computeDerived**: Strip function bodies, keep signature for contract compliance. All business logic already rescued to analysis steps.
- **Silent fallbacks**: Add `logger.warn()` to `clamp()`, `clampScore()`, `ensurePositive()` when fallback triggers
- **Hardcoded year**: Replace "2024 2025" with `new Date().getFullYear()` in stages 4, 5, 7
- **Stub fields**: Remove `suggestions` (Stage 2), `scenarioAnalysis` (Stage 5) from schema. Evaluate `competitorEntities` (Stage 3).
**Files**: ~25 stage templates + 6 analysis steps + 3 analysis steps (year) + 3 templates (stubs)
**Est LOC**: ~605 (largest SD, may need 2-3 PRs)
**Dependencies**: None (all gates already rescued)
**Risk**: Medium (many files, but changes are deletions + logging additions)

### SD-C: EVA Contract & Schema Integrity
**Type**: Contract alignment
**Scope**: YAML + templates + frontend
**Approach**:
- **YAML consumes**: Update `stage-contracts.yaml` for 11 stages to list actual upstream dependencies
- **Unused consumed fields**: Remove `archetype`/`keyAssumptions` from Stage 2 consume contract or populate them
- **Output-not-in-schema**: Add `roiBands` to Stage 5 schema, add `valuationEstimate` to Stage 9 schema
- **Mixed casing**: Normalize Stage 16 schema to consistent snake_case
- **EVIDENCE_MAP**: Add growth-hacker + revenue-analyst to Stage 2
- **GUI alignment**: Update Stage 6 frontend in EHG repo to match backend field names/enums
**Files**: 1 YAML + ~5 templates + ~2 analysis steps + EHG frontend (cross-repo)
**Est LOC**: ~130
**Dependencies**: Should run after SD-B to avoid merge conflicts on shared files
**Risk**: Low-Medium (YAML changes, cross-repo coordination for GUI)

## Execution Order
1. **SD-A** (security) and **SD-B** (cleanup) can run in parallel — no overlapping files
2. **SD-C** (contracts) runs after SD-B completes — shared files in templates
3. GUI alignment in SD-C requires coordinated commit to `rickfelix/ehg`

## Open Questions
- Should `computeDerived` bodies be fully deleted or replaced with a `throw new Error('Dead code')` sentinel?
- Should YAML contract validation be enforced at runtime (currently informational only)?
- Stage 6 GUI fix: coordinate with any in-flight Chairman UI work?

## Suggested Next Steps
- Create SD-A, SD-B, SD-C via `/leo create`
- Execute SD-A and SD-B in parallel
- Execute SD-C after SD-B merges
- Update deferred tracker to mark all items as resolved with SD references
