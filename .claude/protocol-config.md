# LEO Protocol Configuration

## Protocol Version
- **Version**: v4.2.0_story_gates
- **Status**: ACTIVE
- **Database ID**: leo-v4-2-0-story-gates

## Core Principles

### 1. Database-First Architecture
- Protocol stored in `leo_protocols` table
- Sub-agents in `leo_sub_agents` table
- Handoffs in `leo_handoff_templates` table
- **Single source of truth - no file conflicts**

### 2. Agent Workflow
**LEAD → PLAN → EXEC → VERIFICATION → APPROVAL**

- **Planning**: Define what and why
- **Technical Design**: Define how
- **Implementation**: Build it
- **Verification**: Prove it works
- **Approval**: Ship it

### 3. Handoff Requirements
Every handoff MUST include 7 elements:
1. Executive Summary
2. Completeness Report
3. Deliverables Manifest
4. Key Decisions & Rationale
5. Known Issues & Risks
6. Resource Utilization
7. Action Items for Receiver

**Missing ANY element = AUTOMATIC REJECTION**

### 4. Quality Gates
- Story gates: ≥85% pass rate target
- Test coverage: ≥50% minimum
- Bundle size: 480KB absolute limit (+50KB delta max)
- PRs: Target ≤100 lines, max 400 with justification

## Database-Only Enforcement

### ABSOLUTE PROHIBITION
**NEVER** create these as files:
- ❌ PRD markdown files (`.md`)
- ❌ Handoff documents
- ❌ Verification reports
- ❌ Any work-related documentation files

### REQUIRED Patterns
- ✅ PRDs: Use `scripts/add-prd-to-database.js`
- ✅ Handoffs: Store in handoff tracking tables
- ✅ Progress: Update database fields directly
- ✅ Verification: Store results in database

## Git Commit Guidelines

### Format (MANDATORY)
```
<type>(<SD-ID>): <subject>

<body>

<footer>
```

### Types
feat, fix, docs, style, refactor, test, chore, perf, ci, revert

### AI Attribution
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Context Management

### Token Budget
- Total Available: 200,000 tokens
- Standard Context: 200K (standard pricing)
- Extended Context: 1M tokens (premium pricing via `[1m]` suffix)
- Current Estimated Usage: ~131K tokens

### Memory Strategy
- Persistent state in `.claude/session-state.md`
- File trees cached in `.claude/file-trees.md`
- Heavy data in Supabase (canonical source)
- Summaries in Claude Code memory (quick access)

## Sub-Agent System

### Activation Types
- **Automatic**: Triggered by keywords/patterns
- **Manual**: Explicitly invoked via commands
- **Conditional**: Context-dependent activation

### Execution Modes (Phase 4)
- **Sequential**: Execute sub-agents one at a time (default, ~15 min)
- **Parallel**: Execute all sub-agents concurrently (60% faster, ~6 min)
  - Use `--parallel` flag with plan-supervisor-verification.js
  - Circuit breaker: 3 retries, exponential backoff
  - Timeout: 5 minutes per sub-agent
  - Conflict resolution: Security > Database > Testing priority

### Available Sub-Agents
- DATABASE - Schema, migrations, queries (Priority: 90)
- SECURITY - Auth, vulnerabilities, encryption (Priority: 100 - Highest)
- TESTING - Unit, integration, e2e, coverage (Priority: 80)
- PERFORMANCE - Optimization, caching, speed (Priority: 70)
- DESIGN - UI/UX, CSS, accessibility (Priority: 60)
- API - REST, GraphQL, integrations (Priority: 50)
- DOCUMENTATION - Docs, guides, comments (Priority: 40)
- COST - Resource optimization (Priority: 30)
- DEPENDENCY - Package management (Priority: 20)
- VALIDATION - Systems analyst, duplicate detection (Priority: 85)

## Commands

### Build & Test (SD-ARCH-EHG-007)
- Build: `npm run build` (TypeScript compilation)
- Test: `npm test`
- Coverage: `npm run test:coverage`
- E2E: `npm run test:e2e` (API tests)
- Note: UI builds are in EHG repository (/mnt/c/_EHG/EHG/)

### LEO Operations
- Execute SD: `npm run leo:execute SD-ID`
- New SD: `npm run leo:new`
- Status: `npm run leo:status`
- Top Priorities: `npm run prio:top3`

### Database
- Create tables: `npm run db:create`
- LEO schema: `npm run db:leo`

## Application Paths (SD-ARCH-EHG-007)

### EHG (Unified Frontend)
- **Path**: `/mnt/c/_EHG/EHG/`
- **Purpose**: Unified frontend (user + admin features at /admin/*)
- **Database**: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)
- **Port**: 8080
- **Stack**: Vite + React + Shadcn + TypeScript
- **Role**: All UI implementation

### EHG_Engineer (Backend API)
- **Path**: `/mnt/c/_EHG/EHG_Engineer/`
- **Purpose**: Backend API + LEO Protocol engine (no standalone UI)
- **Database**: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)
- **Port**: 3000
- **Role**: REST API and LEO Protocol scripts