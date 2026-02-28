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
- [Purpose](#purpose)
- [Scoring Rubric](#scoring-rubric)
- [Criterion 1: Entry Gates Satisfied (15 points)](#criterion-1-entry-gates-satisfied-15-points)
- [Criterion 2: Substage 18.1 Completion (15 points)](#criterion-2-substage-181-completion-15-points)
- [Criterion 3: Substage 18.2 Completion (15 points)](#criterion-3-substage-182-completion-15-points)
- [Criterion 4: Substage 18.3 Completion (15 points)](#criterion-4-substage-183-completion-15-points)
- [Criterion 5: Exit Gates Satisfied (15 points)](#criterion-5-exit-gates-satisfied-15-points)
- [Criterion 6: Metrics Achieved (15 points)](#criterion-6-metrics-achieved-15-points)
- [Criterion 7: Handoff Document Created (10 points)](#criterion-7-handoff-document-created-10-points)
- [Criterion 8: No Critical Issues (10 points)](#criterion-8-no-critical-issues-10-points)
- [Overall Score Calculation](#overall-score-calculation)
- [Example Score Calculation](#example-score-calculation)
- [Common Failure Scenarios](#common-failure-scenarios)
  - [Scenario 1: Sync Completeness <95% (Criterion 3 fails)](#scenario-1-sync-completeness-95-criterion-3-fails)
  - [Scenario 2: CI/CD Failing (Criterion 4 fails)](#scenario-2-cicd-failing-criterion-4-fails)
  - [Scenario 3: Secrets Committed (Criterion 8 fails)](#scenario-3-secrets-committed-criterion-8-fails)
- [Automation Opportunity](#automation-opportunity)
- [Conclusion](#conclusion)

<!-- ARCHIVED: 2026-01-26T16:26:55.847Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-18\11_acceptance-checklist.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 18: Acceptance Checklist


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, migration

## Purpose

This checklist provides objective, quantifiable criteria for validating Stage 18 (Documentation Sync to GitHub) completion. All 8 criteria must score ≥85/100 for Stage 18 to be considered complete and Stage 19 to begin.

**Target Score**: 100/100 (aiming high to maintain quality)
**Pass Threshold**: ≥85/100 (minimum acceptable)

**Evidence**: Scoring methodology consistent with Stage 17 dossier pattern.

## Scoring Rubric

**Scale**:
- **15 points**: Criterion fully met, exceeds expectations
- **10 points**: Criterion met, meets expectations
- **5 points**: Criterion partially met, acceptable with caveats
- **0 points**: Criterion not met, blocks Stage 18 completion

## Criterion 1: Entry Gates Satisfied (15 points)

**Validation**: Verify both entry gates passed before Stage 18 execution began.

**Entry Gate 1: Documentation Complete**
- [ ] README.md exists (venture overview)
- [ ] API documentation exists (OpenAPI spec or JSDoc/docstrings)
- [ ] Architecture diagrams exist (system design, database schema)
- [ ] User guides exist (customer-facing documentation)
- [ ] GTM strategy docs exist (from Stage 17)

**Entry Gate 2: Code Ready**
- [ ] Code passes linting (0 errors)
- [ ] Code builds successfully (no syntax errors)
- [ ] All tests pass (unit + integration)
- [ ] No uncommitted changes (working tree clean)

**Scoring**:
- 15 points: Both gates fully satisfied (all checkboxes ✓)
- 10 points: Both gates mostly satisfied (1-2 missing items)
- 5 points: One gate satisfied, one gate partially satisfied
- 0 points: Either gate failed

**SQL Verification**:
```sql
SELECT venture_id,
       stage_17_status,  -- Must be 'completed' (docs from Stage 17)
       stage_18_entry_gate_1_passed,
       stage_18_entry_gate_2_passed
FROM ventures
WHERE venture_id = 'VENTURE-001';
-- Expected: both gates = true
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:799-802 "Documentation complete, Code ready"

## Criterion 2: Substage 18.1 Completion (15 points)

**Validation**: Repository setup completed per substage 18.1 done_when conditions.

**Done When**:
- [ ] Repos created (GitHub repository exists, accessible via URL)
- [ ] Structure defined (folder hierarchy created: .github/, docs/, src/, tests/)
- [ ] Permissions set (team members have correct roles: LEAD=admin, EXEC=write)

**Scoring**:
- 15 points: All 3 conditions met
- 10 points: 2 conditions met
- 5 points: 1 condition met
- 0 points: 0 conditions met

**Manual Verification**:
```bash
# Check repo exists
curl -I https://github.com/EHG-Ventures/VENTURE-001
# Expected: HTTP 200 OK

# Check folder structure
git clone https://github.com/EHG-Ventures/VENTURE-001
tree -L 2 VENTURE-001/
# Expected: .github/, docs/, src/, tests/ folders exist

# Check permissions
gh api repos/EHG-Ventures/VENTURE-001/collaborators
# Expected: LEAD team = admin, EXEC team = write
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:810-812 "Repos created, Structure defined, Permissions set"

## Criterion 3: Substage 18.2 Completion (15 points)

**Validation**: Content migration completed per substage 18.2 done_when conditions.

**Done When**:
- [ ] Code pushed (all source code committed to Git, commit SHA recorded)
- [ ] Docs uploaded (documentation files synced to GitHub)
- [ ] Assets stored (images, videos, binaries uploaded or linked via Git LFS)

**Scoring**:
- 15 points: All 3 conditions met + sync completeness ≥98%
- 10 points: All 3 conditions met + sync completeness ≥95%
- 5 points: 2 conditions met + sync completeness ≥90%
- 0 points: <2 conditions met or sync completeness <90%

**SQL Verification**:
```sql
SELECT venture_id,
       sync_completeness,
       total_files,
       synced_files
FROM stage_18_sync_metrics
WHERE venture_id = 'VENTURE-001'
ORDER BY measured_at DESC
LIMIT 1;
-- Expected: sync_completeness ≥95%
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:816-818 "Code pushed, Docs uploaded, Assets stored"

## Criterion 4: Substage 18.3 Completion (15 points)

**Validation**: Automation configuration completed per substage 18.3 done_when conditions.

**Done When**:
- [ ] Webhooks set (if applicable, webhooks configured for external integrations)
- [ ] CI/CD configured (GitHub Actions workflows exist, at least 1 successful run)
- [ ] Sync automated (documentation site auto-deploys on commit)

**Scoring**:
- 15 points: All 3 conditions met + CI/CD pipeline passing
- 10 points: All 3 conditions met (CI/CD exists but may have warnings)
- 5 points: 2 conditions met (CI/CD configured but not tested)
- 0 points: <2 conditions met

**Manual Verification**:
```bash
# Check CI/CD workflows exist
ls .github/workflows/
# Expected: ci.yml, deploy-docs.yml (minimum)

# Check latest CI run status
gh run list --repo EHG-Ventures/VENTURE-001 --limit 1
# Expected: status = completed, conclusion = success

# Check docs site deployed
curl -I https://ehg-ventures.github.io/VENTURE-001
# Expected: HTTP 200 OK
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:822-824 "Webhooks set, CI/CD configured, Sync automated"

## Criterion 5: Exit Gates Satisfied (15 points)

**Validation**: Verify all 3 exit gates passed after Stage 18 execution completed.

**Exit Gate 1: Repos Synchronized**
- [ ] Sync completeness ≥95% (per SQL query in Criterion 3)

**Exit Gate 2: CI/CD Connected**
- [ ] At least 1 successful CI/CD workflow run (per manual verification in Criterion 4)

**Exit Gate 3: Access Configured**
- [ ] All team members can clone repo (manual test with 3 team members)

**Scoring**:
- 15 points: All 3 gates passed
- 10 points: 2 gates passed
- 5 points: 1 gate passed
- 0 points: 0 gates passed

**SQL Verification**:
```sql
SELECT venture_id,
       stage_18_exit_gate_1_passed AS repos_synchronized,
       stage_18_exit_gate_2_passed AS cicd_connected,
       stage_18_exit_gate_3_passed AS access_configured
FROM ventures
WHERE venture_id = 'VENTURE-001';
-- Expected: all gates = true
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:803-805 "Repos synchronized, CI/CD connected, Access configured"

## Criterion 6: Metrics Achieved (15 points)

**Validation**: All 3 Stage 18 metrics meet or exceed targets.

**Metric 1: Sync Completeness**
- Target: ≥95%
- Actual: __________% (from SQL query in Criterion 3)

**Metric 2: Documentation Coverage**
- Target: ≥80%
- Actual: __________% (from SQL query below)

**Metric 3: Version Control Compliance**
- Target: 100%
- Actual: __________% (from SQL query below)

**SQL Queries**:
```sql
-- Documentation coverage
SELECT ROUND((COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS coverage_pct
FROM api_components
WHERE venture_id = 'VENTURE-001';
-- Expected: ≥80%

-- Version control compliance (last 7 days)
SELECT ROUND((COUNT(*) FILTER (WHERE commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+')::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS compliance_pct
FROM git_commits
WHERE venture_id = 'VENTURE-001'
  AND committed_at >= CURRENT_DATE - INTERVAL '7 days';
-- Expected: 100%
```

**Scoring**:
- 15 points: All 3 metrics meet targets
- 10 points: 2 metrics meet targets
- 5 points: 1 metric meets target
- 0 points: 0 metrics meet targets

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:794-797 "Sync completeness, Documentation coverage, Version control compliance"

## Criterion 7: Handoff Document Created (10 points)

**Validation**: Stage 18 → Stage 19 handoff document exists and contains all required information.

**Required Sections**:
- [ ] Completion summary (venture ID, completed by, date, execution time)
- [ ] Outputs delivered (GitHub repo URL, docs site URL, CI/CD pipelines)
- [ ] Metrics achieved (sync completeness, docs coverage, VC compliance)
- [ ] Exit gates passed (checklist: repos synchronized, CI/CD connected, access configured)
- [ ] Next stage readiness (Stage 19 can begin, repo URLs provided)
- [ ] Issues/risks (any problems encountered during Stage 18)

**Scoring**:
- 10 points: Handoff document complete (all 6 sections present)
- 5 points: Handoff document incomplete (1-2 sections missing)
- 0 points: Handoff document missing

**File Location**: `/ventures/VENTURE-001/handoffs/stage-18-handoff.md`

**Evidence**: See 05_professional-sop.md, Post-Execution Tasks

## Criterion 8: No Critical Issues (10 points)

**Validation**: No unresolved critical issues or blockers from Stage 18 execution.

**Critical Issues** (any of these result in 0 points):
- [ ] Secrets committed to Git (API keys, passwords in commit history)
- [ ] Broken CI/CD (all workflows failing, no successful runs in 24 hours)
- [ ] GitHub repo inaccessible (permission errors, deleted repo)
- [ ] Sync completeness <85% (too many missing files)
- [ ] Documentation site down (404 error on docs URL)

**Scoring**:
- 10 points: No critical issues (all checkboxes unchecked)
- 0 points: Any critical issue present (any checkbox checked)

**Verification**:
```bash
# Check for secrets in Git history
git log --all --pretty=format: --name-only | grep -E '\.env$|credentials'
# Expected: empty output (no .env or credentials files)

# Check CI/CD status
gh run list --repo EHG-Ventures/VENTURE-001 --limit 10 | grep -E 'failure|cancelled'
# Expected: <3 failures (acceptable flakiness)

# Check repo accessible
curl -I https://github.com/EHG-Ventures/VENTURE-001
# Expected: HTTP 200 OK

# Check docs site accessible
curl -I https://ehg-ventures.github.io/VENTURE-001
# Expected: HTTP 200 OK
```

**Evidence**: Security best practices, operational health checks

## Overall Score Calculation

**Total Points**: Sum of all 8 criteria

| Criterion | Max Points | Actual Points | Notes |
|-----------|------------|---------------|-------|
| 1. Entry Gates Satisfied | 15 | __________ | |
| 2. Substage 18.1 Completion | 15 | __________ | |
| 3. Substage 18.2 Completion | 15 | __________ | |
| 4. Substage 18.3 Completion | 15 | __________ | |
| 5. Exit Gates Satisfied | 15 | __________ | |
| 6. Metrics Achieved | 15 | __________ | |
| 7. Handoff Document Created | 10 | __________ | |
| 8. No Critical Issues | 10 | __________ | |
| **TOTAL** | **110** | **__________** | |

**Normalized Score**: (Actual Points / 110) × 100 = __________/100

**Pass/Fail Determination**:
- **Pass**: Score ≥85/100 → Stage 18 complete, Stage 19 can begin
- **Conditional Pass**: Score 70-84/100 → Stage 18 complete with caveats, address issues in parallel with Stage 19
- **Fail**: Score <70/100 → Stage 18 incomplete, must remediate issues before Stage 19

## Example Score Calculation

**Scenario**: Standard SaaS venture, manual execution, all gates passed

| Criterion | Max Points | Actual Points | Notes |
|-----------|------------|---------------|-------|
| 1. Entry Gates Satisfied | 15 | 15 | Both gates fully met |
| 2. Substage 18.1 Completion | 15 | 15 | Repo created, structured, permissions set |
| 3. Substage 18.2 Completion | 15 | 15 | Sync completeness 98.5% |
| 4. Substage 18.3 Completion | 15 | 15 | CI/CD passing, docs deployed |
| 5. Exit Gates Satisfied | 15 | 15 | All 3 gates passed |
| 6. Metrics Achieved | 15 | 15 | Sync 98.5%, Docs 85%, VC 100% |
| 7. Handoff Document Created | 10 | 10 | Complete handoff document |
| 8. No Critical Issues | 10 | 10 | No secrets, CI working, site live |
| **TOTAL** | **110** | **110** | |

**Normalized Score**: (110 / 110) × 100 = **100/100** → **PASS** ✓

## Common Failure Scenarios

### Scenario 1: Sync Completeness <95% (Criterion 3 fails)

**Problem**: Only 92% of files synced (8% missing)

**Score Impact**:
- Criterion 3: 5 points (instead of 15)
- Criterion 5: 10 points (instead of 15, Exit Gate 1 fails)
- **Total**: 100 points (instead of 110)
- **Normalized**: 90.9/100 → **PASS** (but close to threshold)

**Remediation**:
1. Identify missing files: `git status`, compare local vs. remote
2. Push missing files: `git add [missing-files] && git commit && git push`
3. Re-run Criterion 3 validation

### Scenario 2: CI/CD Failing (Criterion 4 fails)

**Problem**: GitHub Actions workflow fails (test failures)

**Score Impact**:
- Criterion 4: 5 points (instead of 15, CI/CD configured but not passing)
- Criterion 5: 10 points (instead of 15, Exit Gate 2 fails)
- **Total**: 100 points (instead of 110)
- **Normalized**: 90.9/100 → **PASS** (but requires fix)

**Remediation**:
1. Check workflow logs: `gh run view [run-id] --log`
2. Fix failing tests or build issues
3. Re-run workflow: `gh workflow run ci.yml`
4. Re-validate Criterion 4

### Scenario 3: Secrets Committed (Criterion 8 fails)

**Problem**: `.env` file accidentally committed (contains API key)

**Score Impact**:
- Criterion 8: 0 points (instead of 10, critical issue present)
- **Total**: 100 points (instead of 110)
- **Normalized**: 90.9/100 → **PASS** (but MUST remediate immediately)

**Remediation**:
1. Remove secret from Git history: `git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env" --prune-empty --tag-name-filter cat -- --all`
2. Force push: `git push --force origin main` (requires LEAD approval)
3. Rotate compromised API key
4. Add `.env` to `.gitignore`
5. Re-validate Criterion 8

## Automation Opportunity

**Future Enhancement**: Automate this checklist via SyncValidator agent (see 06_agent-orchestration.md).

**Implementation**:
- SyncValidator queries database for all 8 criteria
- Auto-generates completion report (JSON)
- Stores in database: `stage_18_acceptance_results` table
- Displays on dashboard: "Stage 18 Acceptance Score: 100/100 ✓"

**Benefit**: Eliminate manual checklist execution (save 30-60 minutes per venture)

## Conclusion

This checklist provides objective, quantifiable criteria for Stage 18 completion. All criteria are based on the canonical stages.yaml definition and critique analysis, ensuring consistent, repeatable validation.

**Target Score**: 100/100 (aim for perfection)
**Pass Threshold**: ≥85/100 (minimum acceptable, same as Stage 17 dossier)

---

**Stage 18 Dossier Complete**: All 11 files generated.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
