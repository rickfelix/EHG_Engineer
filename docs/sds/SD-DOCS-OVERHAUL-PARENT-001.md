# Strategic Directive: Documentation Overhaul Initiative (PARENT)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-23
- **Tags**: database, api, migration, feature

## SD Metadata
- **SD Key**: SD-DOCS-OVERHAUL-PARENT-001
- **Title**: Documentation Overhaul - Master Orchestrator
- **Type**: PARENT (Orchestrator)
- **Status**: Draft
- **Created**: 2025-12-23
- **Priority**: High
- **Complexity**: High

## Overview

This is a PARENT Strategic Directive that orchestrates a comprehensive documentation overhaul for the EHG ecosystem. This is NOT just cleanup—it's a complete restructuring to create documentation that is well-organized, well-structured, thorough, validated against actual code, and captures important observations during the process.

## Current State Assessment

### Documentation Landscape
- **EHG_Engineer/docs**: ~1,715 markdown files, 23MB total
- **EHG/docs**: ~273 markdown files, 2.7MB total
- **Total Documentation Footprint**: ~1,988 files across both repos

### Major Issues Identified

1. **Outdated Workflow References**
   - Multiple files reference legacy "40-stage workflow"
   - Should be updated to current "25-stage Venture Vision v2.0"
   - Found in: ADR-002, 02_api/README.md, 04_features/README.md

2. **Structural Inconsistencies**
   - Mix of numbered (01-06) and unnumbered directories
   - Inconsistent naming conventions (kebab-case vs snake_case)
   - Multiple "archive" and "temp" directories with unclear purposes

3. **Missing Validation**
   - Documentation claims not verified against actual code
   - No validation framework in place
   - Risk of documentation drift from reality

4. **No Observations System**
   - Important findings during documentation work get lost
   - No structured way to capture insights and discrepancies
   - Missing knowledge capture mechanism

5. **Incomplete Coverage**
   - API documentation incomplete (only stage-based, no comprehensive reference)
   - LEO Protocol v4.3.3 not fully documented
   - Missing developer onboarding guides
   - Architecture documentation scattered

## Initiative Goals

### Primary Objectives
1. **Well Organized**: Clear hierarchy, logical grouping, easy navigation
2. **Well Structured**: Consistent formatting, templates, information architecture
3. **Thorough**: Complete coverage of systems, features, workflows, APIs
4. **Validated**: Documentation claims verified against actual code/systems
5. **Observable**: Important findings and observations captured systematically

### Success Metrics
- 95%+ of documentation in correct locations
- 100% of documentation with required metadata headers
- 0 broken cross-references
- 0 references to outdated "40-stage" workflow
- 100% of API endpoints documented with validation
- All observations captured in structured format
- Documentation health score >90%

## Child Strategic Directives

This parent SD orchestrates the following child SDs in dependency order:

### Phase 1: Foundation (Must Complete First)
1. **SD-DOCS-ARCH-001**: Information Architecture Design
2. **SD-DOCS-OBSERVE-001**: Observations & Findings System
3. **SD-DOCS-VALIDATE-001**: Documentation Validation Framework

### Phase 2: Content Overhaul (Depends on Phase 1)
4. **SD-DOCS-WORKFLOW-001**: 25-Stage Workflow Documentation
5. **SD-DOCS-LEO-001**: LEO Protocol v4.3.3 Documentation
6. **SD-DOCS-API-001**: API Documentation Overhaul

### Phase 3: Supporting Documentation (Depends on Phase 1-2)
7. **SD-DOCS-DEV-001**: Developer Guides & Onboarding
8. **SD-DOCS-ARCH-002**: Architecture Documentation
9. **SD-DOCS-TEMPLATE-001**: Template Standardization

### Phase 4: Cleanup & Polish (Depends on All Above)
10. **SD-DOCS-CLEANUP-001**: Cleanup & Consolidation

## Dependency Graph

```
SD-DOCS-OVERHAUL-PARENT-001 (This SD)
│
├─ PHASE 1: Foundation
│  ├─ SD-DOCS-ARCH-001 (Info Architecture) ────┐
│  ├─ SD-DOCS-OBSERVE-001 (Observations) ──────┤
│  └─ SD-DOCS-VALIDATE-001 (Validation) ───────┤
│                                               │
├─ PHASE 2: Content Overhaul                    │
│  ├─ SD-DOCS-WORKFLOW-001 (25-Stage) ─────────┤
│  ├─ SD-DOCS-LEO-001 (LEO Protocol) ──────────┤
│  └─ SD-DOCS-API-001 (API Docs) ──────────────┤
│                                               │
├─ PHASE 3: Supporting Docs                     │
│  ├─ SD-DOCS-DEV-001 (Developer Guides) ──────┤
│  ├─ SD-DOCS-ARCH-002 (Architecture) ─────────┤
│  └─ SD-DOCS-TEMPLATE-001 (Templates) ────────┤
│                                               │
└─ PHASE 4: Cleanup                             │
   └─ SD-DOCS-CLEANUP-001 ──────────────────────┘
      (depends on ALL above)
```

## Scope

### In Scope
- All markdown documentation in EHG and EHG_Engineer repos
- CLAUDE.md and CLAUDE_*.md instruction files
- README files throughout codebase
- API documentation and specifications
- Architecture decision records (ADRs)
- Developer guides and onboarding materials
- LEO Protocol documentation
- Workflow and process documentation
- Template creation and standardization
- Documentation validation framework
- Observations capture system

### Out of Scope
- Code comments (inline documentation)
- Auto-generated API docs from code (e.g., JSDoc)
- External documentation (e.g., third-party integrations)
- Migration of documentation to wiki or external platform
- Translation/internationalization
- Video or multimedia documentation

## Rationale

### Why This Matters

1. **Knowledge Preservation**: With ~2,000 documentation files, undocumented or poorly documented features become lost knowledge
2. **Developer Onboarding**: New contributors need clear, accurate documentation
3. **System Evolution**: As system moves from 40-stage to 25-stage workflow, docs must reflect reality
4. **Quality Assurance**: Validated documentation prevents "documentation drift" from actual implementation
5. **Pattern Recognition**: Observations system captures insights that inform future work
6. **Efficiency**: Well-organized docs reduce time searching for information

### Business Impact
- **Reduced Onboarding Time**: New developers productive faster
- **Lower Maintenance Costs**: Accurate docs reduce support burden
- **Better Decision Making**: Observations inform strategic decisions
- **Quality Improvements**: Validation catches implementation-documentation gaps

## Acceptance Criteria

### Parent SD Completion Criteria
- [ ] All 10 child SDs created in database
- [ ] All child SDs have clear dependencies defined
- [ ] All child SDs have acceptance criteria
- [ ] All child SDs assigned to appropriate owners
- [ ] Orchestration timeline created
- [ ] Success metrics dashboard created
- [ ] Weekly status reporting established

### Overall Initiative Success Criteria
- [ ] All child SDs completed successfully
- [ ] Documentation health score ≥90%
- [ ] Zero broken cross-references
- [ ] Zero "40-stage" references (all updated to "25-stage")
- [ ] 100% of API endpoints documented and validated
- [ ] Observations system in use with ≥50 entries
- [ ] Documentation standards enforced via automation
- [ ] Developer feedback score ≥4.5/5

## Estimated Complexity

**Overall Complexity**: High

### Complexity Factors
- **Scale**: ~2,000 files across 2 repositories
- **Coordination**: 10 child SDs with complex dependencies
- **Validation**: Requires code analysis for accuracy verification
- **Architecture**: New systems needed (observations, validation)
- **Impact**: Affects all developers and documentation consumers

### Time Estimate
- **Phase 1**: 2-3 weeks (foundation)
- **Phase 2**: 3-4 weeks (content overhaul)
- **Phase 3**: 2-3 weeks (supporting docs)
- **Phase 4**: 1-2 weeks (cleanup)
- **Total**: 8-12 weeks (with parallel work possible)

## Risks & Mitigations

### Risk 1: Scope Creep
- **Impact**: High
- **Probability**: Medium
- **Mitigation**: Strict scope boundaries in each child SD, weekly reviews

### Risk 2: Documentation Drift During Initiative
- **Impact**: Medium
- **Probability**: High
- **Mitigation**: Implement validation framework early (Phase 1), continuous validation

### Risk 3: Coordination Overhead
- **Impact**: Medium
- **Probability**: Medium
- **Mitigation**: Clear dependency graph, automated status tracking

### Risk 4: Incomplete Validation
- **Impact**: High
- **Probability**: Medium
- **Mitigation**: Validation framework as Phase 1 deliverable, mandatory checks

## Validation Requirements

As a PARENT SD, validation includes:

1. **Child SD Coverage**: All documentation areas covered by child SDs
2. **Dependency Correctness**: No circular dependencies, clear execution order
3. **Resource Allocation**: Each child SD has owner and timeline
4. **Success Criteria**: Parent criteria encompass all child criteria
5. **Metrics Tracking**: Dashboard shows progress across all children

## Related Documentation

- **Current Standards**: `/docs/DOCUMENTATION_STANDARDS.md`
- **Directory Structure**: `/docs/DIRECTORY_STRUCTURE.md`
- **LEO Protocol**: `/CLAUDE.md` (v4.3.3)
- **Architecture**: `/docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md`

## Next Steps

1. Review and approve this PARENT SD
2. Create all 10 child SDs in database
3. Assign owners to each child SD
4. Create orchestration timeline
5. Set up metrics dashboard
6. Begin Phase 1 (Foundation) SDs

## Notes

- This is a DATABASE-FIRST initiative - all SDs must be in `strategic_directives_v2` table
- All documentation findings must be captured in observations system (built in Phase 1)
- Validation framework (Phase 1) is critical dependency for all content work
- Weekly syncs required to coordinate across child SDs

---

**Last Updated**: 2025-12-23
**Author**: DOCMON Information Architecture Lead
**Status**: Awaiting LEAD Approval
