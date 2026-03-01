---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EHG_Engineer Documentation Index



## Table of Contents

- [Metadata](#metadata)
- [⚠️ DATABASE-FIRST DOCUMENTATION ARCHITECTURE](#-database-first-documentation-architecture)
  - [Source of Truth](#source-of-truth)
  - [Updating LEO Protocol Documentation](#updating-leo-protocol-documentation)
  - [Key Database Tables](#key-database-tables)
  - [Documentation Principles](#documentation-principles)
  - [For AI Models Crawling This Repo](#for-ai-models-crawling-this-repo)
- [Quick Start](#quick-start)
- [LEO Protocol (Core)](#leo-protocol-core)
  - [Protocol Files](#protocol-files)
  - [Protocol Reference](#protocol-reference)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Primary Documentation](#primary-documentation)
  - [Schema Reference](#schema-reference)
  - [Database Patterns](#database-patterns)
- [Architecture](#architecture)
- [Guides](#guides)
  - [Development Guides](#development-guides)
  - [Operations](#operations)
- [Reference](#reference)
  - [Core Reference](#core-reference)
  - [Schema Reference](#schema-reference)
- [Testing](#testing)
- [Features](#features)
- [Vision & Specs](#vision-specs)
- [Workflows](#workflows)
- [Planning](#planning)
- [Research](#research)
- [By Topic](#by-topic)
  - [Getting Started](#getting-started)
  - [LEO Protocol](#leo-protocol)
  - [Database Work](#database-work)
  - [API Development](#api-development)
  - [Testing](#testing)
- [Regenerating Documentation](#regenerating-documentation)
  - [Schema Docs](#schema-docs)
  - [CLAUDE.md](#claudemd)
  - [All Background Docs](#all-background-docs)
- [Finding Documentation](#finding-documentation)
  - [By Keyword](#by-keyword)
  - [By Category](#by-category)
- [Documentation Stats](#documentation-stats)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-11
- **Tags**: database, api, testing, e2e

Master index for navigating the documentation library.

---

## ⚠️ DATABASE-FIRST DOCUMENTATION ARCHITECTURE

**IMPORTANT FOR AI MODELS**: LEO Protocol documentation lives in the Supabase database, not markdown files.

### Source of Truth

| Documentation Type | Source | Access Method |
|--------------------|--------|---------------|
| **LEO Protocol** (CLAUDE*.md) | `leo_protocol_sections` table | Query database, then regenerate files |
| **Sub-Agents** | `leo_sub_agents` table | Query database, then regenerate files |
| **Triggers** | `leo_sub_agent_triggers` table | Query database, then regenerate files |
| **Skills** | `.claude/skills/*.md` | Direct file edit |
| **Reference Docs** | `docs/reference/*.md` | Direct file edit |

### Updating LEO Protocol Documentation

```bash
# 1. Query database for section
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .select('id, title, content')
  .ilike('title', '%search term%')
  .then(({data}) => console.log(JSON.stringify(data, null, 2)));
"

# 2. Update database section content
# (Use UPDATE SQL or Node.js script)

# 3. Regenerate CLAUDE*.md files
node scripts/generate-claude-md-from-db.js

# 4. Verify changes
grep -n "your change" CLAUDE*.md
```

### Key Database Tables

| Table | Purpose | Count |
|-------|---------|-------|
| `leo_protocol_sections` | Protocol content blocks | ~370 sections |
| `leo_sub_agents` | Sub-agent definitions | ~25 agents |
| `leo_sub_agent_triggers` | Trigger keywords | ~350 triggers |
| `strategic_directives_v2` | SD metadata | Active SDs |
| `product_requirements_v2` | PRDs and documentation | Active PRDs |

### Documentation Principles

1. **Database-First**: LEO Protocol docs in database, NOT files
2. **Auto-Generated**: CLAUDE*.md files regenerated from database
3. **Direct Edits Only For**: Skills, reference docs, guides
4. **Version Control**: Files checked into git AFTER regeneration

### For AI Models Crawling This Repo

If you're reading this as part of codebase ingestion:

- **Do NOT treat CLAUDE*.md files as source of truth** - they're generated artifacts
- **Query the database** via scripts to get current protocol state
- **Use /document command** (`.claude/commands/document.md`) for updates
- **Invoke DOCMON sub-agent** for database-first validation

---

## Quick Start

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview and setup |
| [development-workflow.md](summaries/development-workflow.md) | Development workflow guide |
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
| [LEO API](leo/api/api.md) | LEO Protocol API |
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
| [Project Registration](guides/project-registration-guide.md) | Add new projects |
| [Simple Setup](guides/simple-project-setup.md) | Quick setup |

### Operations

| Document | Purpose |
|----------|---------|
| [Database Distinction](operations/important-database-distinction.md) | Database separation |

---

## Reference

### Core Reference

| Document | Purpose |
|----------|---------|
| [NPM Scripts Guide](reference/npm-scripts-guide.md) | Script documentation |
| [Database Agent Patterns](reference/database-agent-patterns.md) | Database patterns |
| [Sub-Agent System](leo/sub-agents/sub-agent-system.md) | Agent catalog |
| [RLS Policy Catalog](reference/rls-policy-catalog.md) | Security policies |
| [Validation Enforcement](reference/validation-enforcement.md) | Validation rules |
| [QA Director Guide](reference/qa-director-guide.md) | QA workflows |
| [Context Monitoring](reference/context-monitoring.md) | Context management |

### Schema Reference

Auto-generated documentation for 312+ database tables:
- [Schema Overview](reference/schema/engineer/database-schema-overview.md)
- [Individual Tables](reference/schema/engineer/tables/activity_logs.md)

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
| [planning/](planning/documentation-cleanup-master-plan.md) | Planning documentation |

---

## Research

| Document | Purpose |
|----------|---------|
| [research/](research/) | Research documentation |

---

## By Topic

### Getting Started

1. [README.md](../README.md) - Project overview
2. [development-workflow.md](summaries/development-workflow.md) - Workflow
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
2. [LEO API](leo/api/api.md) - Protocol API

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
