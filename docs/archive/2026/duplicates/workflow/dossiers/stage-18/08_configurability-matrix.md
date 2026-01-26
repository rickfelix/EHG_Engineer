<!-- ARCHIVED: 2026-01-26T16:26:49.018Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-18\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 18: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

## Purpose

This document defines all tunable parameters for Stage 18 (Documentation Sync to GitHub), enabling ventures to customize synchronization behavior based on their specific requirements (tech stack, team size, compliance needs, etc.).

**Key Principle**: Stage 18 should be "configure once, run many times" - parameters set during first execution, then reused for all future ventures with similar profiles.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:826 "Manual → Assisted → Auto (suggested)" - progression requires configurability

## Configuration Categories

### 1. Repository Structure

**Parameter**: `repo_structure_type`
**Type**: Enum
**Options**:
- `monorepo`: Single repository for all code and docs
- `multi-repo`: Separate repositories per service/component
- `hybrid`: Main repo + separate repos for large modules

**Default**: `monorepo`
**When to Change**:
- Use `multi-repo` if venture has >3 services or >10,000 LOC
- Use `hybrid` if one component (e.g., mobile app) needs separate release cycle

**Impact**: Affects folder structure, CI/CD pipeline count, team permissions

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:811 "Structure defined"

---

**Parameter**: `folder_hierarchy`
**Type**: JSON
**Default**:
```json
{
  "root": [".github", "docs", "src", "tests", "scripts"],
  "docs_subfolders": ["architecture", "api", "user-guide"],
  "src_subfolders": ["client", "server", "shared"],
  "tests_subfolders": ["unit", "e2e", "integration"]
}
```

**When to Customize**:
- Add `mobile/` folder for React Native ventures
- Add `ml-models/` folder for AI ventures
- Add `contracts/` folder for blockchain ventures

**Evidence**: Addresses critique weakness "Some ambiguity in requirements" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:7)

---

**Parameter**: `git_ignore_template`
**Type**: String (URL or file path)
**Options**:
- `node`: https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore
- `python`: https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore
- `go`: https://raw.githubusercontent.com/github/gitignore/main/Go.gitignore
- `custom`: Path to venture-specific .gitignore

**Default**: Based on `tech_stack` field from venture metadata
**When to Customize**: Ventures with mixed tech stacks (e.g., Node.js backend + Python ML service)

**Evidence**: Critical for security (prevent committing .env files, secrets)

### 2. Version Control Settings

**Parameter**: `branch_protection_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Solo developer ventures (no PR review needed)
**Impact**: If enabled, requires ≥1 PR approval before merging to `main`

**Evidence**: Best practice for team collaboration, prevents accidental force pushes

---

**Parameter**: `default_branch_name`
**Type**: String
**Options**: `main`, `master`, `develop`
**Default**: `main` (GitHub standard)
**When to Change**: Legacy ventures migrating from `master` branch

**Evidence**: GitHub renamed default branch from `master` to `main` in 2020

---

**Parameter**: `commit_message_format`
**Type**: Enum
**Options**:
- `conventional`: `type(scope): description` (e.g., `feat(api): add user endpoint`)
- `simple`: Any descriptive message
- `ticket`: `[TICKET-123] description` (Jira integration)

**Default**: `conventional` (aligns with version control compliance metric)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:797 "Version control compliance"

---

**Parameter**: `git_lfs_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Ventures with no large files (all files <50MB)
**Impact**: If enabled, automatically tracks files >50MB with Git LFS

**Evidence**: Addresses critique scenario "Large file handling" (see 07_recursion-blueprint.md, SYNC-005)

---

**Parameter**: `git_lfs_track_patterns`
**Type**: Array of strings (glob patterns)
**Default**: `["*.mp4", "*.zip", "*.psd", "*.pdf"]`
**When to Customize**: Add venture-specific large file types (e.g., `*.pkl` for ML models, `*.db` for SQLite)

**Evidence**: Git LFS tracking configuration for large assets

### 3. CI/CD Configuration

**Parameter**: `ci_workflows`
**Type**: Array of enum
**Options**: `ci`, `deploy-docs`, `release`, `security-scan`, `performance-test`
**Default**: `["ci", "deploy-docs"]` (minimal setup)
**When to Customize**:
- Add `release` for automated versioning (Stage 20+)
- Add `security-scan` for compliance-heavy ventures (HIPAA, SOC 2)
- Add `performance-test` for high-traffic ventures (load testing)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:823 "CI/CD configured"

---

**Parameter**: `ci_build_command`
**Type**: String
**Default**: Based on `tech_stack`:
- Node.js: `npm run build`
- Python: `python setup.py build`
- Go: `go build`

**When to Customize**: Custom build scripts (e.g., `npm run build:prod`)

**Evidence**: Required for GitHub Actions CI workflow (see 05_professional-sop.md, Step 3.2)

---

**Parameter**: `ci_test_command`
**Type**: String
**Default**: Based on `tech_stack`:
- Node.js: `npm test`
- Python: `pytest`
- Go: `go test ./...`

**When to Customize**: Custom test runners (e.g., `npm run test:ci` with code coverage)

**Evidence**: CI pipeline validation (see 05_professional-sop.md, Step 3.2)

---

**Parameter**: `ci_node_version`
**Type**: String
**Default**: `"18"` (LTS as of 2025)
**Options**: `"16"`, `"18"`, `"20"`, `"22"`
**When to Customize**: Ventures locked to older Node versions (legacy dependencies)

**Evidence**: GitHub Actions `setup-node` action parameter

---

**Parameter**: `ci_timeout_minutes`
**Type**: Integer
**Default**: `30`
**Range**: 5-360 (GitHub Actions max 6 hours)
**When to Customize**: Increase for large test suites or slow builds (e.g., 60 minutes for E2E tests)

**Evidence**: Prevents CI hanging indefinitely on errors

---

**Parameter**: `docs_deploy_target`
**Type**: Enum
**Options**:
- `github-pages`: Deploy to `https://[org].github.io/[repo]`
- `netlify`: Deploy to Netlify (requires API key)
- `vercel`: Deploy to Vercel (requires API key)
- `custom`: Custom deployment script

**Default**: `github-pages` (free, no setup required)
**When to Change**: Ventures with custom domains or specific hosting requirements

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:791 "Documentation site"

---

**Parameter**: `docs_site_generator`
**Type**: Enum
**Options**:
- `docusaurus`: React-based, best for API docs
- `mkdocs`: Python-based, best for technical guides
- `vuepress`: Vue-based, best for component libraries
- `none`: No docs site (just raw Markdown)

**Default**: `docusaurus` (most popular for SaaS ventures)
**When to Change**: Match venture tech stack (use `mkdocs` for Python ventures)

**Evidence**: Addresses critique weakness "Missing specific tool integrations" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:25)

### 4. Access Control

**Parameter**: `repo_visibility`
**Type**: Enum
**Options**: `private`, `public`, `internal` (GitHub Enterprise only)
**Default**: `private`
**When to Change**: Open-source ventures (requires LEAD approval)

**Evidence**: Security best practice (default to private)

---

**Parameter**: `team_permissions`
**Type**: JSON (map of team name → role)
**Default**:
```json
{
  "LEAD-Team": "admin",
  "EXEC-Team": "write",
  "PLAN-Team": "write",
  "Contractors": "read"
}
```

**When to Customize**: Different org structures, client-specific access requirements

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:812 "Permissions set"

---

**Parameter**: `require_2fa`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Never (security requirement)

**Evidence**: Best practice for access control, prevents account takeovers

---

**Parameter**: `external_collaborators`
**Type**: Array of objects
**Default**: `[]`
**Format**:
```json
[
  {"username": "client-user", "role": "read", "expires_at": "2025-12-31"},
  {"username": "freelancer", "role": "write", "expires_at": "2025-06-30"}
]
```

**When to Use**: Temporary access for clients, freelancers, auditors

**Evidence**: Access configured gate (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:805)

### 5. Webhook Configuration

**Parameter**: `webhooks_enabled`
**Type**: Boolean
**Default**: `false` (only enable if external integrations exist)
**When to Enable**: Ventures with external CI/CD (CircleCI), deployment services (Heroku), or monitoring (Sentry)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:822 "Webhooks set"

---

**Parameter**: `webhook_configs`
**Type**: Array of objects
**Default**: `[]`
**Format**:
```json
[
  {
    "name": "deploy-staging",
    "url": "https://deploy.example.com/webhook",
    "secret": "WEBHOOK_SECRET_ENV_VAR",
    "events": ["push"],
    "branches": ["main"]
  }
]
```

**When to Customize**: Add webhooks for Slack notifications, Jira issue creation, deployment triggers

**Evidence**: Webhook configuration for external integrations

---

**Parameter**: `webhook_retry_count`
**Type**: Integer
**Default**: `3`
**Range**: 1-5
**When to Customize**: Increase for unreliable webhook endpoints (e.g., 5 retries for flaky staging server)

**Evidence**: Webhook delivery reliability configuration

### 6. Sync Behavior

**Parameter**: `sync_mode`
**Type**: Enum
**Options**:
- `full`: Sync all files on every run
- `incremental`: Only sync changed files (faster)
- `selective`: Only sync specified folders (e.g., just `docs/`)

**Default**: `full` (safest, ensures complete sync)
**When to Change**: Use `incremental` for large repos (>10,000 files) to save time

**Evidence**: Optimization for sync performance

---

**Parameter**: `sync_completeness_threshold`
**Type**: Float (percentage)
**Default**: `95.0`
**Range**: 80.0-100.0
**When to Customize**: Lower to 90% for ventures with many excluded files (.gitignore extensive)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:795 "Sync completeness"

---

**Parameter**: `documentation_coverage_threshold`
**Type**: Float (percentage)
**Default**: `80.0`
**Range**: 50.0-100.0
**When to Customize**: Increase to 90% for API-heavy ventures (require comprehensive docs)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:796 "Documentation coverage"

---

**Parameter**: `excluded_file_patterns`
**Type**: Array of strings (glob patterns)
**Default**: `[".env*", "node_modules/**", "*.log", ".DS_Store"]`
**When to Customize**: Add venture-specific exclusions (e.g., `*.pyc` for Python, `target/**` for Rust)

**Evidence**: Files intentionally excluded from sync (don't count against sync completeness)

---

**Parameter**: `large_file_handling`
**Type**: Enum
**Options**:
- `git-lfs`: Use Git LFS for files >50MB
- `external-storage`: Upload to S3, store URLs in repo
- `fail`: Reject large files (strict policy)

**Default**: `git-lfs`
**When to Change**: Use `external-storage` for files >2GB (Git LFS limit)

**Evidence**: Addresses critique scenario "Large files (>100MB)" (see 03_canonical-definition.md)

### 7. Automation Settings

**Parameter**: `automation_mode`
**Type**: Enum
**Options**: `manual`, `assisted`, `auto`
**Default**: `manual` (current state)
**Target**: `auto` (80% automation)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:826 "Manual → Assisted → Auto (suggested)"

**Mode Definitions**:
- **Manual**: Human executes all substages via 05_professional-sop.md
- **Assisted**: Scripts automate substages, human approves each step
- **Auto**: DocSyncCrew (../stage-25/06_agent-orchestration.md) executes end-to-end

**When to Change**: Progress from `manual` → `assisted` after 5 successful manual executions, then `assisted` → `auto` after 10 successful assisted executions

---

**Parameter**: `recursion_enabled`
**Type**: Boolean
**Default**: `false` (not implemented yet)
**When to Enable**: After SD-RECURSION-ENGINE-001 implementation (see 07_recursion-blueprint.md)

**Evidence**: Future enhancement for self-healing sync

---

**Parameter**: `auto_retry_count`
**Type**: Integer
**Default**: `3`
**Range**: 1-5
**When to Customize**: Increase for flaky networks (e.g., 5 retries for ventures with slow internet)

**Evidence**: Retry logic for transient errors (network timeouts, GitHub API rate limits)

---

**Parameter**: `parallel_upload_enabled`
**Type**: Boolean
**Default**: `false`
**When to Enable**: Ventures with >5,000 files (parallel upload saves 40% time)
**Risk**: More complex error handling (some files may fail while others succeed)

**Evidence**: Performance optimization for large repos

### 8. Metrics and Monitoring

**Parameter**: `metrics_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Never (metrics required for exit gates)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:794-797 "Sync completeness, Documentation coverage, Version control compliance"

---

**Parameter**: `metrics_collection_frequency`
**Type**: Enum
**Options**: `immediate`, `hourly`, `daily`
**Default**: `immediate` (collect right after Stage 18 execution)
**When to Change**: Use `hourly` or `daily` for ongoing monitoring (post-Stage 18)

**Evidence**: See 09_metrics-monitoring.md for SQL queries

---

**Parameter**: `alerting_thresholds`
**Type**: JSON
**Default**:
```json
{
  "sync_completeness_warning": 90.0,
  "sync_completeness_critical": 85.0,
  "documentation_coverage_warning": 70.0,
  "documentation_coverage_critical": 60.0,
  "ci_failure_count_critical": 3
}
```

**When to Customize**: Tighten thresholds for critical ventures (e.g., warning at 95% instead of 90%)

**Evidence**: Alerting configuration for recursion triggers (see 07_recursion-blueprint.md)

---

**Parameter**: `dashboard_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Never (dashboard required for monitoring)

**Evidence**: Monitoring dashboard (see 09_metrics-monitoring.md)

### 9. Compliance and Security

**Parameter**: `secret_scanning_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Never (prevent committing API keys, passwords)

**Evidence**: Security best practice, addresses critique weakness "Standard security requirements" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:13)

---

**Parameter**: `pre_commit_hooks`
**Type**: Array of strings
**Options**: `secret-scan`, `linter`, `format`, `test`, `commit-msg`
**Default**: `["secret-scan", "commit-msg"]` (security + conventional commits)
**When to Customize**: Add `linter` for code quality enforcement, `test` for test-driven development

**Evidence**: Git hooks for automated validation

---

**Parameter**: `compliance_mode`
**Type**: Enum
**Options**: `standard`, `hipaa`, `soc2`, `gdpr`
**Default**: `standard`
**When to Change**: Ventures in regulated industries (healthcare, finance)

**Evidence**: Compliance-specific configuration (e.g., HIPAA requires encryption at rest, audit logs)

**Impact**:
- `hipaa`: Requires GitHub Enterprise, private repos, audit logging enabled
- `soc2`: Requires branch protection, 2FA, access review every 90 days
- `gdpr`: Requires PII scanning in docs, data retention policies

---

**Parameter**: `audit_logging_enabled`
**Type**: Boolean
**Default**: `true`
**When to Disable**: Never (audit logs required for compliance)

**Evidence**: Git commit logs serve as audit trail

### 10. Rollback Configuration

**Parameter**: `rollback_enabled`
**Type**: Boolean
**Default**: `false` (not implemented yet)
**When to Enable**: After SD-ROLLBACK-PROCEDURES-001 implementation

**Evidence**: Addresses critique weakness "Unclear rollback procedures" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:24)

---

**Parameter**: `rollback_trigger`
**Type**: Enum
**Options**: `manual`, `automatic`, `metric-based`
**Default**: `manual` (EXEC decides when to rollback)
**When to Change**: Use `metric-based` after testing (e.g., rollback if sync completeness drops >10%)

**Evidence**: Future enhancement for automated rollback

---

**Parameter**: `snapshot_frequency`
**Type**: Enum
**Options**: `per-substage`, `per-stage`, `per-commit`
**Default**: `per-stage` (snapshot before Stage 18 starts)
**When to Change**: Use `per-substage` for critical ventures (enable rollback to 18.1, 18.2, or 18.3)

**Evidence**: Git tag creation for rollback points

## Configuration Profiles

**Venture-Type Profiles** (presets for common venture types):

### Profile 1: Standard SaaS Venture
```json
{
  "repo_structure_type": "monorepo",
  "ci_workflows": ["ci", "deploy-docs"],
  "docs_site_generator": "docusaurus",
  "automation_mode": "assisted",
  "sync_completeness_threshold": 95.0,
  "documentation_coverage_threshold": 80.0
}
```

### Profile 2: Open-Source Venture
```json
{
  "repo_structure_type": "monorepo",
  "repo_visibility": "public",
  "ci_workflows": ["ci", "deploy-docs", "release"],
  "docs_site_generator": "docusaurus",
  "automation_mode": "auto",
  "sync_completeness_threshold": 98.0,
  "documentation_coverage_threshold": 90.0
}
```

### Profile 3: Enterprise Compliance Venture
```json
{
  "repo_structure_type": "multi-repo",
  "compliance_mode": "soc2",
  "ci_workflows": ["ci", "deploy-docs", "security-scan"],
  "require_2fa": true,
  "branch_protection_enabled": true,
  "audit_logging_enabled": true,
  "automation_mode": "assisted",
  "sync_completeness_threshold": 99.0,
  "documentation_coverage_threshold": 95.0
}
```

### Profile 4: AI/ML Venture
```json
{
  "repo_structure_type": "hybrid",
  "git_lfs_enabled": true,
  "git_lfs_track_patterns": ["*.pkl", "*.h5", "*.onnx", "*.pth"],
  "large_file_handling": "external-storage",
  "ci_workflows": ["ci", "deploy-docs", "performance-test"],
  "automation_mode": "assisted",
  "sync_completeness_threshold": 90.0,
  "documentation_coverage_threshold": 85.0
}
```

## Configuration Storage

**Database Table** (venture-specific configurations):
```sql
CREATE TABLE stage_18_configs (
  config_id UUID PRIMARY KEY,
  venture_id VARCHAR(50) UNIQUE,
  config_json JSONB,  -- All parameters as JSON
  profile_name VARCHAR(50),  -- 'Standard SaaS', 'Open-Source', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Query Configuration**:
```sql
SELECT config_json
FROM stage_18_configs
WHERE venture_id = 'VENTURE-001';
```

## Configuration Validation

**Validation Rules** (enforced before Stage 18 execution):
1. `sync_completeness_threshold` must be 80-100
2. `documentation_coverage_threshold` must be 50-100
3. `ci_timeout_minutes` must be 5-360
4. If `repo_visibility = 'public'`, require LEAD approval
5. If `compliance_mode != 'standard'`, require specific GitHub plan (Enterprise for HIPAA)

**Validation Script** (pseudocode):
```python
def validate_config(config):
    errors = []
    if not 80 <= config['sync_completeness_threshold'] <= 100:
        errors.append("sync_completeness_threshold out of range")
    if config['repo_visibility'] == 'public' and not config['lead_approved']:
        errors.append("Public repo requires LEAD approval")
    # ... more validations
    return errors
```

---

**Next Steps**: Proceed to 09_metrics-monitoring.md for SQL queries and alerting configuration.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
