---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Verification Report Template



## Table of Contents

- [Metadata](#metadata)
- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Template Structure](#template-structure)
  - [1. Evidence Summary](#1-evidence-summary)
- [Evidence Summary](#evidence-summary)
  - [2. Test Results](#2-test-results)
- [Test Results](#test-results)
  - [Unit Tests](#unit-tests)
  - [E2E Tests (MANDATORY)](#e2e-tests-mandatory)
  - [E2E Test → User Story Mapping](#e2e-test-user-story-mapping)
  - [3. Coverage Analysis](#3-coverage-analysis)
- [Coverage Analysis](#coverage-analysis)
  - [Acceptance Criteria Coverage](#acceptance-criteria-coverage)
  - [Functional Requirements Coverage](#functional-requirements-coverage)
  - [User Story Coverage](#user-story-coverage)
  - [4. Known Limitations](#4-known-limitations)
- [Known Limitations](#known-limitations)
  - [Technical Debt Created](#technical-debt-created)
  - [Deferred Work](#deferred-work)
  - [Out of Scope](#out-of-scope)
  - [5. Sign-Off](#5-sign-off)
- [Sign-Off](#sign-off)
- [Integration with Unified Handoff System](#integration-with-unified-handoff-system)
  - [Auto-Population Fields](#auto-population-fields)
  - [Validation Gates](#validation-gates)
  - [Rejection Criteria](#rejection-criteria)
- [Example: Complete Verification Report](#example-complete-verification-report)
- [Database Schema Reference](#database-schema-reference)
  - [Relevant Tables](#relevant-tables)
  - [Useful Queries](#useful-queries)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, e2e, unit

**Generated**: 2025-10-19
**Source**: SD-PROOF-DRIVEN-1758340937844
**Context Tier**: REFERENCE

---

## Purpose

This template provides a standardized structure for EXEC→PLAN handoff verification reports, ensuring comprehensive evidence of implementation completeness and quality.

## When to Use

Use this template when creating EXEC→PLAN handoffs to demonstrate:
- All user stories have been implemented
- All tests have passed
- All acceptance criteria have been met
- Implementation matches PRD specifications

---

## Template Structure

### 1. Evidence Summary

**Format:**
```markdown
## Evidence Summary

**User Stories Completed**: X of Y (100% required)
**Test Coverage**: X% (≥80% unit, 100% E2E required)
**Acceptance Criteria Met**: X of Y (100% required)
**Files Modified**: N files
**Files Created**: M files
**Total LOC**: ~X lines (additions: +A, deletions: -D)
```

**Database Query:**
```sql
-- Get user story completion status
SELECT
  story_key,
  title,
  status,
  test_coverage,
  acceptance_status
FROM user_stories
WHERE sd_id = 'SD-XXX-XXXXXXXX'
ORDER BY story_key;
```

---

### 2. Test Results

**Format:**
```markdown
## Test Results

### Unit Tests
- **Status**: ✅ PASS / ❌ FAIL
- **Coverage**: X%
- **Tests Run**: N
- **Tests Passed**: M
- **Command**: `npm test -- path/to/tests`
- **Output**: [Link to test output or summary]

### E2E Tests (MANDATORY)
- **Status**: ✅ PASS / ❌ FAIL
- **User Stories Covered**: X of Y (100% required)
- **Tests Run**: N
- **Tests Passed**: M
- **Command**: `npx playwright test [test-file]`
- **Output**: [Link to test output or summary]

### E2E Test → User Story Mapping
| Test File | User Story | Status |
|-----------|------------|--------|
| test-file.spec.ts | SD-XXX:US-001 | ✅ PASS |
| test-file.spec.ts | SD-XXX:US-002 | ✅ PASS |
```

**Database Query:**
```sql
-- Get E2E test mapping
SELECT
  test_file_path,
  story_key,
  test_name,
  last_run_status,
  last_run_at
FROM e2e_test_story_mapping
WHERE sd_id = 'SD-XXX-XXXXXXXX'
ORDER BY story_key;
```

---

### 3. Coverage Analysis

**Format:**
```markdown
## Coverage Analysis

### Acceptance Criteria Coverage
- **Total Criteria**: N
- **Criteria Met**: M (100% required)
- **Verification Method**: [Unit tests | E2E tests | Manual validation]

**Details:**
| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC-001: ... | ✅ MET | E2E test: test-file.spec.ts:42 |
| AC-002: ... | ✅ MET | Unit test: component.test.tsx:15 |

### Functional Requirements Coverage
- **Total Requirements**: N
- **Requirements Implemented**: M (100% required)

**Details:**
| Requirement ID | Title | Status | Implementation |
|----------------|-------|--------|----------------|
| FR-001 | ... | ✅ COMPLETE | src/components/Feature.tsx |
| FR-002 | ... | ✅ COMPLETE | src/services/feature-service.ts |

### User Story Coverage
- **Total Stories**: N
- **Stories Completed**: M (100% required)
- **Story Points Delivered**: X of Y

**Details:**
| Story Key | Title | Points | Status | Tests |
|-----------|-------|--------|--------|-------|
| SD-XXX:US-001 | ... | 5 | ✅ COMPLETE | ✅ PASS |
| SD-XXX:US-002 | ... | 3 | ✅ COMPLETE | ✅ PASS |
```

**Database Query:**
```sql
-- Get PRD acceptance criteria
SELECT
  acceptance_criteria,
  jsonb_array_length(acceptance_criteria) as total_criteria
FROM product_requirements_v2
WHERE sd_id = 'SD-XXX-XXXXXXXX';

-- Get PRD functional requirements
SELECT
  functional_requirements,
  jsonb_array_length(functional_requirements) as total_requirements
FROM product_requirements_v2
WHERE sd_id = 'SD-XXX-XXXXXXXX';
```

---

### 4. Known Limitations

**Format:**
```markdown
## Known Limitations

### Technical Debt Created
1. **Issue**: [Description]
   - **Impact**: [Low | Medium | High]
   - **Mitigation**: [Short-term workaround]
   - **Follow-up SD**: [SD-XXX-XXXXXXXX or "Not required"]

2. **Issue**: [Description]
   - **Impact**: [Low | Medium | High]
   - **Mitigation**: [Short-term workaround]
   - **Follow-up SD**: [SD-XXX-XXXXXXXX or "Not required"]

### Deferred Work
1. **Item**: [Description]
   - **Reason**: [Why deferred]
   - **Priority**: [Low | Medium | High]
   - **Tracking**: [Issue #XXX | SD-XXX-XXXXXXXX]

### Out of Scope
1. **Item**: [Description]
   - **Reason**: [Why out of scope]
   - **Reference**: [PRD section or decision log]
```

**Guidance:**
- Be transparent about trade-offs made during implementation
- Document any deviations from the PRD with justification
- Create follow-up SDs for medium/high impact technical debt
- Link to GitHub issues or database records for tracking

---

### 5. Sign-Off

**Format:**
```markdown
## Sign-Off

**Implementation Date**: YYYY-MM-DD
**Implementer**: [Claude Code | Human]
**Verification Date**: YYYY-MM-DD
**Verifier**: [PLAN Phase Lead]

**Certification Statement**:
I certify that:
- ✅ All user stories have been implemented as specified in the PRD
- ✅ All acceptance criteria have been met
- ✅ All tests (unit + E2E) have passed
- ✅ Code has been reviewed and follows project standards
- ✅ Documentation has been updated
- ✅ No known critical issues remain unresolved
- ✅ Implementation is ready for PLAN phase verification

**Git Evidence**:
- **Branch**: `[branch-name]`
- **Commits**: [Number] commits
- **PR**: [PR URL or "Not yet created"]
- **Latest Commit**: `[commit hash]` - "[commit message]"

**Database Evidence**:
- **SD Status**: active, current_phase: EXEC, progress: 100%
- **Handoff ID**: [UUID]
- **Handoff Created**: [Timestamp]
```

**Database Query:**
```sql
-- Verify SD completion
SELECT
  id,
  title,
  status,
  current_phase,
  progress,
  updated_at
FROM strategic_directives_v2
WHERE id = 'SD-XXX-XXXXXXXX';

-- Get handoff details
SELECT
  id,
  handoff_type,
  status,
  created_at,
  created_by
FROM sd_phase_handoffs
WHERE sd_id = 'SD-XXX-XXXXXXXX'
  AND handoff_type = 'EXEC-to-PLAN'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Integration with Unified Handoff System

This verification report template integrates with `scripts/unified-handoff-system.js` for automated validation:

### Auto-Population Fields

The unified handoff system can auto-populate these fields when creating EXEC→PLAN handoffs:

```javascript
// In unified-handoff-system.js
async createExecToPlanHandoff(sdId) {
  const verification = await this.generateVerificationReport(sdId);

  return {
    executive_summary: verification.evidenceSummary,
    deliverables_manifest: verification.coverageAnalysis,
    key_decisions: verification.technicalDecisions,
    known_issues: verification.knownLimitations,
    completeness_report: verification.signOff,
    metadata: {
      test_results: verification.testResults,
      coverage_metrics: verification.coverageMetrics
    }
  };
}
```

### Validation Gates

The following gates are automatically checked:

1. **User Story Completion**: 100% required
2. **E2E Test Coverage**: 100% user story mapping required
3. **Acceptance Criteria**: 100% met required
4. **Test Pass Rate**: 100% required (all tests must pass)
5. **Git Commit Status**: All changes committed and pushed

### Rejection Criteria

Handoff will be rejected if:
- Any user story is not in "completed" status
- Any E2E test fails
- User story → E2E test mapping is incomplete (<100%)
- Git branch has uncommitted changes
- Critical known issues are unresolved

---

## Example: Complete Verification Report

See `docs/reference/verification-examples.md` for full example reports.

---

## Database Schema Reference

### Relevant Tables

1. **strategic_directives_v2**: SD status and progress
2. **product_requirements_v2**: PRD with acceptance criteria and functional requirements
3. **user_stories**: Story status and test coverage
4. **e2e_test_story_mapping**: E2E test → user story mapping
5. **sd_phase_handoffs**: Handoff records and status
6. **sub_agent_execution_results**: Sub-agent verification results

### Useful Queries

```sql
-- Get comprehensive SD completion status
SELECT
  sd.id,
  sd.title,
  sd.status,
  sd.current_phase,
  sd.progress,
  COUNT(DISTINCT us.story_key) as total_stories,
  COUNT(DISTINCT CASE WHEN us.status = 'completed' THEN us.story_key END) as completed_stories,
  COUNT(DISTINCT etm.test_file_path) as e2e_tests,
  COUNT(DISTINCT CASE WHEN etm.last_run_status = 'pass' THEN etm.test_file_path END) as passing_e2e_tests
FROM strategic_directives_v2 sd
LEFT JOIN user_stories us ON us.sd_id = sd.id
LEFT JOIN e2e_test_story_mapping etm ON etm.sd_id = sd.id
WHERE sd.id = 'SD-XXX-XXXXXXXX'
GROUP BY sd.id, sd.title, sd.status, sd.current_phase, sd.progress;
```

---

**Related Documentation:**
- `docs/reference/unified-handoff-system.md` - Handoff creation guide
- `docs/reference/qa-director-guide.md` - Testing requirements
- `docs/reference/user-story-e2e-mapping.md` - E2E test mapping guide

---

*This is reference documentation, load on-demand only*
*Generated from: SD-PROOF-DRIVEN-1758340937844*
*Last updated: 2025-10-19*
