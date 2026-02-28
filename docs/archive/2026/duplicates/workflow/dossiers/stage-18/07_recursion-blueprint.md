---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Current State Analysis](#current-state-analysis)
  - [Critique Recursion Section: DOES NOT EXIST](#critique-recursion-section-does-not-exist)
- [Gap Assessment](#gap-assessment)
- [Proposed Recursion Architecture](#proposed-recursion-architecture)
  - [Framework Reference](#framework-reference)
  - [Recursion Trigger Definitions](#recursion-trigger-definitions)
  - [Forward Recursion (Stage 18 → Stage 19)](#forward-recursion-stage-18-stage-19)
- [Implementation Requirements](#implementation-requirements)
  - [Database Schema Extensions](#database-schema-extensions)
  - [Integration with SD-RECURSION-ENGINE-001](#integration-with-sd-recursion-engine-001)
  - [Monitoring Dashboard Requirements](#monitoring-dashboard-requirements)
- [Testing Strategy](#testing-strategy)
  - [Unit Tests (per trigger)](#unit-tests-per-trigger)
  - [Integration Tests (with SD-RECURSION-ENGINE-001)](#integration-tests-with-sd-recursion-engine-001)
  - [End-to-End Tests (full recursion cycle)](#end-to-end-tests-full-recursion-cycle)
- [Success Metrics for Recursion System](#success-metrics-for-recursion-system)
- [Rollback and Safety Mechanisms](#rollback-and-safety-mechanisms)
  - [Recursion Limits](#recursion-limits)
  - [Manual Override](#manual-override)
  - [Rollback Triggers](#rollback-triggers)
- [Future Enhancements](#future-enhancements)

<!-- ARCHIVED: 2026-01-26T16:26:47.375Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-18\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 18: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Current State Analysis

### Critique Recursion Section: DOES NOT EXIST

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:1-72 "72 lines total"

**Observation**: Current critique file contains NO recursion section. This is consistent with the gap pattern identified in Stages 14-17 dossiers.

**Line Count Verification**:
- Stage 18 critique: 72 lines
- Pattern: Identical to Stages 14, 15, 16, 17 (all 72 lines, no recursion)
- Conclusion: Recursion analysis missing from current workflow documentation

## Gap Assessment

**Critical Gap**: No automated triggers for recursive workflow loops
**Impact**:
- Failed syncs cannot automatically trigger corrective actions
- Manual intervention required for GitHub errors (rate limits, large files, broken CI/CD)
- Delays in sync resolution reduce venture velocity (block Stage 19 start)

**Evidence from Critique**:
- Weakness: "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:26)
- Risk: "Primary Risk: Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:63)
- Recommendation: "Define concrete metrics with thresholds" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:69) - essential for recursion triggers

## Proposed Recursion Architecture

### Framework Reference

**Strategic Directive**: SD-RECURSION-ENGINE-001
**Purpose**: Automate recursive workflow loops for self-healing systems
**Status**: Active (per dossier specification)

**Evidence**: SD-RECURSION-ENGINE-001 provides the infrastructure for automated recursion triggers, eliminating manual escalation for known failure patterns.

### Recursion Trigger Definitions

#### Trigger SYNC-001: Sync Completeness Recursion

**Condition**: Sync completeness <95% after initial Stage 18 execution

**Metric Definition**:
- **Sync Completeness**: (Files successfully pushed to GitHub / Total files in venture directory) × 100%
- **Target**: ≥95% (allows 5% for intentionally excluded files like .env, node_modules)
- **Threshold**: <95% indicates missing files (error or misconfiguration)

**Recursion Targets**:
1. **Stage 18 (self-recursion)**: If sync incomplete due to transient errors
   - Evidence: Network timeout, GitHub API rate limit (temporary issues)
   - Action: Re-execute Substage 18.2 (Content Migration) with retry logic
2. **Stage 14 (Technical Documentation)**: If sync incomplete due to missing documentation
   - Evidence: API docs, architecture diagrams missing from venture directory
   - Action: Recurse to Stage 14 to generate missing docs, then re-run Stage 18

**Automation Logic**:
```sql
-- Trigger query (runs immediately after Stage 18 completion)
SELECT venture_id,
       sync_completeness,
       total_files - synced_files AS missing_files
FROM stage_18_sync_metrics
WHERE sync_completeness < 95;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 18 or 14
```

**Expected Outcome**:
- Automated recursion to Stage 18 (Substage 18.2) or Stage 14
- Missing files identified and pushed to GitHub
- Sync completeness raised to ≥95%

**Evidence Mapping**:
- Sync completeness metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:795 "Sync completeness"
- Content migration substage: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:813-818 "Content Migration"

#### Trigger SYNC-002: Documentation Coverage Recursion

**Condition**: Documentation coverage <80% after Stage 18 completion

**Metric Definition**:
- **Documentation Coverage**: (Documented APIs/components / Total APIs/components) × 100%
- **Measurement**: Static analysis (JSDoc coverage, Python docstrings, OpenAPI completeness)
- **Target**: ≥80%
- **Threshold**: <80% indicates insufficient documentation (blocks Stage 19 integration testing)

**Recursion Targets**:
1. **Stage 14 (Technical Documentation)**: If docs missing or incomplete
   - Evidence: APIs lack JSDoc comments, architecture diagrams not created
   - Action: Recurse to Stage 14 (substage 14.2 "API Documentation"), regenerate docs, re-run Stage 18
2. **Stage 17 (GTM Strategist)**: If GTM docs incomplete
   - Evidence: Campaign playbooks missing, customer segmentation docs not finalized
   - Action: Recurse to Stage 17 (substage 17.1 "Strategy Configuration"), complete docs, re-run Stage 18

**Automation Logic**:
```sql
-- Trigger query (runs daily via CI/CD)
WITH doc_coverage AS (
  SELECT venture_id,
         COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT /
           NULLIF(COUNT(*), 0) * 100 AS coverage_percentage
  FROM api_endpoints  -- Or components, classes, etc.
  WHERE venture_id = 'VENTURE-001'
  GROUP BY venture_id
)
SELECT venture_id, coverage_percentage
FROM doc_coverage
WHERE coverage_percentage < 80;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 14 or 17
```

**Expected Outcome**:
- Automated recursion to Stage 14 or Stage 17
- Missing documentation generated (API docs, architecture diagrams, GTM docs)
- Documentation coverage raised to ≥80%

**Evidence Mapping**:
- Documentation coverage metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:796 "Documentation coverage"
- Documentation complete gate: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:800 "Documentation complete"

#### Trigger SYNC-003: CI/CD Configuration Recursion

**Condition**: CI/CD pipeline failures >3 consecutive runs after Stage 18 completion

**Metric Definition**:
- **CI/CD Pipeline Status**: Pass/fail status of GitHub Actions workflows
- **Threshold**: >3 consecutive failures indicates systematic issue (not flaky test)
- **Measurement**: GitHub Actions API query

**Recursion Targets**:
1. **Stage 18 (self-recursion, Substage 18.3)**: If CI/CD config errors
   - Evidence: Workflow syntax errors, missing secrets, wrong Node version
   - Action: Re-execute Substage 18.3 (Automation Configuration) with corrected workflow files
2. **Stage 10 (Technical Review)**: If code quality issues cause CI failures
   - Evidence: Linter errors, failing tests, build failures (not config issues)
   - Action: Recurse to Stage 10 for code review, fix issues, re-run Stage 18

**Automation Logic**:
```sql
-- Trigger query (runs hourly via cron)
WITH recent_runs AS (
  SELECT venture_id,
         workflow_name,
         status,
         ROW_NUMBER() OVER (PARTITION BY venture_id, workflow_name ORDER BY run_at DESC) AS run_rank
  FROM cicd_pipeline_runs
  WHERE venture_id = 'VENTURE-001'
    AND run_at >= NOW() - INTERVAL '24 hours'
)
SELECT venture_id,
       workflow_name,
       COUNT(*) AS consecutive_failures
FROM recent_runs
WHERE run_rank <= 3 AND status = 'failure'
GROUP BY venture_id, workflow_name
HAVING COUNT(*) = 3;  -- All 3 recent runs failed

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 18 or 10
```

**Expected Outcome**:
- Automated recursion to Stage 18 (Substage 18.3) or Stage 10
- CI/CD configuration fixed (workflow files corrected) or code issues resolved
- Pipeline returns to passing state

**Evidence Mapping**:
- CI/CD connected gate: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:804 "CI/CD connected"
- Automation configuration substage: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:819-824 "Automation Configuration"

#### Trigger SYNC-004: Version Control Compliance Recursion

**Condition**: Version control compliance <100% (commits without proper messages)

**Metric Definition**:
- **Version Control Compliance**: (Commits with conventional messages / Total commits) × 100%
- **Conventional Commits**: Format `type(scope): description` (e.g., `feat(api): add user endpoint`)
- **Target**: 100%
- **Threshold**: <100% indicates non-compliant commits (audit trail compromised)

**Recursion Targets**:
1. **Stage 18 (self-recursion, Substage 18.2)**: If ContentMigrator agent created non-compliant commits
   - Evidence: Commits with messages like "wip", "fix", "update" (too vague)
   - Action: Rewrite commit history (interactive rebase), fix messages, force push (requires LEAD approval)
2. **Training/Education**: If human committers creating non-compliant commits
   - Evidence: Manual commits after Stage 18 automation
   - Action: No recursion, send training material to team (not workflow issue)

**Automation Logic**:
```sql
-- Trigger query (runs daily via Git hook)
WITH commit_analysis AS (
  SELECT venture_id,
         commit_sha,
         commit_message,
         commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+' AS is_compliant
  FROM git_commits
  WHERE venture_id = 'VENTURE-001'
    AND committed_at >= NOW() - INTERVAL '7 days'
)
SELECT venture_id,
       COUNT(*) FILTER (WHERE is_compliant = true)::FLOAT / NULLIF(COUNT(*), 0) * 100 AS compliance_rate
FROM commit_analysis
GROUP BY venture_id
HAVING COUNT(*) FILTER (WHERE is_compliant = true)::FLOAT / NULLIF(COUNT(*), 0) * 100 < 100;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 18
```

**Expected Outcome**:
- Automated recursion to Stage 18 (Substage 18.2)
- Commit messages rewritten to comply with conventional commits format
- Version control compliance raised to 100%

**Evidence Mapping**:
- Version control compliance metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:797 "Version control compliance"
- Code pushed done_when: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:816 "Code pushed"

#### Trigger SYNC-005: Large File Handling Recursion

**Condition**: Git push rejected due to large file (>100MB) not tracked by Git LFS

**Metric Definition**:
- **Large File Rejection**: GitHub API returns error "file exceeds 100 MB limit"
- **Threshold**: Any large file rejection (0 tolerance)
- **Detection**: Real-time (during Substage 18.2 execution)

**Recursion Targets**:
1. **Stage 18 (self-recursion, Substage 18.2)**: Immediate retry with Git LFS
   - Evidence: File detected as >100MB during push attempt
   - Action: Abort push, run `git lfs track [file]`, re-commit, re-push
2. **External Storage Migration**: If file >2GB (Git LFS limit)
   - Evidence: File size exceeds Git LFS practical limit
   - Action: Upload to S3, store URL in repo, re-commit

**Automation Logic**:
```python
# Real-time detection (in ContentMigrator agent)
def handle_large_file(file_path, file_size):
    if file_size > 100_000_000:  # >100MB
        if file_size < 2_000_000_000:  # <2GB
            # Trigger SYNC-005 recursion: Use Git LFS
            subprocess.run(['git', 'lfs', 'track', file_path])
            return "retry_with_lfs"
        else:
            # Upload to S3, store URL
            url = upload_to_s3(file_path)
            save_url_to_config(url)
            subprocess.run(['git', 'rm', file_path])
            return "migrated_to_s3"
```

**Expected Outcome**:
- Automated recursion within Substage 18.2 (immediate retry, no full stage restart)
- Large file successfully pushed via Git LFS or migrated to external storage
- Sync completeness remains ≥95%

**Evidence Mapping**:
- Assets stored done_when: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:818 "Assets stored"
- Critique weakness: "Missing specific tool integrations" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:25) - this trigger provides Git LFS integration

### Forward Recursion (Stage 18 → Stage 19)

**Trigger**: All exit gates passed + sync completeness ≥95% + documentation coverage ≥80% + CI/CD connected

**Condition**: Normal progression (no errors in Stage 18)

**Action**: Forward-recurse to Stage 19 (Tri-Party Integration Verification)

**Automation Logic**:
```sql
-- Trigger query (runs immediately after Stage 18 validation)
SELECT venture_id
FROM stage_18_completion_status
WHERE sync_completeness >= 95
  AND documentation_coverage >= 80
  AND version_control_compliance = 100
  AND cicd_status = 'active';

-- If returned rows > 0, trigger Stage 19 start (not recursion, normal progression)
```

**Evidence Mapping**:
- Downstream impact: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:59 "Downstream Impact: Stages 19"
- Exit gates: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:803-805 "Repos synchronized, CI/CD connected, Access configured"

## Implementation Requirements

### Database Schema Extensions

```sql
-- Recursion trigger log for Stage 18
CREATE TABLE stage_18_recursion_triggers (
  trigger_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  trigger_type VARCHAR(50),  -- 'SYNC-001', 'SYNC-002', etc.
  trigger_condition TEXT,
  metric_value FLOAT,
  threshold_value FLOAT,
  target_stage INT,  -- 18 (self), 14, 10, or 17
  target_substage VARCHAR(10),  -- '18.2', '18.3', etc. (if self-recursion)
  triggered_at TIMESTAMP DEFAULT NOW(),
  recursion_status VARCHAR(20)  -- 'pending', 'executing', 'completed', 'failed'
);

-- Stage 18 sync metrics (for trigger queries)
CREATE TABLE stage_18_sync_metrics (
  metric_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  total_files INT,
  synced_files INT,
  sync_completeness FLOAT,  -- Calculated: (synced_files / total_files) * 100
  documentation_coverage FLOAT,
  version_control_compliance FLOAT,
  measured_at TIMESTAMP DEFAULT NOW()
);

-- CI/CD pipeline runs (for SYNC-003 trigger)
CREATE TABLE cicd_pipeline_runs (
  run_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  workflow_name VARCHAR(100),
  status VARCHAR(20),  -- 'success', 'failure', 'cancelled'
  run_at TIMESTAMP DEFAULT NOW()
);
```

### Integration with SD-RECURSION-ENGINE-001

**Required API Endpoints**:
1. `POST /api/recursion/trigger`: Initiate recursion
   - Parameters: `venture_id`, `source_stage` (18), `target_stage` (18/14/10/17), `trigger_type` (SYNC-001, etc.), `context_data` (metric values)
   - Response: `recursion_execution_id`

2. `GET /api/recursion/status/{execution_id}`: Check recursion status
   - Response: `status` (pending/executing/completed/failed), `progress_percentage`, `estimated_completion`

3. `POST /api/recursion/approve`: Manual approval gate (if required for destructive operations like force push)
   - Parameters: `execution_id`, `approved_by`, `approval_notes`

**Evidence**: These endpoints enable automated recursion while maintaining EXEC oversight (per EXEC agent responsibilities in Stage 18, EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:18 "Clear ownership (EXEC)").

### Monitoring Dashboard Requirements

**Dashboard: Stage 18 Recursion Health**
- **Metrics**:
  - Recursion trigger count (last 30 days) by type (SYNC-001, SYNC-002, etc.)
  - Most common trigger (identify systematic issues)
  - Average time to recursion completion
  - Recursion success rate (% of executions that resolved the issue)

- **Alerts**:
  - >5 SYNC-001 triggers for same venture in 7 days (persistent sync issues)
  - >3 SYNC-003 triggers in 24 hours (CI/CD fundamentally broken)
  - Recursion execution >4 hours (investigate delays, should be <2 hours)

**Visualization**: Sankey diagram showing recursion flows (Stage 18 → Stage 18, Stage 18 → Stage 14, etc.)

## Testing Strategy

### Unit Tests (per trigger)
1. Test trigger condition detection (mock sync metrics below thresholds)
2. Validate threshold calculations (ensure correct formulas)
3. Test target stage selection logic (SYNC-001 → Stage 18 vs Stage 14)

### Integration Tests (with SD-RECURSION-ENGINE-001)
1. Trigger recursion via API (test POST /api/recursion/trigger)
2. Verify recursion execution starts (check status endpoint)
3. Simulate target stage completion (mock corrected sync metrics)
4. Validate Stage 18 re-execution with fixes

### End-to-End Tests (full recursion cycle)
1. Deploy venture with intentionally large file (>100MB, no Git LFS)
2. Run Stage 18, expect SYNC-005 trigger
3. Verify automated Git LFS configuration
4. Validate successful push with Git LFS
5. Measure sync completeness improvement (should reach ≥95%)

**Evidence**: Testing strategy aligns with substage 18.3 requirement "Testing complete" (implicitly, via CI/CD configuration).

## Success Metrics for Recursion System

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Time to Detect Issue** | <5 minutes | Trigger query execution frequency (immediate post-Stage 18) |
| **Time to Initiate Recursion** | <1 minute | API call latency |
| **Time to Complete Recursion** | <2 hours | End-to-end cycle time (substage re-execution) |
| **Recursion Success Rate** | >95% | % of recursions that resolve issue (raise metric above threshold) |
| **False Positive Rate** | <5% | % of triggered recursions deemed unnecessary by EXEC |

**Evidence**: These targets address critique weakness "Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:63) by automating corrective actions.

## Rollback and Safety Mechanisms

### Recursion Limits
- **Max Recursions per Venture**: 10 per Stage 18 execution (prevent infinite loops)
- **Max Recursive Depth**: 2 levels (Stage 18 → Stage 14 → Stage 18 only, no deeper)
- **Cooldown Period**: 1 hour between recursions to same target stage (avoid thrashing)

### Manual Override
- EXEC agent can:
  1. Pause automated recursion for specific venture (manual fix in progress)
  2. Override trigger thresholds (adjust <95% to <90%, etc., for exceptional cases)
  3. Force recursion to non-standard stage (e.g., Stage 10 when SYNC-001 triggers)
  4. Cancel in-progress recursion (abort if taking too long)

### Rollback Triggers
If recursion WORSENS metrics (e.g., sync completeness drops further after Stage 18 self-recursion):
1. Automatically revert to previous Git commit (stored in `git_commit_snapshots` table)
2. Pause automated recursion for this venture
3. Escalate to EXEC for manual intervention

**Evidence**: Addresses critique weakness "Unclear rollback procedures" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:24).

## Future Enhancements

1. **Predictive Recursion**: Trigger recursion BEFORE metrics fall below thresholds (ML model predicts sync failures based on file count, file size patterns)
2. **Multi-Stage Recursion**: Recurse to multiple stages simultaneously (Stage 14 + Stage 17 in parallel if both docs incomplete)
3. **Recursion Recommendations**: AI suggests optimal target stage based on error logs and historical data
4. **Cross-Venture Learning**: Apply successful recursion patterns from one venture to others (e.g., if SYNC-005 common for video ventures, pre-configure Git LFS)

**Evidence**: These enhancements further automate Stage 18, exceeding the "80% automation" target (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:33).

---

**Implementation Priority**: HIGH (recursion is critical for self-healing sync system)
**Estimated Implementation Time**: 2-3 sprints (4-6 weeks)
**Cross-Reference**: SD-RECURSION-ENGINE-001, 09_metrics-monitoring.md (trigger thresholds), 10_gaps-backlog.md (related SDs)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
