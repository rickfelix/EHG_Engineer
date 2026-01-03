# EHG_Engineer Documentation Index

Master index for navigating the documentation library.

---

## Quick Start

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview and setup |
| [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md) | Development workflow guide |
| [CLAUDE.md](../CLAUDE.md) | LEO Protocol context router |

---

## LEO Protocol (Core)

### Protocol Files

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](../CLAUDE.md) | Context router (auto-generated) |
| [CLAUDE_CORE.md](../CLAUDE_CORE.md) | Core protocol rules |
| [CLAUDE_LEAD.md](../CLAUDE_LEAD.md) | LEAD phase guide |
| [CLAUDE_PLAN.md](../CLAUDE_PLAN.md) | PLAN phase guide |
| [CLAUDE_EXEC.md](../CLAUDE_EXEC.md) | EXEC phase guide |

### Protocol Reference

| Document | Purpose |
|----------|---------|
| [LEO Stack README](../scripts/README-LEO-STACK.md) | Server management |
| [CLAUDE Generation README](../scripts/README-CLAUDE-GENERATION.md) | Auto-generation guide |

---

## API Documentation

| Document | Purpose |
|----------|---------|
| [API Overview](02_api/api-documentation-overview.md) | Complete API reference (59 endpoints) |
| [LEO API](leo/api.md) | LEO Protocol API |
| [Enhanced API Reference](05_testing/enhanced-api-reference.md) | Testing API |

---

## Database

### Primary Documentation

| Document | Purpose |
|----------|---------|
| [Database README](../database/README.md) | Database overview |
| [Migration Guide](../database/migrations/README.md) | Migration workflow |
| [Migration Inventory](../database/docs/migration-inventory.md) | All 192+ migrations |
| [Migration Consolidation](../database/docs/MIGRATION_CONSOLIDATION_README.md) | Consolidation status |

### Schema Reference

| Document | Purpose |
|----------|---------|
| [Schema Overview](reference/schema/engineer/database-schema-overview.md) | Quick reference |
| [All Tables (312+)](reference/schema/engineer/README.md) | Complete table docs |

### Database Patterns

| Document | Purpose |
|----------|---------|
| [Database Agent Patterns](reference/database-agent-patterns.md) | Best practices |
| [Migration Checklist](guides/database-migration-checklist.md) | Pre-migration validation |
| [RLS Policy Catalog](reference/rls-policy-catalog.md) | Security policies |

---

## Architecture

| Document | Purpose |
|----------|---------|
| [01_architecture/](01_architecture/) | Architecture documentation |
| [Database Architecture](guides/database-architecture.md) | Database design |

---

## Guides

### Development Guides

| Document | Purpose |
|----------|---------|
| [NPM Scripts Guide](reference/npm-scripts-guide.md) | All 140+ npm scripts |
| [Project Registration](guides/PROJECT_REGISTRATION_GUIDE.md) | Add new projects |
| [Simple Setup](guides/SIMPLE_PROJECT_SETUP.md) | Quick setup |

### Operations

| Document | Purpose |
|----------|---------|
| [Database Distinction](operations/IMPORTANT_DATABASE_DISTINCTION.md) | Database separation |

---

## Reference

### Core Reference

| Document | Purpose |
|----------|---------|
| [NPM Scripts Guide](reference/npm-scripts-guide.md) | Script documentation |
| [Database Agent Patterns](reference/database-agent-patterns.md) | Database patterns |
| [Sub-Agent System](reference/sub-agent-system.md) | Agent catalog |
| [RLS Policy Catalog](reference/rls-policy-catalog.md) | Security policies |
| [Validation Enforcement](reference/validation-enforcement.md) | Validation rules |
| [QA Director Guide](reference/qa-director-guide.md) | QA workflows |
| [Context Monitoring](reference/context-monitoring.md) | Context management |

### Schema Reference

Auto-generated documentation for 312+ database tables:
- [Schema Overview](reference/schema/engineer/database-schema-overview.md)
- [Individual Tables](reference/schema/engineer/tables/)

---

## Testing

| Document | Purpose |
|----------|---------|
| [05_testing/](05_testing/) | Testing documentation |
| [Enhanced API Reference](05_testing/enhanced-api-reference.md) | Test API docs |

---

## Features

| Document | Purpose |
|----------|---------|
| [04_features/](04_features/) | Feature documentation |
| [User Stories v1.1](../database/docs/USER_STORIES_V1.1.md) | Story system docs |

---

## Vision & Specs

| Document | Purpose |
|----------|---------|
| [vision/](vision/) | Vision documentation |
| [API Contracts](vision/specs/02-api-contracts.md) | TypeScript contracts |

---

## Workflows

| Document | Purpose |
|----------|---------|
| [workflows/](workflows/) | Workflow documentation |

---

## Planning

| Document | Purpose |
|----------|---------|
| [planning/](planning/) | Planning documentation |

---

## Research

| Document | Purpose |
|----------|---------|
| [research/](research/) | Research documentation |

---

## By Topic

### Getting Started

1. [README.md](../README.md) - Project overview
2. [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md) - Workflow
3. [NPM Scripts Guide](reference/npm-scripts-guide.md) - Commands

### LEO Protocol

1. [CLAUDE.md](../CLAUDE.md) - Router
2. [CLAUDE_CORE.md](../CLAUDE_CORE.md) - Core rules
3. [Phase-specific files](../CLAUDE_LEAD.md) - LEAD/PLAN/EXEC

### Database Work

1. [Database README](../database/README.md) - Overview
2. [Migration Guide](../database/migrations/README.md) - Migrations
3. [Database Agent Patterns](reference/database-agent-patterns.md) - Best practices
4. [Schema Reference](reference/schema/engineer/README.md) - Table docs

### API Development

1. [API Overview](02_api/api-documentation-overview.md) - All endpoints
2. [LEO API](leo/api.md) - Protocol API

### Testing

1. [E2E Testing](05_testing/) - E2E docs
2. [Enhanced API Reference](05_testing/enhanced-api-reference.md) - Test API

---

## Regenerating Documentation

### Schema Docs

```bash
npm run schema:docs:engineer
```

### CLAUDE.md

```bash
npm run leo:generate
```

### All Background Docs

```bash
npm run docs:bg-all
```

---

## Finding Documentation

### By Keyword

Use `grep` to search across all documentation:

```bash
grep -r "keyword" docs/
```

### By Category

Navigate by directory:
- `docs/01_architecture/` - Architecture
- `docs/02_api/` - API
- `docs/04_features/` - Features
- `docs/05_testing/` - Testing
- `docs/guides/` - How-to guides
- `docs/reference/` - Reference docs
- `docs/vision/` - Vision docs

---

## Documentation Stats

| Category | Approximate Count |
|----------|-------------------|
| Total Markdown Files | 1,800+ |
| Schema Table Docs | 312+ |
| API Endpoints Documented | 59 |
| NPM Scripts Documented | 140+ |

---

*Last Updated: 2026-01-03*
