# EHG_Engineer Documentation

> **DATABASE-FIRST (LEO Protocol v4.3.3)**: Strategic data lives in the database.
> Files are for documentation only. Query tables for SDs, PRDs, and handoffs.

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: EHG_Engineer is now **backend API only**. All UI (including admin dashboard) has moved to EHG unified frontend at `/admin/*` routes.

Centralized documentation for the EHG_Engineer application (LEO Protocol backend API and execution engine).

---

## Quick Start by Role

### New Developer?
1. [Project Setup](guides/SIMPLE_PROJECT_SETUP.md) - Get started
2. [LEO Protocol Quick Reference](guides/leo-protocol-quick-reference.md) - Understand the protocol
3. [Sub-Agent System](guides/INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md) - How sub-agents work

### Working on SDs/PRDs?
1. [PRD Creation Process](guides/prd-creation-process.md) - PRD workflow
2. [LEAD Checklist](guides/LEAD_MANDATORY_CHECKLIST.md) - LEAD phase requirements
3. [SD Schema Reference](reference/strategic-directives-v2-schema.md) - Database schema

### Database Work?
1. [Database Migration Guide](guides/DATABASE_MIGRATION_GUIDE.md) - Migration procedures
2. [Database Patterns](reference/database-agent-patterns.md) - Best practices
3. [Supabase Operations](reference/supabase-operations.md) - Supabase specifics

### Testing?
1. [QA Director Guide](reference/qa-director-guide.md) - QA sub-agent
2. [E2E Testing](guides/enhanced-testing-integration.md) - Playwright testing
3. [UAT Scripts](guides/ehg-uat-script.md) - UAT procedures

---

## Documentation Structure

### 📖 [Guides](./guides/) (54 guides)
User guides, setup instructions, and operational procedures.
See [guides/README.md](guides/README.md) for comprehensive index.

### 📚 [Reference](./reference/) (71 references)
Quick reference, patterns, and technical specifications.
See [reference/README.md](reference/README.md) for comprehensive index.

### 📋 [Summaries](./summaries/)
Implementation summaries and completion reports.

### 🔧 [Troubleshooting](./troubleshooting/)
Common issues and their resolutions.

### 📊 [Reports](./reports/)
Analysis reports, retrospectives, and system verification.

### 🚀 [Operations](./operations/)
Production deployment guides and operational documentation.

### 📦 [Archive](./archive/)
Deprecated or superseded documentation retained for reference.

---

## Core Documentation (Root Level)

| File | Description |
|------|-------------|
| `../CLAUDE.md` | LEO Protocol v4.3.3 context router (auto-generated) |
| `../CLAUDE_CORE.md` | Core protocol implementation |
| `../CLAUDE_LEAD.md` | LEAD phase operations |
| `../CLAUDE_PLAN.md` | PLAN phase operations |
| `../CLAUDE_EXEC.md` | EXEC phase operations |
| `../README.md` | Project overview |
| `../CONTRIBUTING.md` | Contribution guidelines |

---

## Directory Quick Reference

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `01_architecture/` | System architecture | ADRs, design decisions |
| `02_api/` | API documentation | Endpoints, specifications |
| `03_protocols_and_standards/` | LEO Protocol specs | v4.2 specs, v4.3.3 current |
| `04_features/` | Feature documentation | User-facing features |
| `05_testing/` | Testing strategies | E2E, unit test guides |
| `06_deployment/` | Deployment procedures | CI/CD, infrastructure |
| `analysis/` | Issue investigations | Audits, assessments |
| `database/` | Database schema | RLS policies, patterns |
| `handoffs/` | Handoff documentation | Templates, guides |
| `issues/` | Tracked issues | Bugs, blockers |
| `migrations/` | Migration docs | Database migrations |
| `product-requirements/` | PRD documentation | Legacy PRD files |
| `strategic-directives/` | SD documentation | Legacy SD files |
| `workflow/` | Workflow processes | Dossiers, stages |

---

## Database Tables (Source of Truth)

| Table | Content |
|-------|---------|
| `strategic_directives_v2` | All Strategic Directives |
| `product_requirements_v2` | All Product Requirements |
| `sd_phase_handoffs` | Phase handoff records |
| `sd_user_stories` | User stories |
| `leo_protocol_versions` | Protocol versions |
| `leo_sub_agents` | Sub-agent definitions |

---

## Quick Links

- **LEO Protocol**: See `../CLAUDE.md` (auto-generated from database)
- **Getting Started**: See [guides/SIMPLE_PROJECT_SETUP.md](guides/SIMPLE_PROJECT_SETUP.md)
- **Database Architecture**: See [operations/IMPORTANT_DATABASE_DISTINCTION.md](operations/IMPORTANT_DATABASE_DISTINCTION.md)
- **Sub-Agents**: See [guides/INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md](guides/INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md)

---

*Part of LEO Protocol v4.3.3 - Documentation Index*
*Updated: 2025-12-29*
*Auto-organized by DOCMON (Information Architecture Lead Sub-Agent)*
