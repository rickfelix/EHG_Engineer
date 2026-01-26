# Stage 18: Canonical Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, migration, security, sd

## Source of Truth

This document contains the complete canonical definition of Stage 18 from the `stages.yaml` file.

**Source File**: `docs/workflow/stages.yaml`
**Lines**: 781-826
**Commit**: EHG_Engineer@6ef8cf4

**DO NOT edit this stage definition outside of stages.yaml**. Any changes to Stage 18 must be made in the source YAML file and then regenerated into this dossier.

## Full YAML Definition

```yaml
  - id: 18
    title: Documentation Sync to GitHub
    description: Synchronize all documentation and code to version control.
    depends_on:
      - 17
    inputs:
      - Documentation
      - Code repositories
      - Configuration files
    outputs:
      - GitHub repos
      - Documentation site
      - Version history
    metrics:
      - Sync completeness
      - Documentation coverage
      - Version control compliance
    gates:
      entry:
        - Documentation complete
        - Code ready
      exit:
        - Repos synchronized
        - CI/CD connected
        - Access configured
    substages:
      - id: '18.1'
        title: Repository Setup
        done_when:
          - Repos created
          - Structure defined
          - Permissions set
      - id: '18.2'
        title: Content Migration
        done_when:
          - Code pushed
          - Docs uploaded
          - Assets stored
      - id: '18.3'
        title: Automation Configuration
        done_when:
          - Webhooks set
          - CI/CD configured
          - Sync automated
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:781-826 "Synchronize all documentation and code to version control"

## Parsed Components

### Basic Metadata

**ID**: 18
**Title**: Documentation Sync to GitHub
**Description**: Synchronize all documentation and code to version control.

**Owner**: EXEC (inferred from operational nature)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-18.md:18 "Clear ownership (EXEC)"

### Dependencies

**Depends On**: Stage 17 (GTM Strategist Agent Development)

**Explanation**: Stage 18 requires all documentation and code from Stage 17 to be finalized before synchronization can begin. GTM strategy documents, campaign configurations, and agent templates must be ready for Git.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:784-785 "depends_on: - 17"

### Inputs

**Input 1: Documentation**
- **Type**: Markdown, PDF, HTML files
- **Source**: Stages 14 (Technical Docs), 17 (GTM Docs)
- **Volume**: ~50-200 files per venture
- **Format**: Markdown (.md) primary, PDF for client-facing docs

**Input 2: Code repositories**
- **Type**: Source code files
- **Source**: Stages 1-17 (all code written)
- **Volume**: ~1,000-10,000 LOC per venture
- **Format**: JavaScript/TypeScript (.js, .ts), Python (.py), SQL (.sql)

**Input 3: Configuration files**
- **Type**: Environment variables, app configs
- **Source**: Stages 10 (Technical Review), 17 (GTM Config)
- **Volume**: ~10-30 files per venture
- **Format**: JSON (.json), YAML (.yaml), ENV (.env)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:786-789 "Documentation, Code repositories, Configuration files"

### Outputs

**Output 1: GitHub repos**
- **Type**: Version-controlled repositories
- **Consumer**: Stage 19 (Integration Verification), Operations
- **Volume**: 1-5 repos per venture (monorepo or multi-repo)
- **Format**: Git repositories (GitHub hosted)

**Output 2: Documentation site**
- **Type**: Searchable, live documentation
- **Consumer**: Developers, customers (public docs)
- **Volume**: 1 site per venture (e.g., docs.venture-name.com)
- **Format**: Static site (GitHub Pages, Docusaurus, MkDocs)

**Output 3: Version history**
- **Type**: Git commit logs, tags, branches
- **Consumer**: Audit, compliance, rollback operations
- **Volume**: Full commit history (all changes tracked)
- **Format**: Git metadata (SHA hashes, commit messages)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:790-793 "GitHub repos, Documentation site, Version history"

### Metrics

**Metric 1: Sync completeness**
- **Definition**: (Files successfully synced / Total files) × 100%
- **Target**: ≥95%
- **Measurement**: Automated script comparing local vs. remote file counts
- **Frequency**: Post-sync validation (immediate)

**Metric 2: Documentation coverage**
- **Definition**: (Documented APIs/components / Total APIs/components) × 100%
- **Target**: ≥80%
- **Measurement**: Static analysis tool (JSDoc coverage, Python docstrings)
- **Frequency**: Daily (CI/CD pipeline check)

**Metric 3: Version control compliance**
- **Definition**: (Commits with proper messages / Total commits) × 100%
- **Target**: 100%
- **Measurement**: Git log analysis (conventional commits validation)
- **Frequency**: Per commit (Git hook)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:794-797 "Sync completeness, Documentation coverage, Version control compliance"

### Gates

#### Entry Gates

**Entry Gate 1: Documentation complete**
- **Validation**: Check that all required docs from Stage 17 exist
- **Criteria**: README, API docs, architecture diagrams present
- **Failure Action**: Block Stage 18, return to Stage 14 or 17

**Entry Gate 2: Code ready**
- **Validation**: All code passes linting and build checks
- **Criteria**: No syntax errors, no failing tests
- **Failure Action**: Block Stage 18, fix code issues

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:799-802 "Documentation complete, Code ready"

#### Exit Gates

**Exit Gate 1: Repos synchronized**
- **Validation**: All files pushed to GitHub, no sync errors
- **Criteria**: Sync completeness ≥95%
- **Failure Action**: Re-execute Substage 18.2 (Content Migration)

**Exit Gate 2: CI/CD connected**
- **Validation**: GitHub Actions workflows running successfully
- **Criteria**: At least 1 successful pipeline run
- **Failure Action**: Debug CI/CD config (Substage 18.3)

**Exit Gate 3: Access configured**
- **Validation**: Team members can access repos with correct permissions
- **Criteria**: All team members confirmed access (manual check)
- **Failure Action**: Adjust GitHub permissions (Substage 18.1)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:803-805 "Repos synchronized, CI/CD connected, Access configured"

### Substages

#### Substage 18.1: Repository Setup

**Title**: Repository Setup
**Owner**: EXEC (DevOps engineer or automation script)

**Done When**:
1. **Repos created**: GitHub repositories initialized (public or private)
2. **Structure defined**: Folder structure established (e.g., `/docs`, `/src`, `/tests`)
3. **Permissions set**: Team access configured (admin, write, read roles)

**Estimated Duration**: 2-4 hours (manual) or 15-30 minutes (automated)

**Tools**:
- GitHub CLI (`gh repo create`)
- GitHub API (for scripted setup)
- Terraform (for infrastructure-as-code repo management)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:807-812 "Repos created, Structure defined, Permissions set"

#### Substage 18.2: Content Migration

**Title**: Content Migration
**Owner**: EXEC (automated sync script or manual upload)

**Done When**:
1. **Code pushed**: All source code committed to Git
2. **Docs uploaded**: Documentation files synced to repos
3. **Assets stored**: Images, videos, binaries uploaded (or linked via Git LFS)

**Estimated Duration**: 4-8 hours (manual) or 1-2 hours (automated)

**Tools**:
- Git CLI (`git push`)
- Git LFS (for large files)
- Rsync (for batch file uploads)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:813-818 "Code pushed, Docs uploaded, Assets stored"

#### Substage 18.3: Automation Configuration

**Title**: Automation Configuration
**Owner**: EXEC (DevOps engineer)

**Done When**:
1. **Webhooks set**: GitHub webhooks configured for external integrations
2. **CI/CD configured**: GitHub Actions workflows defined and tested
3. **Sync automated**: Auto-sync enabled (e.g., docs auto-deploy on commit)

**Estimated Duration**: 3-6 hours (manual) or 30-60 minutes (automated)

**Tools**:
- GitHub Actions (YAML workflow files)
- GitHub Webhooks (Settings → Webhooks)
- Third-party CI/CD (CircleCI, Travis CI if used)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:819-824 "Webhooks set, CI/CD configured, Sync automated"

### Notes

**Progression Mode**: Manual → Assisted → Auto (suggested)

**Explanation**:
- **Manual Mode**: EXEC agent manually executes all 3 substages (initial ventures)
- **Assisted Mode**: Scripted automation with human oversight (intermediate ventures)
- **Auto Mode**: Fully automated sync triggered by Stage 17 completion (mature ventures)

**Current State**: Most ventures operate in Manual mode (per critique: "Limited automation for manual processes")

**Target State**: 80% automation (Assisted or Auto mode)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:826 "Manual → Assisted → Auto (suggested)"

## Interpretation and Implementation Guidance

### Key Design Decisions

**1. Why GitHub (vs. GitLab, Bitbucket)?**
- Industry standard for open-source projects
- Built-in CI/CD (GitHub Actions)
- Free tier sufficient for most ventures
- **Decision**: Use GitHub unless client requires alternative

**2. Monorepo vs. Multi-Repo?**
- **Monorepo**: Single repo for all code (simpler for small ventures)
- **Multi-Repo**: Separate repos per service (better for microservices)
- **Decision**: Default to monorepo, split into multi-repo if >10,000 LOC or >3 services

**3. Public vs. Private Repos?**
- **Public**: Open-source ventures, marketing advantage
- **Private**: Proprietary ventures, security requirement
- **Decision**: Default to private, switch to public only with LEAD approval

### Common Pitfalls

**Pitfall 1: Incomplete .gitignore**
- **Problem**: Committing secrets (.env files), node_modules, build artifacts
- **Solution**: Use standard .gitignore templates (GitHub's Node.js, Python templates)

**Pitfall 2: Large files (>100MB)**
- **Problem**: Git rejects large file pushes (GitHub limit: 100MB per file)
- **Solution**: Use Git LFS for binaries, videos, datasets

**Pitfall 3: Broken CI/CD pipelines**
- **Problem**: GitHub Actions fail on first run (missing dependencies, wrong paths)
- **Solution**: Test CI/CD locally first (use `act` tool to run GitHub Actions locally)

### Success Patterns

**Pattern 1: Pre-flight Checklist**
- Before starting Stage 18, validate all inputs (docs exist, code builds, configs valid)
- Use entry gates as checklist (see 11_acceptance-checklist.md)

**Pattern 2: Incremental Sync**
- Don't push all files at once (risk of timeout or errors)
- Push in batches: docs first, then code, then assets

**Pattern 3: Rollback Plan**
- Before major changes (e.g., repo restructure), create Git tag (e.g., `v1.0-pre-stage18`)
- Enables quick rollback if Stage 18 breaks anything

## Change History

**Current Version**: v1.0 (2025-11-05)
**Change Log**:
- v1.0 (2025-11-05): Initial canonical definition extracted from stages.yaml

**Future Changes**:
- If stages.yaml is updated (e.g., new metrics added), regenerate this file
- Track version in dossier metadata (not in YAML)

---

**Next Steps**: Proceed to 04_current-assessment.md for critique analysis.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
