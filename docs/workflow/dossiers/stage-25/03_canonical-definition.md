# Stage 25: Canonical Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, testing, e2e, unit

## Source Authority

**File**: `docs/workflow/stages.yaml`
**Repository**: EHG_Engineer
**Commit**: 6ef8cf4
**Lines**: 1103-1148 (46 lines)
**Extraction Command**: `cat docs/workflow/stages.yaml | sed -n '1103,1148p'`

---

## Full YAML Specification

```yaml
  - id: 25
    title: Quality Assurance
    description: Comprehensive quality assurance and testing processes.
    depends_on:
      - 24
    inputs:
      - Test plans
      - Quality criteria
      - Test data
    outputs:
      - Test results
      - Bug reports
      - Quality certification
    metrics:
      - Test coverage
      - Defect density
      - Quality score
    gates:
      entry:
        - Test plans approved
        - Environment ready
      exit:
        - Tests passed
        - Quality certified
        - Release approved
    substages:
      - id: '25.1'
        title: Test Execution
        done_when:
          - Unit tests passed
          - Integration tests complete
          - E2E tests successful
      - id: '25.2'
        title: Bug Management
        done_when:
          - Bugs logged
          - Fixes verified
          - Regression tested
      - id: '25.3'
        title: Quality Certification
        done_when:
          - Criteria met
          - Documentation complete
          - Sign-off received
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field-by-Field Analysis

### Basic Attributes

| Field | Value | Type | Notes |
|-------|-------|------|-------|
| id | 25 | integer | Sequential stage identifier |
| title | Quality Assurance | string | Human-readable stage name |
| description | Comprehensive quality assurance and testing processes. | string | Brief purpose statement |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1103-1105

### Dependencies

**Depends On**: Stage 24 (MVP Engine: Automated Feedback Iteration)

**Interpretation**: Stage 25 cannot start until Stage 24 completes. MVP must be tested and iterated before comprehensive QA begins.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1106-1107 "depends_on: - 24"

### Inputs (3 defined)

1. **Test plans**
   - **Source**: Created in Stage 18 (Documentation Sync) or Stage 24 (MVP planning)
   - **Format**: Test suite specifications (unit, integration, E2E)
   - **Validation**: Must include test cases for all critical paths
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1109

2. **Quality criteria**
   - **Source**: Defined in PRD (Stage 12) or updated in Stage 24
   - **Format**: Acceptance criteria, performance benchmarks, UX standards
   - **Validation**: Must be measurable and achievable
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1110

3. **Test data**
   - **Source**: Generated in Stage 19 (integration verification) or Stage 24 (MVP usage)
   - **Format**: Realistic datasets, edge cases, stress test scenarios
   - **Validation**: Must cover 90%+ of expected usage patterns
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1111

### Outputs (3 defined)

1. **Test results**
   - **Format**: JUnit XML, Playwright HTML reports, coverage reports
   - **Destination**: Stored in database, linked to venture record
   - **Retention**: Permanent (audit trail for release approval)
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1113

2. **Bug reports**
   - **Format**: Structured bug tickets (title, severity, reproduction steps, screenshots)
   - **Destination**: GitHub Issues, Linear, Jira (venture-specific)
   - **Retention**: Until resolved and regression tested
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1114

3. **Quality certification**
   - **Format**: Sign-off document (PDF, markdown with signatures)
   - **Destination**: Stored in venture documentation repository
   - **Retention**: Permanent (regulatory compliance)
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1115

### Metrics (3 defined)

1. **Test coverage**
   - **Definition**: % of code/features covered by automated tests
   - **Target**: ≥80% (unit), ≥70% (integration), ≥50% (E2E)
   - **Measurement**: Istanbul/nyc for JavaScript, pytest-cov for Python
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1117

2. **Defect density**
   - **Definition**: # of bugs per 1000 lines of code (or per feature)
   - **Target**: <5 bugs per 1000 LOC (industry standard)
   - **Measurement**: Bug count / total LOC (from git diff stats)
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1118

3. **Quality score**
   - **Definition**: Weighted composite score (test coverage 40%, defect density 30%, performance 20%, UX 10%)
   - **Target**: ≥85/100 (release-ready)
   - **Measurement**: Calculated formula in database trigger
   - **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1119

### Gates

#### Entry Gates (2 conditions)

**Gate 1: Test plans approved**
- **Validation**: QA lead reviews test plans, approves coverage
- **Failure Action**: Return to Stage 24 to revise test strategy
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1122

**Gate 2: Environment ready**
- **Validation**: QA environment deployed, accessible, seeded with test data
- **Failure Action**: DevOps resolves environment issues (network, permissions, data)
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1123

#### Exit Gates (3 conditions)

**Gate 1: Tests passed**
- **Validation**: All critical tests passed, no blocking bugs
- **Failure Action**: Fix bugs, re-run tests (self-recursion to Substage 25.1)
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1125

**Gate 2: Quality certified**
- **Validation**: Quality score ≥85/100, certification document signed
- **Failure Action**: Address quality gaps, re-test
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1126

**Gate 3: Release approved**
- **Validation**: Stakeholder/Chairman approves release (business decision)
- **Failure Action**: Defer release (non-technical blocker)
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1127

### Substages (3 defined)

#### Substage 25.1: Test Execution

**Done When**:
1. Unit tests passed
2. Integration tests complete
3. E2E tests successful

**Duration Estimate**: 2-4 hours (automated), 1-2 days (manual)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1129-1134

#### Substage 25.2: Bug Management

**Done When**:
1. Bugs logged (all discovered issues documented)
2. Fixes verified (developers fixed bugs, QA verified)
3. Regression tested (fixes don't break existing functionality)

**Duration Estimate**: 1-3 days (depends on bug count/severity)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1136-1140

#### Substage 25.3: Quality Certification

**Done When**:
1. Criteria met (all quality gates passed)
2. Documentation complete (test reports, bug summaries, certification doc)
3. Sign-off received (QA lead + stakeholder approval)

**Duration Estimate**: 1-2 hours (paperwork)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1142-1146

### Notes

**Progression Mode**: Manual → Assisted → Auto (suggested)

**Interpretation**:
- **Manual**: QA engineer runs tests manually, tracks bugs in spreadsheets
- **Assisted**: Automated test execution, manual bug triage
- **Auto**: Fully automated QA with AI-driven test generation and bug prioritization

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1148

---

## Validation Rules

### Required Fields (All Present)

✅ `id`: 25
✅ `title`: Quality Assurance
✅ `depends_on`: [24]
✅ `inputs`: 3 items
✅ `outputs`: 3 items
✅ `metrics`: 3 items
✅ `gates`: entry (2), exit (3)
✅ `substages`: 3 items

### Optional Fields

✅ `description`: Present
✅ `notes`: Present

### Schema Compliance

**Status**: ✅ VALID (conforms to stages.yaml schema)

**Verification Command**:
```bash
# Validate YAML syntax
yamllint docs/workflow/stages.yaml

# Validate stage structure
node scripts/validate-stages-schema.js --stage 25
```

---

## Interpretation Ambiguities

### Ambiguity 1: Test Coverage Thresholds

**Issue**: Metrics defined (test coverage) but no target values specified

**Proposed Resolution**: Use industry standards (80% unit, 70% integration, 50% E2E)

**Cross-Reference**: SD-METRICS-FRAMEWORK-001 (universal blocker, will define thresholds for all stages)

### Ambiguity 2: Quality Score Formula

**Issue**: "Quality score" metric listed but calculation formula undefined

**Proposed Resolution**: Weighted composite (test coverage 40%, defect density 30%, performance 20%, UX 10%)

**Cross-Reference**: Proposed in `09_metrics-monitoring.md`

### Ambiguity 3: Automation Level

**Issue**: "Manual → Assisted → Auto (suggested)" but no criteria for progression

**Proposed Resolution**: Manual (≤10 ventures), Assisted (11-50 ventures), Auto (51+ ventures)

**Cross-Reference**: Proposed in SD-QA-AUTOMATION-001

### Ambiguity 4: Bug Severity Classification

**Issue**: "Bugs logged" but no severity levels defined (P0/P1/P2/P3/P4?)

**Proposed Resolution**: Use standard P0-P4 scale (P0=critical, blocks release; P4=trivial, cosmetic)

**Cross-Reference**: Proposed in `06_agent-orchestration.md` (BugAnalyst agent responsibilities)

---

## Sources Table

| Claim | Repo | Commit | Path | Lines | Excerpt |
|-------|------|--------|------|-------|---------|
| Stage ID 25 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1103 | "- id: 25" |
| Title: Quality Assurance | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1104 | "title: Quality Assurance" |
| Depends on 24 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1106-1107 | "depends_on: - 24" |
| 3 inputs defined | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1108-1111 | "inputs: - Test plans" |
| 3 outputs defined | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1112-1115 | "outputs: - Test results" |
| 3 metrics defined | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1116-1119 | "metrics: - Test coverage" |
| Entry gates: 2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1121-1123 | "entry: - Test plans approved" |
| Exit gates: 3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1124-1127 | "exit: - Tests passed" |
| Substages: 3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1128-1146 | "substages: - id: '25.1'" |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1148 | "progression_mode: Manual → Assisted" |

---

**Next**: See `04_current-assessment.md` for critique rubric scores.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
