# User Stories Summary: SD-FOUNDATION-V3-006


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, e2e

**Strategic Directive**: 25-Stage Crew Mapping Completion
**PRD ID**: PRD-SD-FOUNDATION-V3-006
**Date**: 2025-12-17
**Total Stories**: 8
**Total Story Points**: 44

## Executive Summary

This document summarizes the 8 user stories created for SD-FOUNDATION-V3-006, which extends the STAGE_CREW_MAP in `evaTaskContracts.ts` to support all 25 venture lifecycle stages. Currently, only stages 1-6 have crew mappings, blocking ventures from progressing beyond stage 6.

The user stories follow INVEST criteria and include comprehensive acceptance criteria in Given-When-Then format, implementation context, architecture references, and code examples.

---

## Story Breakdown by Phase

### THE_ENGINE Phase (Stages 7-9)

#### US-001: Define Crew Types for THE_ENGINE Phase (Stages 7-9)
- **Priority**: CRITICAL
- **Story Points**: 5
- **Crew Types**:
  - `BUSINESS_MODEL` (Stage 7) - Revenue model design and validation
  - `TECHNICAL_VALIDATION` (Stage 8) - Technical feasibility assessment
  - `OPERATIONS_DESIGN` (Stage 9) - Operational process design
- **Key Deliverables**:
  - CREW_REGISTRY entries for all three crews
  - TypeScript compilation success
  - Unit tests for getCrewConfig()

---

### THE_IDENTITY Phase (Stages 10-13)

#### US-002: Define Crew Types for THE_IDENTITY Phase (Stages 10-13)
- **Priority**: CRITICAL
- **Story Points**: 5
- **Crew Types**:
  - `BRAND_DEVELOPMENT` (Stages 10-11) - Brand identity creation and guidelines
  - `MARKET_POSITIONING` (Stages 12-13) - Market analysis and competitive positioning
- **Key Features**:
  - Parallel execution support (stages 10-11 can run concurrently, 12-13 can run concurrently)
  - Multi-stage crew assignments
- **Key Deliverables**:
  - CREW_REGISTRY entries for both crews
  - Co-execution pattern documentation

---

### THE_BLUEPRINT Phase (Stages 14-18)

#### US-003: Define Crew Types for THE_BLUEPRINT Phase (Stages 14-18)
- **Priority**: CRITICAL
- **Story Points**: 8
- **Crew Types**:
  - `PRODUCT_DESIGN` (Stages 14-15) - Product design and UX specification
  - `ENGINEERING_SPEC` (Stages 16-17) - Technical specification and API design
  - `ARCHITECTURE` (Stage 18) - System architecture design and infrastructure planning
- **Key Features**:
  - Sequential workflow (Design → Spec → Architecture)
  - Input/output dependencies documented
  - No parallel execution (dependencies prevent it)
- **Key Deliverables**:
  - CREW_REGISTRY entries for all three crews
  - Sequential dependency documentation
  - Input/output mapping

---

### THE_BUILD_LOOP Phase (Stages 19-23)

#### US-004: Define Crew Types for THE_BUILD_LOOP Phase (Stages 19-23)
- **Priority**: CRITICAL
- **Story Points**: 8
- **Crew Types**:
  - `DEVELOPMENT` (Stages 19-20) - Code implementation and feature development
  - `QA_VALIDATION` (Stages 21-22) - Quality assurance and testing validation
  - `DEPLOYMENT` (Stage 23) - Deployment automation and release management
- **Key Features**:
  - Iterative loop pattern (Dev → QA → Deploy → repeat)
  - Loop-back patterns on failures (QA failure → Dev, Deploy failure → QA)
  - Iteration tracking support
- **Key Deliverables**:
  - CREW_REGISTRY entries for all three crews
  - Loop-back failure patterns documented
  - Iteration tracking logic

---

### LAUNCH_LEARN Phase (Stages 24-25)

#### US-005: Define Crew Types for LAUNCH_LEARN Phase (Stages 24-25)
- **Priority**: CRITICAL
- **Story Points**: 5
- **Crew Types**:
  - `LAUNCH_PREP` (Stage 24) - Launch readiness and go-to-market execution
  - `MONITORING_ITERATION` (Stage 25) - Post-launch monitoring and continuous improvement
- **Key Features**:
  - Final phase before ongoing operations
  - Stage 25 is continuous/ongoing (never truly "completes")
- **Key Deliverables**:
  - CREW_REGISTRY entries for both crews
  - Ongoing stage documentation

---

### Integration Stories

#### US-006: Extend STAGE_CREW_MAP for All 25 Stages
- **Priority**: CRITICAL
- **Story Points**: 5
- **Scope**: Central routing table update
- **Key Features**:
  - Maps all stages 7-25 to appropriate crews
  - Multi-stage crew assignments (e.g., BRAND_DEVELOPMENT handles both 10 and 11)
  - Validation function to ensure completeness
- **Key Deliverables**:
  - STAGE_CREW_MAP with all 25 entries
  - validateStageCrewMap() function
  - Integration tests for getCrewForStage()
- **E2E Test**: `tests/e2e/SD-FOUNDATION-V3-006-US-006-stage-crew-map.spec.ts`

#### US-007: Add Co-Execution Patterns to STAGE_CO_EXECUTION_MAP
- **Priority**: HIGH
- **Story Points**: 3
- **Scope**: Parallel execution optimization
- **Key Features**:
  - Identifies stages where parallel execution is safe
  - Documents resource requirements for parallel work
  - Warns about sequential dependencies
- **Key Deliverables**:
  - STAGE_CO_EXECUTION_MAP with parallel patterns
  - Resource requirement documentation
  - Sequential enforcement for BLUEPRINT and BUILD_LOOP phases

#### US-008: Integration Tests for Stages 7-25 Dispatch
- **Priority**: HIGH
- **Story Points**: 5
- **Scope**: Comprehensive test coverage
- **Key Features**:
  - Unit tests for getCrewForStage() (all 25 stages)
  - Integration tests for dispatchStageTask() (stages 7-25)
  - Full lifecycle test (1 → 25)
  - Edge case handling (invalid stage numbers)
- **Key Deliverables**:
  - Unit test suite for crew configs
  - Integration test suite for dispatch logic
  - Full lifecycle progression test
  - ≥90% code coverage on new code
- **E2E Test**: `tests/e2e/SD-FOUNDATION-V3-006-US-008-integration-tests.spec.ts`

---

## INVEST Criteria Compliance

All user stories comply with INVEST criteria:

### Independent
- Each story can be developed independently
- US-001 through US-005 define distinct crew sets per phase
- US-006, US-007, US-008 depend on US-001 through US-005 but are independent of each other

### Negotiable
- Story points are estimates, can be adjusted
- Implementation approach is flexible
- Parallel execution patterns can be refined based on learning

### Valuable
- **Business Value**: Enables ventures to progress through all 25 stages (currently blocked at stage 6)
- **User Benefit**: Clear crew assignments reduce confusion and improve task dispatch
- **System Value**: Completes 25-stage protocol implementation

### Estimable
- All stories have story points (range: 3-8)
- Total: 44 story points
- Average: 5.5 points per story

### Small
- All stories are ≤8 points (within one sprint)
- US-003 and US-004 are largest at 8 points (complex phases with 3-5 stages each)
- Smallest story is US-007 at 3 points

### Testable
- All stories have comprehensive acceptance criteria in Given-When-Then format
- Test scenarios specified (unit, integration, E2E)
- US-008 explicitly focused on test coverage
- E2E test paths specified where applicable

---

## Acceptance Criteria Format

All stories use structured acceptance criteria with:
- **id**: Unique identifier (AC-XXX-Y)
- **scenario**: Descriptive name (Happy path, Error path, Edge case)
- **given**: Preconditions
- **when**: Action/trigger
- **then**: Expected outcome

Example from US-001:
```json
{
  "id": "AC-001-1",
  "scenario": "Happy path - BUSINESS_MODEL crew definition",
  "given": "CREW_REGISTRY in evaTaskContracts.ts is being extended",
  "when": "BUSINESS_MODEL crew config is added",
  "then": "Config includes crew_id \"BUSINESS_MODEL\", responsibility \"Revenue model design and validation\", capabilities [\"business_planning\", \"financial_modeling\", \"revenue_strategy\"], and required_agents [\"business_analyst\", \"financial_planner\"]"
}
```

---

## Implementation Context

All stories include:

### Architecture References
- Primary file: `lib/evaTaskContracts.ts` (CREW_REGISTRY, STAGE_CREW_MAP constants)
- Database: `venture_stages` table (stage metadata)
- Tests: `tests/integration/`, `tests/e2e/`
- Documentation: `docs/25-stage-protocol.md`

### Example Code Patterns
Each story includes detailed code examples:
- US-001 through US-005: Crew config examples with full field definitions
- US-006: STAGE_CREW_MAP extension pattern with validation function
- US-007: STAGE_CO_EXECUTION_MAP with parallel execution patterns
- US-008: Integration test templates for getCrewForStage() and dispatchStageTask()

### Test Scenarios
All stories include test scenarios with:
- Type (unit, integration, E2E)
- Priority (P0, P1, P2)
- Scenario description

---

## Story Dependencies

### Dependency Chain
```
US-001, US-002, US-003, US-004, US-005 (Crew Definitions)
    ↓
US-006 (STAGE_CREW_MAP Extension)
    ↓
US-007 (Co-Execution Patterns)
    ↓
US-008 (Integration Tests)
```

### Parallel Development Opportunities
- US-001 through US-005 can be developed in parallel (independent phases)
- US-006 requires all crew definitions complete
- US-007 can start once US-006 is complete
- US-008 should be last (tests all implementations)

---

## Crew Summary by Phase

| Phase | Stages | Crew Types | Parallel? |
|-------|--------|------------|-----------|
| THE_ENGINE | 7-9 | BUSINESS_MODEL, TECHNICAL_VALIDATION, OPERATIONS_DESIGN | No |
| THE_IDENTITY | 10-13 | BRAND_DEVELOPMENT, MARKET_POSITIONING | Yes (10-11 ‖ 12-13) |
| THE_BLUEPRINT | 14-18 | PRODUCT_DESIGN, ENGINEERING_SPEC, ARCHITECTURE | No (sequential deps) |
| THE_BUILD_LOOP | 19-23 | DEVELOPMENT, QA_VALIDATION, DEPLOYMENT | No (iterative loop) |
| LAUNCH_LEARN | 24-25 | LAUNCH_PREP, MONITORING_ITERATION | No |

**Total New Crew Types**: 13

---

## Success Metrics

### Completion Criteria
- ✅ All 8 user stories in database
- ⏳ All 13 crew types in CREW_REGISTRY
- ⏳ STAGE_CREW_MAP contains all 25 stages
- ⏳ getCrewForStage() works for stages 1-25
- ⏳ dispatchStageTask() works for stages 7-25
- ⏳ Test coverage ≥90% on new code
- ⏳ Integration tests pass
- ⏳ E2E tests pass

### Performance Goals
- Stage dispatch latency: <100ms
- Crew config lookup: O(1)
- Full lifecycle progression: <5 seconds (test mode)

### Quality Goals
- TypeScript compilation: 0 errors
- Test coverage: ≥90%
- Code review: All stories approved
- Documentation: Complete for all crews and patterns

---

## Technical Notes

### Sequential Dependencies
**THE_BLUEPRINT** (14-18) and **THE_BUILD_LOOP** (19-23) have strict sequential dependencies:
- BLUEPRINT: Design → Spec → Architecture (outputs feed into next stage)
- BUILD_LOOP: Dev → QA → Deploy (pipeline pattern with loop-backs on failure)

### Parallel Execution Opportunities
**THE_IDENTITY** (10-13) can parallelize:
- Stages 10-11 (BRAND_DEVELOPMENT) can run concurrently with stages 12-13 (MARKET_POSITIONING)
- Requires sufficient resources (≥2 brand specialists + ≥2 market analysts)
- Benefits: ~40% reduction in IDENTITY phase time
- Risks: Misalignment if poorly coordinated

### Iterative Patterns
**THE_BUILD_LOOP** (19-23) is iterative:
- Loop repeats: Dev (19-20) → QA (21-22) → Deploy (23) → repeat until MVP ready
- Failures loop back: QA failure → Dev, Deploy failure → QA
- Consider iteration tracking in crew configs

### Continuous Stages
**Stage 25** (MONITORING_ITERATION) is ongoing:
- Never truly "completes"
- Transitions to ongoing operations
- May need special handling in stage progression logic

---

## E2E Test Coverage

### E2E Tests Planned
1. **US-006**: `tests/e2e/SD-FOUNDATION-V3-006-US-006-stage-crew-map.spec.ts`
   - Validates STAGE_CREW_MAP completeness
   - Tests getCrewForStage() for all 25 stages

2. **US-008**: `tests/e2e/SD-FOUNDATION-V3-006-US-008-integration-tests.spec.ts`
   - Full lifecycle progression (1 → 25)
   - dispatchStageTask() for stages 7-25
   - Edge case handling

### Test Coverage Goal
- Unit tests: ≥90% coverage on new code
- Integration tests: All crew dispatch paths
- E2E tests: Full venture lifecycle

---

## Next Steps (EXEC Phase)

1. **US-001 through US-005**: Implement crew configs in CREW_REGISTRY
2. **US-006**: Extend STAGE_CREW_MAP with all 25 stages
3. **US-007**: Add co-execution patterns to STAGE_CO_EXECUTION_MAP
4. **US-008**: Create integration test suite
5. **E2E Tests**: Implement E2E test coverage
6. **Code Review**: Architect approval
7. **Documentation**: Update 25-stage protocol docs

---

## Document Metadata

- **Author**: STORIES (Sub-Agent)
- **Model**: Sonnet 4.5 (claude-sonnet-4-5-20250929)
- **Date**: 2025-12-17
- **SD ID**: SD-FOUNDATION-V3-006
- **PRD ID**: PRD-SD-FOUNDATION-V3-006
- **Total Stories**: 8
- **Total Story Points**: 44
- **Status**: User stories created and stored in database

---

## Related Files

- **User Stories Script**: `/scripts/add-user-stories-sd-foundation-v3-006.js`
- **Implementation File**: `/lib/evaTaskContracts.ts` (to be updated)
- **Test Files**: `/tests/integration/stage-crew-dispatch.test.ts`, `/tests/unit/crew-configs.test.ts`
- **E2E Tests**: `/tests/e2e/SD-FOUNDATION-V3-006-*.spec.ts`
- **PRD**: Database (product_requirements_v2 table)
