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
- [Agent Crew Overview](#agent-crew-overview)
  - [Crew Composition](#crew-composition)
- [Agent 1: RepositoryManager](#agent-1-repositorymanager)
  - [Role Definition](#role-definition)
  - [Responsibilities](#responsibilities)
  - [Tools](#tools)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Decision Logic](#decision-logic)
  - [Error Handling](#error-handling)
- [Agent 2: ContentMigrator](#agent-2-contentmigrator)
  - [Role Definition](#role-definition)
  - [Responsibilities](#responsibilities)
  - [Tools](#tools)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Decision Logic](#decision-logic)
  - [Error Handling](#error-handling)
- [Agent 3: CICDConfigurator](#agent-3-cicdconfigurator)
  - [Role Definition](#role-definition)
  - [Responsibilities](#responsibilities)
  - [Tools](#tools)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Decision Logic](#decision-logic)
  - [Error Handling](#error-handling)
- [Agent 4: SyncValidator](#agent-4-syncvalidator)
  - [Role Definition](#role-definition)
  - [Responsibilities](#responsibilities)
  - [Tools](#tools)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Decision Logic](#decision-logic)
  - [Error Handling](#error-handling)
- [Crew Process Flow](#crew-process-flow)
- [Integration with SD-CREWAI-ARCHITECTURE-001](#integration-with-sd-crewai-architecture-001)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Future Enhancements](#future-enhancements)

<!-- ARCHIVED: 2026-01-26T16:26:45.280Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-18\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 18: Agent Orchestration


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, migration, rls

## Purpose

This document defines the multi-agent architecture for automating Stage 18 (Documentation Sync to GitHub) using CrewAI. The **DocSyncCrew** orchestrates 4 specialized agents to execute the 3 substages with minimal human intervention.

**Target Automation**: 80% (from current 20% manual execution)
**Framework**: CrewAI (multi-agent orchestration)
**Registry**: SD-CREWAI-ARCHITECTURE-001 (central agent registry)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:33 "Target State: 80% automation"

## Agent Crew Overview

**Crew Name**: DocSyncCrew
**Purpose**: Automate GitHub repository synchronization, content migration, and CI/CD configuration
**Process Type**: Sequential (agents execute in order, each depends on previous agent's output)
**Estimated Execution Time**: 2-4 hours (vs. 9-18 hours manual)

### Crew Composition

| Agent | Role | Substage | Tools | Output |
|-------|------|----------|-------|--------|
| RepositoryManager | Repo setup | 18.1 | GitHub API, Terraform | Repo URL, structure config |
| ContentMigrator | Content sync | 18.2 | Git CLI, Git LFS | Commit SHA, sync report |
| CICDConfigurator | Automation | 18.3 | GitHub Actions, YAML | Workflow files, webhook config |
| SyncValidator | Validation | All | SQL, GitHub API | Metrics report, exit gate status |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:807-824 "Repository Setup, Content Migration, Automation Configuration"

## Agent 1: RepositoryManager

### Role Definition

**Role**: GitHub Repository Setup Specialist
**Goal**: Create and configure GitHub repositories with correct structure and permissions
**Backstory**: Expert in GitHub organization management, repository architecture, and access control. Has automated 100+ repository setups.

### Responsibilities

**Substage 18.1 Execution**:
1. Create GitHub organization (if needed)
2. Create repository with venture-specific configuration
3. Define folder structure (docs/, src/, tests/, etc.)
4. Set team permissions (admin, write, read roles)
5. Configure branch protection rules (require PR reviews on main)
6. Initialize .gitignore and .gitattributes

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:810-812 "Repos created, Structure defined, Permissions set"

### Tools

**Tool 1: GitHub REST API Client**
- **Purpose**: Create repos, set permissions, configure webhooks
- **Library**: `octokit` (JavaScript) or `PyGithub` (Python)
- **Authentication**: Personal Access Token (PAT) with `repo`, `admin:org` scopes

**Tool 2: Terraform GitHub Provider**
- **Purpose**: Infrastructure-as-code for repeatable repo setup
- **Configuration**: `github_repository`, `github_team_repository` resources
- **Benefit**: Version-controlled repo configuration

**Tool 3: Folder Structure Generator**
- **Purpose**: Create standardized folder hierarchy
- **Implementation**: Bash script or Python script
- **Template**: Venture-specific (Node.js vs. Python vs. Go)

### Inputs

**From PLAN Agent** (Stage 18 initiation):
1. Venture ID (e.g., "VENTURE-001")
2. Venture name (e.g., "ai-resume-builder")
3. Repository visibility (private/public)
4. Team member list with roles

**From Database** (venture metadata):
```sql
SELECT venture_name, tech_stack, team_members
FROM ventures
WHERE venture_id = 'VENTURE-001';
```

### Outputs

**To ContentMigrator Agent**:
1. **Repository URL**: `https://github.com/EHG-Ventures/venture-name`
2. **Clone command**: `git clone https://github.com/EHG-Ventures/venture-name.git`
3. **Folder structure config**: JSON describing expected folders
   ```json
   {
     "folders": [".github/workflows", "docs", "src", "tests", "scripts"],
     "files": [".gitignore", "README.md", "package.json"]
   }
   ```

**To Database** (audit trail):
```sql
INSERT INTO stage_agent_executions (venture_id, stage_id, agent_name, status, output_json)
VALUES ('VENTURE-001', 18, 'RepositoryManager', 'completed', '{"repo_url": "..."}');
```

### Decision Logic

**Decision 1: Monorepo vs. Multi-Repo**
```python
def decide_repo_structure(venture_data):
    if venture_data['loc'] < 10000 and venture_data['services'] <= 2:
        return "monorepo"  # Single repo for all code
    else:
        return "multi-repo"  # Separate repos per service
```

**Decision 2: Public vs. Private**
```python
def decide_visibility(venture_data):
    if venture_data['is_open_source'] or venture_data['lead_approved_public']:
        return "public"
    else:
        return "private"  # Default to private for security
```

**Evidence**: Decision logic addresses critique weakness "Some ambiguity in requirements" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:7)

### Error Handling

**Error 1: Repository already exists**
- **Detection**: GitHub API returns 422 ("name already exists on this account")
- **Recovery**: Append timestamp to repo name (e.g., "venture-name-20251105") or prompt for new name

**Error 2: API rate limit exceeded**
- **Detection**: GitHub API returns 429
- **Recovery**: Wait 1 hour, retry, or use GraphQL API (higher limits)

**Error 3: Insufficient permissions**
- **Detection**: GitHub API returns 403 ("Forbidden")
- **Recovery**: Escalate to LEAD for PAT with correct scopes

## Agent 2: ContentMigrator

### Role Definition

**Role**: Git Content Migration Specialist
**Goal**: Synchronize all venture files (code, docs, assets) to GitHub with 100% accuracy
**Backstory**: Expert in Git operations, large file handling (Git LFS), and conflict resolution. Has migrated 500+ projects to GitHub.

### Responsibilities

**Substage 18.2 Execution**:
1. Clone repository created by RepositoryManager
2. Copy files from local venture directory to repo
3. Create .gitignore (prevent secrets from being committed)
4. Stage all files (`git add .`)
5. Commit with descriptive message
6. Push to GitHub (handle large files via Git LFS)
7. Validate sync completeness (compare local vs. remote file counts)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:816-818 "Code pushed, Docs uploaded, Assets stored"

### Tools

**Tool 1: Git CLI Wrapper**
- **Purpose**: Execute Git commands programmatically
- **Library**: `GitPython` (Python) or `simple-git` (JavaScript)
- **Operations**: `clone`, `add`, `commit`, `push`

**Tool 2: Git LFS Handler**
- **Purpose**: Detect and track large files (>50MB)
- **Logic**: Scan for files >50MB, run `git lfs track [pattern]`
- **Benefit**: Avoid GitHub's 100MB file size limit

**Tool 3: Secret Scanner**
- **Purpose**: Prevent secrets from being committed
- **Library**: `truffleHog` or `git-secrets`
- **Action**: Abort commit if secrets detected (API keys, passwords)

### Inputs

**From RepositoryManager Agent**:
1. Repository URL
2. Folder structure config

**From Stage 17 Outputs** (GTM Strategist):
1. GTM strategy documents (path: `/path/to/stage17/docs`)
2. Campaign configuration files (path: `/path/to/stage17/configs`)

**From Venture File System**:
1. Source code directory (e.g., `/ventures/VENTURE-001/src`)
2. Documentation directory (e.g., `/ventures/VENTURE-001/docs`)
3. Assets directory (e.g., `/ventures/VENTURE-001/assets`)

### Outputs

**To CICDConfigurator Agent**:
1. **Commit SHA**: `abc123def456` (used to tag CI/CD runs)
2. **Sync report**: JSON with file counts
   ```json
   {
     "total_files": 150,
     "synced_files": 148,
     "sync_completeness": 98.67,
     "large_files_lfs": 3,
     "errors": []
   }
   ```

**To Database** (metrics):
```sql
INSERT INTO stage_metrics (venture_id, stage_id, metric_name, metric_value)
VALUES ('VENTURE-001', 18, 'sync_completeness', 98.67);
```

### Decision Logic

**Decision 1: Use Git LFS or External Storage?**
```python
def decide_large_file_handling(file_size, file_type):
    if file_size < 50_000_000:  # <50MB
        return "git"  # Commit to Git normally
    elif file_size < 2_000_000_000:  # 50MB - 2GB
        return "git-lfs"  # Use Git LFS
    else:  # >2GB
        return "s3"  # Use external storage (S3), store URL in repo
```

**Decision 2: Batch vs. Single Commit?**
```python
def decide_commit_strategy(total_files):
    if total_files < 1000:
        return "single"  # One commit for all files
    else:
        return "batch"  # Commit in batches of 500 files (avoid timeout)
```

### Error Handling

**Error 1: Git push rejected (divergent branches)**
- **Detection**: `git push` returns "Updates were rejected"
- **Recovery**: `git pull --rebase origin main`, resolve conflicts, re-push

**Error 2: Large file rejected (>100MB)**
- **Detection**: GitHub returns "file exceeds 100 MB limit"
- **Recovery**: Abort, track file with Git LFS, re-commit

**Error 3: Secrets detected in commit**
- **Detection**: Secret scanner flags API key or password
- **Recovery**: Remove secret, add to .gitignore, re-commit

**Evidence**: Addresses critique weakness "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:26)

## Agent 3: CICDConfigurator

### Role Definition

**Role**: CI/CD Pipeline Automation Specialist
**Goal**: Configure GitHub Actions workflows, webhooks, and auto-deployment for venture
**Backstory**: Expert in GitHub Actions, YAML syntax, and webhook integration. Has configured 200+ CI/CD pipelines.

### Responsibilities

**Substage 18.3 Execution**:
1. Generate GitHub Actions workflow files (CI, docs deployment, release)
2. Commit workflow files to `.github/workflows/`
3. Configure webhooks for external integrations
4. Test CI/CD pipeline (trigger workflow, verify pass)
5. Enable auto-sync for documentation site (deploy on commit)
6. Validate automation (ensure 100% automated deployments)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:822-824 "Webhooks set, CI/CD configured, Sync automated"

### Tools

**Tool 1: YAML Generator**
- **Purpose**: Generate GitHub Actions workflow files from templates
- **Templates**: CI.yml, deploy-docs.yml, release.yml
- **Variables**: Node version, test command, build command (venture-specific)

**Tool 2: GitHub Actions API**
- **Purpose**: Trigger workflows programmatically, check run status
- **Endpoint**: `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- **Use Case**: Test CI pipeline immediately after creation

**Tool 3: Webhook Manager**
- **Purpose**: Create and test webhooks via GitHub API
- **Configuration**: Payload URL, secret, events (push, pull_request)
- **Validation**: Send test payload, verify 200 OK response

### Inputs

**From ContentMigrator Agent**:
1. Commit SHA (to trigger first CI run)
2. Tech stack info (Node.js vs. Python vs. Go)

**From Venture Metadata**:
```sql
SELECT tech_stack, build_command, test_command
FROM ventures
WHERE venture_id = 'VENTURE-001';
```

### Outputs

**To SyncValidator Agent**:
1. **Workflow files created**: List of `.github/workflows/*.yml` files
2. **First CI run status**: Pass/fail status of initial workflow run
3. **Webhook URLs**: List of configured webhooks

**To Database** (CI/CD config):
```sql
INSERT INTO cicd_configs (venture_id, workflow_name, workflow_url, status)
VALUES ('VENTURE-001', 'CI', 'https://github.com/.../actions/workflows/ci.yml', 'active');
```

### Decision Logic

**Decision 1: Which workflows to create?**
```python
def decide_workflows(venture_data):
    workflows = ['ci.yml']  # Always create CI workflow

    if venture_data['has_docs']:
        workflows.append('deploy-docs.yml')  # Deploy documentation site

    if venture_data['stage'] >= 20:  # Post-MVP stage
        workflows.append('release.yml')  # Automated releases

    return workflows
```

**Decision 2: Deploy to GitHub Pages or external host?**
```python
def decide_docs_host(venture_data):
    if venture_data['has_custom_domain']:
        return "external"  # Deploy to custom domain (e.g., docs.venture.com)
    else:
        return "github-pages"  # Use free GitHub Pages hosting
```

### Error Handling

**Error 1: Workflow syntax error**
- **Detection**: GitHub Actions shows "Invalid workflow file"
- **Recovery**: Validate YAML with `yamllint`, fix syntax errors, re-commit

**Error 2: Workflow fails on first run**
- **Detection**: Workflow run shows red X (failure)
- **Recovery**: Check logs, common fixes:
  - Missing dependency: Add to package.json
  - Wrong Node version: Update `node-version` in workflow
  - Test failures: Fix tests before re-running

**Error 3: Webhook unreachable**
- **Detection**: GitHub shows "We couldn't deliver this payload"
- **Recovery**: Verify webhook URL is publicly accessible, check firewall settings

## Agent 4: SyncValidator

### Role Definition

**Role**: Stage 18 Completion Validation Specialist
**Goal**: Verify all 3 substages completed successfully, all exit gates passed
**Backstory**: Expert in quality assurance, metrics validation, and exit gate scoring. Has validated 300+ stage completions.

### Responsibilities

**All Substages Validation**:
1. Query database for Stage 18 metrics (sync completeness, docs coverage, version control compliance)
2. Check GitHub API for repo status (exists, accessible)
3. Verify CI/CD pipelines (at least 1 successful run)
4. Validate team access (all team members can clone repo)
5. Generate metrics report (JSON with pass/fail for each criterion)
6. Score exit gates (3 gates, each pass/fail)
7. Create Stage 18 handoff document (if all gates pass)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:803-805 "Repos synchronized, CI/CD connected, Access configured"

### Tools

**Tool 1: Database Query Engine**
- **Purpose**: Fetch Stage 18 metrics from database
- **Queries**: See 09_metrics-monitoring.md for SQL queries
- **Validation**: Compare metrics to thresholds (sync ≥95%, docs ≥80%, compliance 100%)

**Tool 2: GitHub API Inspector**
- **Purpose**: Verify repo status, CI/CD status, team access
- **Endpoints**:
  - `GET /repos/{owner}/{repo}` (repo exists?)
  - `GET /repos/{owner}/{repo}/actions/runs` (CI/CD active?)
  - `GET /repos/{owner}/{repo}/collaborators` (team access?)

**Tool 3: Handoff Generator**
- **Purpose**: Create Stage 18 → Stage 19 handoff document
- **Template**: Markdown with venture ID, metrics, outputs, next steps
- **Output**: File saved to `/ventures/VENTURE-001/handoffs/stage-18-handoff.md`

### Inputs

**From All Agents**:
1. RepositoryManager: Repo URL, structure config
2. ContentMigrator: Sync report, commit SHA
3. CICDConfigurator: Workflow files, CI status

**From Database**:
```sql
SELECT metric_name, metric_value
FROM stage_metrics
WHERE venture_id = 'VENTURE-001' AND stage_id = 18;
```

### Outputs

**To PLAN Agent** (Stage 18 completion signal):
1. **Completion status**: "completed" or "failed"
2. **Exit gates**: JSON with 3 gate statuses
   ```json
   {
     "repos_synchronized": true,
     "cicd_connected": true,
     "access_configured": true
   }
   ```
3. **Metrics summary**: JSON with 3 metrics
   ```json
   {
     "sync_completeness": 98.67,
     "documentation_coverage": 85.0,
     "version_control_compliance": 100.0
   }
   ```

**To Database** (stage completion):
```sql
UPDATE ventures
SET stage_18_status = 'completed', stage_18_completed_at = NOW()
WHERE venture_id = 'VENTURE-001';
```

### Decision Logic

**Decision 1: Stage 18 pass or fail?**
```python
def validate_stage_18_completion(metrics, exit_gates):
    if (metrics['sync_completeness'] >= 95 and
        metrics['documentation_coverage'] >= 80 and
        metrics['version_control_compliance'] == 100 and
        all(exit_gates.values())):  # All gates True
        return "pass"
    else:
        return "fail"
```

**Decision 2: Recurse or escalate?**
```python
def decide_failure_action(metrics, exit_gates):
    if not exit_gates['repos_synchronized']:
        return "recurse_substage_18.2"  # Re-run content migration
    elif not exit_gates['cicd_connected']:
        return "recurse_substage_18.3"  # Re-run CI/CD config
    else:
        return "escalate_to_exec"  # Manual intervention required
```

### Error Handling

**Error 1: Database metrics missing**
- **Detection**: SQL query returns 0 rows
- **Recovery**: Trigger ContentMigrator to re-compute metrics

**Error 2: GitHub API unreachable**
- **Detection**: HTTP 503 (Service Unavailable)
- **Recovery**: Retry after 5 minutes, escalate if still failing

**Error 3: Exit gate fails (sync <95%)**
- **Detection**: Sync completeness metric below threshold
- **Recovery**: Trigger recursion to Substage 18.2 (re-run content migration)

**Evidence**: Addresses critique weakness "Unclear rollback procedures" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:24)

## Crew Process Flow

**Sequential Execution** (each agent waits for previous to complete):

```
1. RepositoryManager
   ├─ Input: Venture ID, team list
   ├─ Action: Create repo, set permissions
   └─ Output: Repo URL → ContentMigrator

2. ContentMigrator
   ├─ Input: Repo URL, venture files
   ├─ Action: Push code, docs, assets to GitHub
   └─ Output: Commit SHA, sync report → CICDConfigurator

3. CICDConfigurator
   ├─ Input: Commit SHA, tech stack
   ├─ Action: Create workflows, webhooks
   └─ Output: CI status → SyncValidator

4. SyncValidator
   ├─ Input: All agent outputs + metrics
   ├─ Action: Validate exit gates, generate handoff
   └─ Output: Completion status → PLAN Agent (Stage 19 trigger)
```

**Total Estimated Duration**: 2-4 hours (80% faster than manual 9-18 hours)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:33 "Target State: 80% automation"

## Integration with SD-CREWAI-ARCHITECTURE-001

**Registry Entry** (to be added to central agent registry):

```yaml
crew: DocSyncCrew
stage: 18
agents:
  - name: RepositoryManager
    role: GitHub Repository Setup Specialist
    tools: [GitHub API, Terraform, Folder Structure Generator]
  - name: ContentMigrator
    role: Git Content Migration Specialist
    tools: [Git CLI, Git LFS, Secret Scanner]
  - name: CICDConfigurator
    role: CI/CD Pipeline Automation Specialist
    tools: [YAML Generator, GitHub Actions API, Webhook Manager]
  - name: SyncValidator
    role: Stage 18 Completion Validation Specialist
    tools: [Database Query Engine, GitHub API Inspector, Handoff Generator]
process: sequential
estimated_duration: 2-4 hours
automation_level: 80%
```

**Cross-Reference**: SD-CREWAI-ARCHITECTURE-001 (central agent registry for all stage crews)

## Monitoring and Alerting

**Crew Health Metrics**:
1. **Execution Time**: Target <4 hours (alert if >6 hours)
2. **Success Rate**: Target >90% (alert if <80%)
3. **Agent Failure Rate**: Target <5% per agent (alert if any agent >10%)

**Dashboard Queries**:
```sql
-- Average execution time for DocSyncCrew
SELECT AVG(completed_at - started_at) AS avg_duration
FROM stage_agent_executions
WHERE stage_id = 18 AND status = 'completed';

-- Success rate by agent
SELECT agent_name,
       COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) AS success_rate
FROM stage_agent_executions
WHERE stage_id = 18
GROUP BY agent_name;
```

**Evidence**: See 09_metrics-monitoring.md for detailed monitoring queries

## Future Enhancements

**Enhancement 1: Parallel Execution**
- **Current**: Sequential (agents run one after another)
- **Future**: Parallel (RepositoryManager + ContentMigrator run simultaneously)
- **Benefit**: Reduce total execution time from 2-4 hours to 1-2 hours

**Enhancement 2: Predictive Validation**
- **Current**: SyncValidator checks metrics after completion
- **Future**: SyncValidator predicts failures mid-execution (abort early if sync rate <50%)
- **Benefit**: Save 1-2 hours by aborting failed runs early

**Enhancement 3: Multi-Repo Support**
- **Current**: Optimized for monorepo
- **Future**: RepositoryManager creates multiple repos for microservices
- **Benefit**: Support ventures with >10,000 LOC or >3 services

---

**Implementation Priority**: HIGH (enables 80% automation target)
**Estimated Implementation Time**: 2-3 sprints (4-6 weeks)
**Dependencies**: SD-CREWAI-ARCHITECTURE-001 (agent registry), SD-DOCSYNC-AUTOMATION-001 (automation scripts)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
