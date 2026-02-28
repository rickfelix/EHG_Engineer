---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 25: Agent Orchestration (QualityAssuranceCrew)



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Crew Architecture](#crew-architecture)
  - [High-Level Design](#high-level-design)
- [Agent Specifications](#agent-specifications)
  - [Agent 1: TestExecutionEngineer](#agent-1-testexecutionengineer)
  - [Agent 2: BugAnalyst](#agent-2-buganalyst)
  - [Agent 3: CertificationValidator](#agent-3-certificationvalidator)
  - [Agent 4: RegressionCoordinator](#agent-4-regressioncoordinator)
- [Crew Workflow](#crew-workflow)
  - [Stage 25 Execution Flow](#stage-25-execution-flow)
  - [Agent Interactions](#agent-interactions)
- [Implementation Plan](#implementation-plan)
  - [Phase 1: Tool Development (Week 1-2)](#phase-1-tool-development-week-1-2)
  - [Phase 2: Agent Configuration (Week 2)](#phase-2-agent-configuration-week-2)
  - [Phase 3: Crew Integration (Week 3)](#phase-3-crew-integration-week-3)
  - [Phase 4: Testing & Deployment (Week 4)](#phase-4-testing-deployment-week-4)
- [Database Schema (for Agent Tools)](#database-schema-for-agent-tools)
  - [Table: `stage_25_test_results`](#table-stage_25_test_results)
  - [Table: `stage_25_bugs`](#table-stage_25_bugs)
  - [Table: `stage_25_quality_metrics`](#table-stage_25_quality_metrics)
- [Human-in-the-Loop (HITL) Checkpoints](#human-in-the-loop-hitl-checkpoints)
- [Sources Table](#sources-table)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

## Overview

**Crew Name**: QualityAssuranceCrew
**Purpose**: Automate test execution, bug tracking, and quality certification for Stage 25
**Framework**: CrewAI (Python-based multi-agent orchestration)
**Automation Level**: Assisted → Auto (target: 90% automated)
**Estimated Development Effort**: 3-4 weeks (EXEC + QA specialist)

---

## Crew Architecture

### High-Level Design

```
QualityAssuranceCrew
│
├── TestExecutionEngineer (Agent 1)
│   ├── Executes unit/integration/E2E tests
│   ├── Collects coverage reports
│   └── Generates test results summary
│
├── BugAnalyst (Agent 2)
│   ├── Parses test failures → bug reports
│   ├── Classifies bug severity (P0-P4)
│   ├── Tracks bug status (open → fixed → verified)
│   └── Generates bug summary
│
├── CertificationValidator (Agent 3)
│   ├── Calculates quality score
│   ├── Validates against thresholds
│   ├── Generates certification document
│   └── Requests sign-off
│
└── RegressionCoordinator (Agent 4)
    ├── Monitors bug fixes
    ├── Triggers regression tests
    ├── Compares results with baseline
    └── Detects new regressions
```

**Evidence**: Proposed architecture based on Stage 25 substages (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1128-1146)

---

## Agent Specifications

### Agent 1: TestExecutionEngineer

**Role**: Execute all test suites (unit, integration, E2E), collect coverage reports

**Goal**: Achieve 100% test pass rate with ≥80% unit coverage, ≥70% integration coverage, ≥50% E2E coverage

**Backstory**: Experienced QA automation engineer specializing in JavaScript/TypeScript (Jest, Vitest, Playwright) and Python (pytest). Maintains test infrastructure, optimizes test performance, debugs flaky tests.

**Tools**:
1. **RunUnitTests**: Executes Jest/pytest unit tests
   - Input: `venture_id`, `test_path`
   - Output: Test results (passed/failed counts, coverage %, duration)
   - Example: `RunUnitTests(venture_id="VENTURE-001", test_path="src/tests/unit/")`

2. **RunIntegrationTests**: Executes Vitest/pytest integration tests
   - Input: `venture_id`, `test_path`
   - Output: Test results (passed/failed counts, coverage %, duration)
   - Example: `RunIntegrationTests(venture_id="VENTURE-001", test_path="src/tests/integration/")`

3. **RunE2ETests**: Executes Playwright E2E tests
   - Input: `venture_id`, `test_path`, `browser` (chromium/firefox/webkit)
   - Output: Test results (passed/failed counts, screenshots, videos)
   - Example: `RunE2ETests(venture_id="VENTURE-001", test_path="src/tests/e2e/", browser="chromium")`

4. **CollectCoverageReport**: Aggregates coverage data from all test suites
   - Input: `venture_id`, `coverage_files` (list of lcov.info paths)
   - Output: Merged coverage report (HTML + JSON)
   - Example: `CollectCoverageReport(venture_id="VENTURE-001", coverage_files=["unit.lcov", "integration.lcov"])`

**Tasks** (Substage 25.1):
1. Run unit tests for all components
2. Run integration tests for APIs and services
3. Run E2E tests for critical user flows
4. Collect and aggregate coverage reports
5. Generate test results summary

**Success Criteria**:
- All unit tests passed (0 failures)
- All integration tests passed (0 failures)
- All E2E tests passed (0 failures)
- Coverage thresholds met (unit ≥80%, integration ≥70%, E2E ≥50%)

**Delegation**:
- **To BugAnalyst**: If tests fail, delegate bug report creation
- **To RegressionCoordinator**: After initial test run, delegate regression monitoring

**Evidence**: Substage 25.1 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1129-1134)

---

### Agent 2: BugAnalyst

**Role**: Parse test failures into structured bug reports, classify severity, track status

**Goal**: Log 100% of discovered bugs with accurate severity classification, track to closure

**Backstory**: QA analyst specializing in bug triage and root cause analysis. Experienced in parsing stack traces, identifying duplicate bugs, prioritizing fixes based on user impact.

**Tools**:
1. **ParseTestFailure**: Converts test failure into bug report
   - Input: `test_result` (JSON with failure details)
   - Output: Bug report (title, reproduction steps, severity, stack trace)
   - Example: `ParseTestFailure(test_result={...})`

2. **ClassifyBugSeverity**: Determines bug severity (P0-P4) based on impact
   - Input: `bug_report`, `user_impact` (critical/high/medium/low)
   - Output: Severity level (P0/P1/P2/P3/P4)
   - Algorithm:
     - P0: Blocks release (critical functionality broken, security vulnerability)
     - P1: Major functionality broken (affects >50% of users)
     - P2: Minor functionality broken (affects <50% of users, workaround exists)
     - P3: Cosmetic issue (UI glitch, typo)
     - P4: Trivial (edge case, low priority enhancement)
   - Example: `ClassifyBugSeverity(bug_report="Login button not responding", user_impact="critical") → P0`

3. **TrackBugStatus**: Updates bug status in database
   - Input: `bug_id`, `new_status` (open/in-progress/fixed/verified/closed)
   - Output: Updated bug record
   - Example: `TrackBugStatus(bug_id="BUG-001", new_status="fixed")`

4. **DetectDuplicateBugs**: Identifies duplicate bug reports using NLP similarity
   - Input: `new_bug_report`, `existing_bugs` (list)
   - Output: Duplicate match (bug_id) or `null`
   - Algorithm: Cosine similarity of bug title/description embeddings (threshold >0.85)
   - Example: `DetectDuplicateBugs(new_bug_report="Login fails", existing_bugs=[...]) → "BUG-005"`

**Tasks** (Substage 25.2):
1. Parse all test failures into bug reports
2. Classify bug severity (P0-P4)
3. Detect and merge duplicate bugs
4. Track bug status (open → fixed → verified)
5. Generate bug summary report (counts by severity, status)

**Success Criteria**:
- All test failures logged as bugs (100% coverage)
- All bugs classified with severity (no unclassified bugs)
- No duplicate bugs (merged into single tickets)
- All P0/P1 bugs resolved and verified (0 open critical/high bugs)

**Delegation**:
- **To TestExecutionEngineer**: Request re-test after bug fix
- **To RegressionCoordinator**: Request regression test after bug fix

**Evidence**: Substage 25.2 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1136-1140)

---

### Agent 3: CertificationValidator

**Role**: Calculate quality score, validate against thresholds, generate certification document

**Goal**: Produce quality certification document with ≥85/100 quality score, obtain sign-off

**Backstory**: QA lead with regulatory compliance expertise. Experienced in quality metrics, certification processes, stakeholder communication.

**Tools**:
1. **CalculateQualityScore**: Computes composite quality score
   - Input: `venture_id`, `test_results`, `bug_summary`, `performance_metrics`, `ux_score`
   - Output: Quality score (0-100) with breakdown
   - Formula: `(Test Coverage × 0.4) + (Defect Density × 0.3) + (Performance × 0.2) + (UX × 0.1)`
   - Example: `CalculateQualityScore(venture_id="VENTURE-001") → 88/100`

2. **ValidateThresholds**: Checks quality metrics against thresholds
   - Input: `quality_score`, `test_coverage`, `defect_density`, `thresholds` (config)
   - Output: Pass/fail status for each metric
   - Example: `ValidateThresholds(quality_score=88, thresholds={min_score: 85}) → PASS`

3. **GenerateCertificationDocument**: Creates quality certification document
   - Input: `venture_id`, `test_results`, `bug_summary`, `quality_score`
   - Output: Markdown document (convertible to PDF)
   - Template: See `05_professional-sop.md` Step 2 (EHG_Engineer@6ef8cf4)
   - Example: `GenerateCertificationDocument(venture_id="VENTURE-001") → "quality-certification.md"`

4. **RequestSignoff**: Sends certification document to approvers
   - Input: `venture_id`, `document_path`, `approvers` (list of emails)
   - Output: Sign-off request ID
   - Example: `RequestSignoff(venture_id="VENTURE-001", approvers=["qa-lead@example.com", "chairman@example.com"])`

**Tasks** (Substage 25.3):
1. Calculate quality score from test results + bug summary
2. Validate quality score against threshold (≥85/100)
3. Generate certification document
4. Request sign-off from QA lead and stakeholder
5. Track sign-off status (pending → approved)

**Success Criteria**:
- Quality score ≥85/100
- All quality criteria met (test coverage, defect density, performance, UX)
- Certification document generated (markdown + PDF)
- Sign-off received from both approvers

**Delegation**:
- **To TestExecutionEngineer**: If coverage below threshold, request additional tests
- **To BugAnalyst**: If defect density too high, prioritize bug fixes

**Evidence**: Substage 25.3 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1142-1146)

---

### Agent 4: RegressionCoordinator

**Role**: Monitor bug fixes, trigger regression tests, detect new regressions

**Goal**: Ensure 0 regressions introduced by bug fixes (100% regression-free)

**Backstory**: QA engineer specializing in regression testing and continuous integration. Experienced in test result comparison, git bisect for regression detection, CI/CD pipeline integration.

**Tools**:
1. **MonitorBugFixes**: Watches bug status changes (fixed → verified)
   - Input: `venture_id`, `poll_interval` (seconds)
   - Output: Stream of bug fix events
   - Example: `MonitorBugFixes(venture_id="VENTURE-001", poll_interval=60)`

2. **TriggerRegressionTests**: Re-runs all test suites
   - Input: `venture_id`, `test_suites` (unit/integration/e2e)
   - Output: Test results
   - Example: `TriggerRegressionTests(venture_id="VENTURE-001", test_suites=["unit", "integration", "e2e"])`

3. **CompareTestResults**: Compares current test results with baseline
   - Input: `baseline_results`, `current_results`
   - Output: Diff (new failures, fixed tests, unchanged)
   - Example: `CompareTestResults(baseline="baseline.json", current="regression.json") → {new_failures: 2, fixed: 10, unchanged: 238}`

4. **DetectRegressions**: Identifies new test failures (regressions)
   - Input: `test_results_diff`
   - Output: List of regression bugs (test name, failure reason)
   - Example: `DetectRegressions(diff={new_failures: ["test-login", "test-checkout"]}) → [BUG-020, BUG-021]`

**Tasks** (Substage 25.2):
1. Monitor bug fix commits (watch git repository)
2. Trigger regression tests after each fix
3. Compare regression results with baseline (before fix)
4. Detect new regressions (tests that passed before, fail now)
5. Report regressions to BugAnalyst (new bugs)

**Success Criteria**:
- Regression tests triggered for 100% of bug fixes
- 0 new regressions detected (all tests pass)
- Regression results compared with baseline (automated)

**Delegation**:
- **To BugAnalyst**: If regression detected, create new bug report
- **To TestExecutionEngineer**: Re-run specific test if regression uncertain

**Evidence**: Substage 25.2 regression testing requirement (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1140 "- Regression tested")

---

## Crew Workflow

### Stage 25 Execution Flow

```
1. Entry Gates Validation (CertificationValidator)
   ├── Check test plans approved
   └── Check environment ready
   ↓
2. Substage 25.1: Test Execution (TestExecutionEngineer)
   ├── Run unit tests
   ├── Run integration tests
   ├── Run E2E tests
   └── Collect coverage reports
   ↓
3. Substage 25.2: Bug Management (BugAnalyst + RegressionCoordinator)
   ├── Parse test failures → bug reports (BugAnalyst)
   ├── Classify bug severity (BugAnalyst)
   ├── Track bug fixes (BugAnalyst)
   ├── Trigger regression tests (RegressionCoordinator)
   └── Verify no new regressions (RegressionCoordinator)
   ↓
4. Substage 25.3: Quality Certification (CertificationValidator)
   ├── Calculate quality score
   ├── Validate thresholds
   ├── Generate certification document
   └── Request sign-off
   ↓
5. Exit Gates Validation (CertificationValidator)
   ├── Check tests passed
   ├── Check quality certified
   └── Check release approved
```

### Agent Interactions

**TestExecutionEngineer → BugAnalyst**:
- Event: Test failure detected
- Data: Test result JSON (test name, failure reason, stack trace)
- Action: BugAnalyst creates bug report

**BugAnalyst → RegressionCoordinator**:
- Event: Bug status changed to "fixed"
- Data: Bug ID, fixed commit SHA
- Action: RegressionCoordinator triggers regression tests

**RegressionCoordinator → BugAnalyst**:
- Event: Regression detected (new test failure)
- Data: Test result diff (new failure details)
- Action: BugAnalyst creates new bug report (regression bug)

**BugAnalyst → CertificationValidator**:
- Event: All bugs resolved (0 open P0/P1 bugs)
- Data: Bug summary (counts by severity, status)
- Action: CertificationValidator proceeds to quality certification

**TestExecutionEngineer → CertificationValidator**:
- Event: Test execution complete
- Data: Test results, coverage reports
- Action: CertificationValidator calculates quality score

**CertificationValidator → All Agents**:
- Event: Quality score below threshold (<85/100)
- Data: Quality score breakdown (which metric failed)
- Action: Route to responsible agent:
  - Low coverage → TestExecutionEngineer (add tests)
  - High defect density → BugAnalyst (prioritize bug fixes)
  - Low performance → (escalate to PLAN agent, outside Stage 25 scope)

---

## Implementation Plan

### Phase 1: Tool Development (Week 1-2)

**Tasks**:
1. Implement test execution tools (RunUnitTests, RunIntegrationTests, RunE2ETests)
2. Implement bug management tools (ParseTestFailure, ClassifyBugSeverity, TrackBugStatus)
3. Implement quality metrics tools (CalculateQualityScore, ValidateThresholds)
4. Implement regression tools (CompareTestResults, DetectRegressions)

**Technology Stack**:
- Python 3.11+ (CrewAI framework)
- Subprocess calls to Jest, Vitest, Playwright, pytest
- PostgreSQL (store test results, bug reports, quality metrics)
- Supabase RLS (venture-specific data isolation)

**Deliverables**:
- `tools/test_execution.py` (test execution tools)
- `tools/bug_management.py` (bug management tools)
- `tools/quality_metrics.py` (quality metrics tools)
- `tools/regression_testing.py` (regression tools)

### Phase 2: Agent Configuration (Week 2)

**Tasks**:
1. Define agent roles, goals, backstories (YAML config)
2. Assign tools to agents (TestExecutionEngineer → test tools, BugAnalyst → bug tools, etc.)
3. Configure agent prompts (task instructions, output formats)
4. Define agent delegation rules (when to delegate, to whom)

**Deliverables**:
- `config/agents.yaml` (agent definitions)
- `config/tasks.yaml` (task definitions)

### Phase 3: Crew Integration (Week 3)

**Tasks**:
1. Implement QualityAssuranceCrew (CrewAI crew class)
2. Define crew workflow (sequential tasks, parallel tasks)
3. Implement event-driven coordination (agent interactions)
4. Add logging and monitoring (track agent actions, tool calls, errors)

**Deliverables**:
- `crews/quality_assurance_crew.py` (crew implementation)
- `tests/test_quality_assurance_crew.py` (unit tests for crew)

### Phase 4: Testing & Deployment (Week 4)

**Tasks**:
1. Test QualityAssuranceCrew on 3 pilot ventures
2. Measure automation coverage (% of Stage 25 automated)
3. Collect feedback from QA engineers (manual review of agent outputs)
4. Refine agent prompts and tools based on feedback
5. Deploy to production

**Success Criteria**:
- ≥90% automation coverage (only sign-off manual)
- 100% test pass rate (agents execute tests correctly)
- 100% bug report accuracy (severity classification correct)
- ≥85/100 quality score (certification document accurate)

---

## Database Schema (for Agent Tools)

### Table: `stage_25_test_results`

```sql
CREATE TABLE stage_25_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID NOT NULL REFERENCES ventures(id),
    test_type TEXT NOT NULL CHECK (test_type IN ('unit', 'integration', 'e2e')),
    test_suite_name TEXT NOT NULL,
    tests_passed INTEGER NOT NULL,
    tests_failed INTEGER NOT NULL,
    coverage_percentage DECIMAL(5,2),
    duration_seconds INTEGER NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_test_result UNIQUE (venture_id, test_type, executed_at)
);
```

### Table: `stage_25_bugs`

```sql
CREATE TABLE stage_25_bugs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID NOT NULL REFERENCES ventures(id),
    bug_id TEXT NOT NULL UNIQUE, -- e.g., "BUG-001"
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3', 'P4')),
    status TEXT NOT NULL CHECK (status IN ('open', 'in-progress', 'fixed', 'verified', 'closed')),
    reproduction_steps TEXT NOT NULL,
    stack_trace TEXT,
    test_name TEXT, -- originating test (if from test failure)
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    fixed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ
);
```

### Table: `stage_25_quality_metrics`

```sql
CREATE TABLE stage_25_quality_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID NOT NULL REFERENCES ventures(id),
    quality_score DECIMAL(5,2) NOT NULL,
    test_coverage_score DECIMAL(5,2) NOT NULL,
    defect_density_score DECIMAL(5,2) NOT NULL,
    performance_score DECIMAL(5,2),
    ux_score DECIMAL(5,2),
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_quality_metric UNIQUE (venture_id, calculated_at)
);
```

**Evidence**: Proposed schema based on Stage 25 metrics (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1116-1119)

---

## Human-in-the-Loop (HITL) Checkpoints

**Checkpoint 1**: After Substage 25.1 (Test Execution)
- **Trigger**: All tests complete (passed or failed)
- **Human Review**: QA engineer reviews test results summary, investigates unexpected failures
- **Decision**: Proceed to bug management OR re-run tests (if failures look like flaky tests)

**Checkpoint 2**: After Substage 25.2 (Bug Management)
- **Trigger**: All bugs classified and tracked
- **Human Review**: QA lead reviews bug severity classification, adjusts P0/P1 priorities if needed
- **Decision**: Approve bug priorities OR reclassify bugs

**Checkpoint 3**: After Substage 25.3 (Quality Certification)
- **Trigger**: Certification document generated
- **Human Review**: QA lead + stakeholder review certification, provide sign-off
- **Decision**: Approve release OR reject (defer to next sprint)

**Automation Level**:
- **Current (Manual)**: 0% automated (humans do all steps)
- **Target (Assisted)**: 90% automated (agents do test execution, bug logging, quality calculation; humans do sign-off)
- **Future (Auto)**: 95% automated (agents do everything including sign-off, humans review only exceptions)

---

## Sources Table

| Claim | Repo | Commit | Path | Lines | Excerpt |
|-------|------|--------|------|-------|---------|
| 3 substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1128-1146 | "substages: - id: '25.1'" |
| Test Execution substage | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1129-1134 | "title: Test Execution" |
| Bug Management substage | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1136-1140 | "title: Bug Management" |
| Quality Certification substage | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1142-1146 | "title: Quality Certification" |
| 3 metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1116-1119 | "metrics: - Test coverage" |

---

**Next**: See `07_recursion-blueprint.md` for QA-001 through QA-004 recursion triggers.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
