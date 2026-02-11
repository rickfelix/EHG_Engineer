---
Category: Guide
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, guide]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Developer Setup Guide

This guide covers environment configuration, dependencies, and infrastructure required
to develop against the Eva Orchestrator CLI Venture Lifecycle system.

## Architecture Overview

```
+-----------------------------------------------------------+
|                    Eva Orchestrator                         |
|                                                           |
|  lib/eva/index.js (barrel exports)                        |
|    |                                                      |
|    +-- orchestrator.js         Core state machine         |
|    +-- stage-templates/        30 stage templates         |
|    +-- services/               Research & analysis        |
|    +-- gates/                  Kill/Reality/Promotion     |
|    +-- filters/                Chairman decision filters  |
|    +-- bridge/                 Lifecycle-to-SD bridge     |
|    +-- drift/                  Constraint drift detection |
+-----------------------------------------------------------+
         |                    |                    |
    +----+----+         +----+----+         +----+----+
    | Supabase |         | LLM     |         | LEO     |
    | Database |         | Factory |         | Protocol|
    +----------+         +---------+         +---------+
```

## Prerequisites

### Node.js Runtime

- **Minimum Version**: Node.js 18+ (required for ES module support)
- **Module System**: ES Modules (ESM) throughout the Eva codebase
- **Dynamic Imports**: Used extensively for stage template lazy-loading

The Eva system uses `import()` for dynamic stage template resolution at runtime. CommonJS
`require()` calls are not supported within the Eva module tree.

### Package Manager

- **npm** is the primary package manager
- Run `npm install` from the project root to install all dependencies

## Required Environment Variables

All environment variables are loaded via `dotenv` from the project root `.env` file.

### Database Connection (Required)

| Variable | Purpose | Example |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase project REST API URL | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | `eyJ...` |

The service role key is mandatory because the Eva Orchestrator writes to multiple
tables that are protected by Row Level Security policies. Standard anon keys will
result in RLS policy violations on write operations.

### LLM Configuration (Required)

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENAI_API_KEY` | Cloud OpenAI API access | `sk-...` |
| `USE_LOCAL_LLM` | Route haiku-tier calls to local Ollama | `true` / `false` |
| `OLLAMA_BASE_URL` | Ollama server endpoint (if local) | `http://localhost:11434` |

### Devil's Advocate Integration (Optional)

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENAI_API_KEY` | Powers the Devil's Advocate challenge mechanism | `sk-...` |

The Devil's Advocate uses GPT-4o to provide an adversarial perspective on venture
stage outputs. If `OPENAI_API_KEY` is not set, Devil's Advocate returns a fallback
result and does not block stage progression.

### Session Management (Auto-configured)

| Variable | Purpose | Notes |
|----------|---------|-------|
| `CLAUDE_SESSION_ID` | Current Claude Code session identifier | Set automatically |
| `HOSTNAME` | Machine hostname for multi-session coordination | Set by OS |

## Database Setup

### Required Tables

The Eva Orchestrator depends on the following database tables. All must exist
before the orchestrator can initialize.

```
+---------------------------+     +---------------------------+
|       ventures            |     |   lifecycle_stage_config  |
|---------------------------|     |---------------------------|
| id (uuid, PK)            |     | stage_number (int, PK)    |
| name                     |--+  | stage_name                |
| description              |  |  | stage_category            |
| current_lifecycle_stage   |  |  | depends_on (int[])        |
| venture_type             |  |  | required_artifacts        |
| status                   |  |  | gate_type                 |
| metadata (jsonb)         |  |  | is_active                 |
+---------------------------+  |  +---------------------------+
                               |
+---------------------------+  |  +---------------------------+
|   venture_artifacts       |  |  |   eva_events              |
|---------------------------|  |  |---------------------------|
| id (uuid, PK)            |  +--| venture_id (FK)           |
| venture_id (FK)          |--+  | event_type                |
| artifact_type            |     | stage_number              |
| stage_number             |     | payload (jsonb)           |
| content (jsonb)          |     | created_at                |
| quality_score            |     +---------------------------+
| version                  |
+---------------------------+     +---------------------------+
                                  | chairman_preferences      |
+---------------------------+     |---------------------------|
| venture_stage_transitions |     | venture_id (FK)           |
|---------------------------|     | preference_key            |
| id (uuid, PK)            |     | preference_value (jsonb)  |
| venture_id (FK)          |     | updated_at                |
| from_stage               |     +---------------------------+
| to_stage                 |
| transition_type          |     +---------------------------+
| idempotency_key          |     | strategic_directives_v2   |
| created_at               |     |---------------------------|
+---------------------------+     | (Used by SD bridge)       |
                                  +---------------------------+
```

### Migration Files

Database schema is established through migrations in `database/migrations/`:

- `20260207_cli_venture_lifecycle_sd_hierarchy.sql` - Core venture tables,
  lifecycle stage configuration, stage transitions, and artifact storage

To execute migrations, invoke the DATABASE sub-agent rather than running SQL
directly (per Migration Execution Protocol in CLAUDE.md).

### Seed Data

The `lifecycle_stage_config` table must be populated with all 30 stage definitions.
Each stage row includes:

- `stage_number` (1-30)
- `stage_name` (human-readable label)
- `stage_category` (one of: identity, blueprint, build, launch, growth)
- `depends_on` (array of prerequisite stage numbers)
- `required_artifacts` (artifact types needed before stage can execute)
- `gate_type` (null, kill, reality, promotion)

## LLM Configuration

### Client Factory Integration

The Eva Orchestrator uses the centralized LLM Client Factory at
`lib/llm/client-factory.js` for all LLM interactions. Stage templates specify
their required LLM tier via `STAGE_METADATA.llmTier`.

```
Stage Template llmTier     Client Factory Resolution
─────────────────────      ──────────────────────────────────
"haiku"               →    Local Ollama (if USE_LOCAL_LLM=true)
                            OR cloud Haiku
"sonnet"              →    Cloud Sonnet (always remote)
"opus"                →    Cloud Opus (always remote, never local)
```

### Token Budget Management

Each stage template declares `estimatedTokens` in its STAGE_METADATA. The
orchestrator tracks cumulative token usage across a venture lifecycle run.
If a stage exceeds its budget, a warning is logged but execution continues.

### Model Registry

Models are loaded from the `llm_models` and `llm_providers` database tables
via the `v_llm_model_registry` view. The factory caches this registry for
5 minutes to minimize database calls.

## Module Entry Points

### Primary Entry: lib/eva/index.js

The barrel export file that exposes the public API:

- `createEvaOrchestrator()` - Factory function for orchestrator instances
- `EvaOrchestrator` - Class export for direct instantiation
- Stage template utilities
- Gate and filter exports

### Stage Template Registry: lib/eva/stage-templates/index.js

Central registry that maps stage numbers to their template modules. Provides:

- `getStageTemplate(stageNumber)` - Loads and returns a validated template
- `getAllStageMetadata()` - Returns metadata for all registered templates
- `validateTemplate(template)` - Runs validation checks on a template

### Services Layer: lib/eva/services/

Domain-specific analysis services used by stage templates:

| Service | Path | Purpose |
|---------|------|---------|
| Venture Research | `lib/eva/services/venture-research.js` | Market data aggregation |
| Brand Genome | `lib/eva/services/brand-genome.js` | Brand identity analysis |
| Competitive Intelligence | `lib/eva/services/competitive-intelligence.js` | Competitor landscape |

Services receive their dependencies (db client, LLM client) via injection
from the orchestrator, not through direct imports.

## Dependency Chain

The Eva Orchestrator depends on several core modules. All must be available
at runtime.

### Required Internal Modules

```
Eva Orchestrator
  |
  +-- VentureContextManager (lib/eva/venture-context-manager.js)
  |     Sets and retrieves the active venture context
  |
  +-- ChairmanPreferenceStore (lib/eva/chairman-preference-store.js)
  |     Manages Chairman persona thresholds and preferences
  |
  +-- DecisionFilterEngine (lib/eva/decision-filter-engine.js)
  |     Applies Chairman preference filters to stage decisions
  |
  +-- RealityGates (lib/eva/gates/reality-gates.js)
  |     Validates artifacts exist before stage boundary crossing
  |
  +-- StageGates (lib/eva/gates/stage-gates.js)
  |     Kill gates and promotion gates at configured boundaries
  |
  +-- LifecycleSDbridge (lib/eva/bridge/lifecycle-sd-bridge.js)
  |     Creates LEO Strategic Directives from venture stages
  |
  +-- ConstraintDriftDetector (lib/eva/drift/constraint-drift-detector.js)
        Compares current state against original assumptions
```

### External Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Database client |
| `openai` | Devil's Advocate GPT-4o integration |
| `uuid` | Idempotency key generation |
| `dotenv` | Environment variable loading |

## Test Environment

### Unit Tests

- **Framework**: Vitest
- **Location**: `lib/eva/__tests__/`
- **Pattern**: Dependency injection (no module mocking via `vi.mock`)
- **Run**: `npx vitest run lib/eva/__tests__/`

### Integration Tests

- **Framework**: Vitest with real Supabase connection
- **Requires**: Valid `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- **Run**: `npx vitest run lib/eva/__tests__/ --config vitest.integration.config.js`

### UAT / E2E Tests

- **Framework**: Playwright
- **Location**: `tests/uat/`
- **Requires**: Running LEO stack (Engineer on 3000, App on 8080)
- **Run**: `npx playwright test tests/uat/eva.spec.js`

## Quick Verification Checklist

After setup, verify the environment is ready:

1. Environment variables are set in `.env`
2. Database tables exist (check via `scripts/check-venture-tables.js`)
3. `lifecycle_stage_config` has 30 rows
4. LLM factory initializes without errors
5. Unit tests pass: `npx vitest run lib/eva/__tests__/`
6. Ollama is running (if `USE_LOCAL_LLM=true`): `curl http://localhost:11434/api/tags`

## Related Documentation

- Architecture Overview: `docs/workflow/cli-venture-lifecycle/architecture/`
- Stage Reference: `docs/workflow/cli-venture-lifecycle/reference/`
- LLM Client Factory: `lib/llm/README.md`
- Database Agent Patterns: `docs/reference/database-agent-patterns.md`
