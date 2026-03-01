---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Documentation Navigation Map


## Table of Contents

- [I'm New to the Project](#im-new-to-the-project)
- [I'm Implementing a Feature (LEO Protocol)](#im-implementing-a-feature-leo-protocol)
  - [LEAD Phase (Approval)](#lead-phase-approval)
  - [PLAN Phase (Design)](#plan-phase-design)
  - [EXEC Phase (Implementation)](#exec-phase-implementation)
  - [Cross-Phase](#cross-phase)
- [I'm Working with Database](#im-working-with-database)
  - [Getting Started](#getting-started)
  - [Common Tasks](#common-tasks)
  - [Troubleshooting](#troubleshooting)
- [I'm Testing & QA](#im-testing-qa)
  - [Testing Guides](#testing-guides)
  - [QA Tools](#qa-tools)
  - [Sub-Agent Testing](#sub-agent-testing)
- [I'm Deploying / Operations](#im-deploying-operations)
  - [Production Deployment](#production-deployment)
  - [Monitoring & Troubleshooting](#monitoring-troubleshooting)
- [I'm Working with Sub-Agents](#im-working-with-sub-agents)
  - [Sub-Agent System](#sub-agent-system)
  - [Specific Sub-Agents](#specific-sub-agents)
  - [Agent Execution](#agent-execution)
- [I'm Looking for Patterns & Best Practices](#im-looking-for-patterns-best-practices)
  - [Core Patterns](#core-patterns)
  - [Best Practices](#best-practices)
  - [Advanced Topics](#advanced-topics)
- [I'm Searching for Specific Topics](#im-searching-for-specific-topics)
  - [By Category](#by-category)
- [I'm Troubleshooting an Issue](#im-troubleshooting-an-issue)
  - [Common Issues](#common-issues)
  - [By Problem Type](#by-problem-type)
- [Documentation by Audience](#documentation-by-audience)
  - [For New Developers](#for-new-developers)
  - [For LEO Protocol Users](#for-leo-protocol-users)
  - [For Operations/DevOps](#for-operationsdevops)
  - [For Architects](#for-architects)
- [Documentation Maintenance](#documentation-maintenance)
  - [How to Update Documentation](#how-to-update-documentation)
  - [How to Find Documentation](#how-to-find-documentation)
  - [Documentation Health](#documentation-health)
- [Quick Links by File Type](#quick-links-by-file-type)
- [Can't Find What You Need?](#cant-find-what-you-need)
  - [Search Strategies](#search-strategies)
  - [Still Can't Find It?](#still-cant-find-it)

**Purpose**: Quick reference guide to find documentation based on your role or task
**Last Updated**: 2025-12-29
**Status**: Active

---

## I'm New to the Project

**Start Here** (5-minute orientation):
1. **[Project Overview](../README.md)** - What is EHG_Engineer?
2. **[Quick Setup](../04_features/SIMPLE_PROJECT_SETUP.md)** - Get running in 5 minutes
3. **[Architecture Overview](../01_architecture/README.md)** - System design basics
4. **[LEO Protocol Intro](../CLAUDE.md)** - How we build features

**Next Steps**:
- **[Developer Onboarding](#)** *(to be created)* - Your first week guide
- **[Contributing Guidelines](../CONTRIBUTING.md)** - How to contribute
- **[Documentation Standards](../03_protocols_and_standards/DOCUMENTATION_STANDARDS.md)** - How we document

---

## I'm Implementing a Feature (LEO Protocol)

### LEAD Phase (Approval)
- **[CLAUDE_LEAD.md](../CLAUDE_LEAD.md)** - Full LEAD phase guide
- **[Lead Intent Clarification](../guides/lead-intent-clarification-guide.md)** - Clarify requirements
- **[Validation Patterns](../reference/validation-enforcement.md)** - What to validate

### PLAN Phase (Design)
- **[CLAUDE_PLAN.md](../CLAUDE_PLAN.md)** - Full PLAN phase guide
- **[PRD Creation](../guides/prd-creation-process.md)** - How to write PRDs
- **[Database Patterns](../reference/database-agent-patterns.md)** - Schema design

### EXEC Phase (Implementation)
- **[CLAUDE_EXEC.md](../CLAUDE_EXEC.md)** - Full EXEC phase guide
- **[Testing Integration](../guides/enhanced-testing-integration.md)** - Unit + E2E testing
- **[Component Patterns](../reference/exec-component-recommendations-guide.md)** - UI components

### Cross-Phase
- **[Handoff System](../leo/handoffs/handoff-system-guide.md)** - Inter-phase handoffs
- **[Sub-Agent Patterns](../reference/agent-patterns-guide.md)** - When to invoke sub-agents
- **[Quick Reference](../reference/quick-reference.md)** - Common pitfalls

---

## I'm Working with Database

### Getting Started
- **[Database Connection](../guides/database-connection.md)** - Connect to Supabase
- **[Database Architecture](../guides/database-architecture.md)** - Schema overview
- **[Important Distinctions](../operations/IMPORTANT_DATABASE_DISTINCTION.md)** - EHG vs EHG_Engineer DB

### Common Tasks
- **[Schema Design](../reference/database-agent-patterns.md)** - Design patterns
- **[Migrations](../guides/database-migration-checklist.md)** - Migration best practices
- **[RLS Policies](../reference/database-best-practices.md)** - Row-level security

### Troubleshooting
- **[Connection Issues](../summaries/sd-sessions/database/DATABASE_CONNECTION_ISSUE_SD-VISION-V2-003.md)** - Common connection problems
- **[Migration Validation](../guides/database-migration-validation.md)** - Validate migrations

---

## I'm Testing & QA

### Testing Guides
- **[Testing Overview](../01_architecture/README.md)** - Testing philosophy
- **[Enhanced Testing](../guides/enhanced-testing-integration.md)** - Unit + E2E setup
- **[Real Testing Campaign](../guides/real-testing-campaign.md)** - E2E test campaigns
- **[UAT Guide](../guides/ehg-uat-script.md)** - User acceptance testing

### QA Tools
- **[QA Director](../reference/qa-director-guide.md)** - QA automation
- **[Vision QA System](../guides/vision-qa-system.md)** - Visual testing
- **[Testing Troubleshooting](../guides/enhanced-testing-troubleshooting.md)** - Fix test issues

### Sub-Agent Testing
- **[Testing Agent](../.claude/agents/testing-agent.md)** - Testing sub-agent
- **[UAT Agent](../.claude/agents/uat-agent.md)** - UAT automation

---

## I'm Deploying / Operations

### Production Deployment
- **[Production Go-Live](../operations/PRODUCTION_GO_LIVE.md)** - Deployment checklist
- **[Deployment Guide](../01_architecture/README.md)** - Deployment overview
- **[CI/CD Setup](../guides/leo-ci-cd-integration-setup.md)** - GitHub Actions

### Monitoring & Troubleshooting
- **[Troubleshooting Index](../troubleshooting)** - Common issues
- **[Database Health](../guides/database-connection.md)** - Check DB status
- **[Performance Guide](../guides/cost-optimization-guide.md)** - Optimization tips

---

## I'm Working with Sub-Agents

### Sub-Agent System
- **[Agent Directory](../01_architecture/README.md)** - All available agents
- **[Invisible Subagent System](../guides/INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md)** - Architecture
- **[Hybrid Workflow](../guides/hybrid-sub-agent-workflow.md)** - Hybrid patterns
- **[Sub-Agent Patterns](../reference/agent-patterns-guide.md)** - Best practices

### Specific Sub-Agents
| Agent | Purpose | Guide |
|-------|---------|-------|
| DOCMON | Documentation generation | [docmon-agent.md](../.claude/agents/docmon-agent.md) |
| Database | Schema design, migrations | [database-agent.md](../.claude/agents/database-agent.md) |
| Design | UI/UX validation | [design-agent.md](../.claude/agents/design-agent.md) |
| Testing | E2E test generation | [testing-agent.md](../.claude/agents/testing-agent.md) |
| Security | Auth, authorization | [security-agent.md](../.claude/agents/security-agent.md) |
| Validation | Codebase audits | [validation-agent.md](../.claude/agents/validation-agent.md) |

### Agent Execution
- **[Execute Sub-Agent](reference/native-sub-agent-invocation.md)** - How to invoke
- **[Agent Patterns](../reference/agent-patterns-guide.md)** - Usage patterns

---

## I'm Looking for Patterns & Best Practices

### Core Patterns
- **[Database Patterns](../reference/database-agent-patterns.md)** - Schema design patterns
- **[Validation Patterns](../reference/validation-enforcement.md)** - Validation gates
- **[Refactoring Patterns](../reference/refactoring-patterns.md)** - Code refactoring
- **[Parallel Execution](../reference/parallel-execution-patterns.md)** - Async patterns

### Best Practices
- **[Database Best Practices](../reference/database-best-practices.md)** - DB guidelines
- **[Architectural Guidelines](../guides/architectural-guidelines.md)** - Architecture rules
- **[Quick Reference](../reference/quick-reference.md)** - Anti-patterns to avoid

### Advanced Topics
- **[Protocol Self-Improvement](reference/protocol-self-improvement.md)** - LEO learning
- **[Context Engineering](../reference/agentic-context-engineering-v3.md)** - Context optimization
- **[Root Cause Agent](../reference/root-cause-agent.md)** - Debugging methodology

---

## I'm Searching for Specific Topics

### By Category

**Architecture & Design**:
- [01_architecture/](../05_testing/architecture.md) - System architecture
- [Design Patterns](../leo/sub-agents/design-sub-agent-guide.md)
- [Component Registry](../reference/component-registry.md)

**API Development**:
- [02_api/](02_api/) - API documentation
- [API Patterns](../.claude/agents/api-agent.md)

**Protocols & Standards**:
- [03_protocols_and_standards/](../03_protocols_and_standards) - LEO Protocol versions
- [Git Guidelines](../03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md)
- [GitHub Workflows](../03_protocols_and_standards/leo_github_deployment_workflow_v4.1.2.md)

**Feature Documentation**:
- [04_features/](04_features/) - Feature-specific docs
- [MVP Engine](../04_features/mvp_engine.md)
- [AI Leadership Agents](../04_features/ai_leadership_agents.md)

**Testing & QA**:
- [05_testing/](05_testing/) - Testing documentation
- [QA Guides](../reference/qa-director-guide.md)

**Deployment**:
- [06_deployment/](06_deployment/) - Deployment guides
- [Production Checklist](../operations/PRODUCTION_GO_LIVE.md)

**Analysis & Reports**:
- [analysis/](../analysis) - Issue analysis, assessments
- [Retrospectives](../retrospectives/lessons-learned-database-agent-rls-policy-chain.md) - Project retrospectives
- [Summaries](summaries/) - Implementation summaries

**Guides & How-Tos**:
- [guides/](../04_features/README.md) - 60+ step-by-step guides
- Categorized by: Getting Started, LEO Protocol, Database, Testing, Operations

**Quick Reference**:
- [reference/](../reference) - 70+ reference documents
- Patterns, best practices, quick refs

---

## I'm Troubleshooting an Issue

### Common Issues
**[Troubleshooting Directory](../troubleshooting)** - Start here

**Specific Issues**:
- **Database connection**: [Database Connection Issues](../summaries/sd-sessions/database/DATABASE_CONNECTION_ISSUE_SD-VISION-V2-003.md)
- **Git hook errors**: [Fix Hook Errors](../troubleshooting/FIX_HOOK_ERRORS.md)
- **GitHub workflow YAML**: [YAML Parsing Errors](../troubleshooting/github-workflows-yaml-parsing-errors.md)
- **Migration issues**: [Manual Migration Required](../troubleshooting/MANUAL_MIGRATION_REQUIRED.md)

### By Problem Type

**Build/Deployment Issues**:
- [CI/CD Guide](../guides/leo-ci-cd-integration-setup.md)
- [Deployment Troubleshooting](06_deployment/)

**Test Failures**:
- [Testing Troubleshooting](../guides/enhanced-testing-troubleshooting.md)
- [Test Timeout Handling](../reference/test-timeout-handling.md)

**Database Issues**:
- [Database Best Practices](../reference/database-best-practices.md)
- [Migration Checklist](../guides/database-migration-checklist.md)

**Performance Issues**:
- [Cost Optimization](../guides/cost-optimization-guide.md)
- [Performance Patterns](../.claude/agents/performance-agent.md)

---

## Documentation by Audience

### For New Developers
→ **[FOR_NEW_DEVELOPERS.md](#)** *(to be created)*
- Quick start guide
- Architecture basics
- First feature implementation

### For LEO Protocol Users
→ **[FOR_LEO_USERS.md](#)** *(to be created)*
- Phase guides (LEAD/PLAN/EXEC)
- Sub-agent invocation
- Handoff protocols

### For Operations/DevOps
→ **[FOR_OPERATIONS.md](#)** *(to be created)*
- Deployment procedures
- Monitoring and troubleshooting
- Production maintenance

### For Architects
- [Architecture Docs](../05_testing/architecture.md)
- [System Design](../reference/database-agent-patterns.md)
- [ADR Documents](../05_testing/architecture.md)

---

## Documentation Maintenance

### How to Update Documentation
1. **Read Standards**: [DOCUMENTATION_STANDARDS.md](../03_protocols_and_standards/DOCUMENTATION_STANDARDS.md)
2. **Follow Structure**: [DIRECTORY_STRUCTURE.md](../01_architecture/DIRECTORY_STRUCTURE.md)
3. **Use Templates**: See standards doc for templates

### How to Find Documentation
1. **Use This Map**: You're here!
2. **Check Directory READMEs**: Each folder has a README
3. **Search**: `grep -r "topic" docs/`

### Documentation Health
- **Structure Assessment**: [Full Report](../analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md)
- **Improvement Plan**: [Summary](DOCUMENTATION_IMPROVEMENT_SUMMARY.md)

---

## Quick Links by File Type

| I need... | Go to... |
|-----------|----------|
| API endpoint docs | [02_api/](02_api/) |
| Database schema | [Database Schema](../reference/database-schema-overview.md) |
| LEO Protocol version | [CLAUDE.md](../CLAUDE.md) - shows current version |
| Git commit guidelines | [Git Guidelines](../03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md) |
| Testing guide | [05_testing/README.md](../01_architecture/README.md) |
| Sub-agent list | [Agent Directory](../01_architecture/README.md) |
| Troubleshooting | [troubleshooting/](../troubleshooting) |
| Best practices | [reference/](../reference) |
| How-to guides | [guides/README.md](../04_features/README.md) |
| Recent changes | [CHANGELOG.md](../CHANGELOG.md) |

---

## Can't Find What You Need?

### Search Strategies

**1. Grep Search**:
```bash
# Search all documentation
grep -r "your search term" /mnt/c/_EHG/EHG_Engineer/docs/

# Search specific category
grep -r "database migration" /mnt/c/_EHG/EHG_Engineer/docs/guides/
```

**2. File Name Search**:
```bash
find /mnt/c/_EHG/EHG_Engineer/docs/ -name "*keyword*"
```

**3. Recent Updates**:
```bash
# Files updated in last 7 days
find /mnt/c/_EHG/EHG_Engineer/docs/ -name "*.md" -mtime -7
```

**4. By File Size** (longer docs = comprehensive):
```bash
find /mnt/c/_EHG/EHG_Engineer/docs/ -name "*.md" -exec wc -l {} \; | sort -n
```

### Still Can't Find It?

1. **Check if topic exists**: May need to create documentation
2. **Ask DOCMON agent**: Information architecture specialist
3. **Review related topics**: May be covered under different name

---

**Navigation Map Version**: 1.0
**Created**: 2025-12-29
**Maintained By**: DOCMON Sub-Agent
**Part of**: Documentation Improvement Initiative

*This map will be updated as documentation structure evolves*
