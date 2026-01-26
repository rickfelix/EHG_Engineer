# AI_GUIDE.md - EHG_Engineer Development Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, feature

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 09/04/2025, 08:42:06 AM
**Source**: Supabase Database (not static files)
**Auto-Update**: Run `node scripts/generate-ai-guide-from-db.js` anytime

> Essential context and practices for AI assistants working with the EHG_Engineer platform

## 🟢 CURRENT LEO PROTOCOL VERSION: 4.1.2_database_first

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-1-2-database-first
**Status**: ACTIVE
**Title**: LEO Protocol v4.1.2 - Database-First Enforcement

## Project Overview

**EHG_Engineer** is a sophisticated implementation of the LEO Protocol 4.1.2_database_first for strategic directive management. It provides:
- Database-first architecture with Supabase/PostgreSQL
- Strategic Directive lifecycle management
- Epic Execution Sequence tracking
- HAP blocks for detailed task management
- Complete template system for all LEO Protocol artifacts

## Critical Development Practices

### 1. LEO Protocol 4.1.2_database_first Compliance

This project strictly follows the LEO Protocol multi-agent workflow:
- **undefined**: Implementation Agent (30% total)

### Agent Responsibilities (From Database)

#### Implementation Agent (undefined)
- **Planning**: 0%
- **Implementation**: 30%
- **Verification**: 0%
- **Approval**: 0%
- **Total**: 30%

### 2. Communication Standards (MANDATORY)

All agent communications MUST use this header format:

```markdown
**To:** [Recipient Agent Role/HUMAN]
**From:** [Sending Agent Role]  
**Protocol:** LEO Protocol 4.1.2_database_first (LEO Protocol v4.1.2 - Database-First Enforcement)
**Strategic Directive:** [SD-ID]: [Strategic Directive Title]
**Strategic Directive Path:** `docs/strategic_directives/[SD-ID].md`
**Related PRD:** [PRD-ID]
**Related PRD Path:** `docs/product-requirements/[PRD-ID].md`

**Reference Files Required**:
- `docs/strategic_directives/[SD-ID].md` (Strategic Directive)
- `docs/product-requirements/[PRD-ID].md` (Product Requirements Document)
- `docs/03_protocols_and_standards/` (Protocol Templates)
- `[additional-files-as-needed]` (Context-specific)
```

### 3. Task Execution Options

**Iterative Execution (Default)**:
- Tasks provided one at a time
- Verification between each task
- Best for critical operations
- Allows course correction

**Batch Execution (Advanced)**:
- Multiple related tasks provided together
- Best for routine operations
- Requires explicit confirmation

### 4. Database-First Architecture

All protocol information comes from Supabase:
- Protocol versions in `leo_protocols` table
- Agent definitions in `leo_agents` table
- Sub-agent triggers in `leo_sub_agent_triggers` table
- Handoff templates in `leo_handoff_templates` table

### 5. Key Commands

**Get Current Protocol Version**:
```bash
node scripts/get-latest-leo-protocol-from-db.js
```

**Update AI Guide**:
```bash
node scripts/generate-ai-guide-from-db.js
```

**Update CLAUDE.md**:
```bash
node scripts/generate-claude-md-from-db.js
```

## Directory Structure Standards

Follow the Documentation Standards for file placement:

- `/docs/01_architecture/` - System architecture
- `/docs/02_api/` - API documentation
- `/docs/03_guides/` - User guides and tutorials
- `/docs/04_features/` - Feature documentation
- `/docs/05_testing/` - Testing documentation
- `/docs/06_deployment/` - Deployment guides
- `/docs/07_reports/` - Generated reports
- `/docs/08_applications/` - Generated applications
- `/docs/09_retrospectives/` - Project retrospectives

## Important Notes

1. **Database is Source of Truth** - Protocol information comes from database
2. **Dynamic References** - Always use current protocol version
3. **Auto-Generation** - This file is generated, don't edit manually
4. **Consistent Updates** - Run generation script after protocol changes

---

*Generated from Database: 2025-09-04*
*Protocol Version: 4.1.2_database_first*
*Database-First Architecture: ACTIVE*