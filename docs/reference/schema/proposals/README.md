# LEO Self-Improvement Data Contracts


## Table of Contents

- [Overview](#overview)
- [Proposal Lifecycle](#proposal-lifecycle)
  - [State Transitions](#state-transitions)
- [Tables](#tables)
  - [leo_proposals](#leo_proposals)
  - [leo_vetting_rubrics](#leo_vetting_rubrics)
  - [leo_prioritization_config](#leo_prioritization_config)
  - [leo_audit_config](#leo_audit_config)
  - [leo_feature_flags](#leo_feature_flags)
  - [leo_events](#leo_events)
  - [leo_prompts](#leo_prompts)
- [Database Functions](#database-functions)
  - [leo_get_active_configs()](#leo_get_active_configs)
  - [leo_get_active_prompt(p_name TEXT)](#leo_get_active_promptp_name-text)
- [TypeScript Types](#typescript-types)
  - [Available Types](#available-types)
- [RLS Policies](#rls-policies)
- [Migration](#migration)
- [Verification](#verification)
- [Related Documentation](#related-documentation)

**SD**: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)

This document describes the database schema and TypeScript interfaces for the LEO Protocol self-improvement system.

## Overview

The LEO self-improvement system enables controlled, auditable protocol evolution through a structured proposal workflow. The system comprises 7 core tables:

| Table | Purpose |
|-------|---------|
| `leo_proposals` | Self-improvement candidate records with lifecycle state machine |
| `leo_vetting_rubrics` | Versioned rubrics for proposal evaluation |
| `leo_prioritization_config` | System-wide prioritization weights and constraints |
| `leo_audit_config` | Audit requirements and event retention rules |
| `leo_feature_flags` | Controlled rollout and rollback mechanism |
| `leo_events` | Append-only event log for auditability |
| `leo_prompts` | Versioned agent prompts for reproducibility |

## Proposal Lifecycle

```
draft → submitted → triaged → vetting → approved → scheduled → in_progress → completed → archived
                       ↓                    ↓              ↓
                   rejected            rejected      rolled_back → archived
```

### State Transitions

The `leo_proposal_transitions` table defines valid transitions. Invalid transitions are blocked by a database trigger with error message: `invalid_status_transition`.

## Tables

### leo_proposals

Primary table for self-improvement proposals.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| updated_at | timestamptz | NO | Auto-updated on modification |
| created_by | uuid | NO | User who created the proposal |
| owner_team | text | NO | Team responsible (default: 'ehg_engineer') |
| title | text | NO | Proposal title |
| summary | text | NO | Brief summary |
| motivation | text | NO | Why this change is needed |
| scope | jsonb | NO | Array of scope items |
| affected_components | jsonb | NO | Array of affected components |
| risk_level | text | NO | 'low', 'medium', or 'high' |
| status | text | NO | Current lifecycle status |
| constitution_tags | jsonb | NO | Array of constitution tags |
| aegis_compliance_notes | text | YES | AEGIS compliance information |
| rubric_version_id | uuid | YES | FK to rubric used for evaluation |
| rubric_snapshot | jsonb | YES | Frozen rubric at decision time |
| prioritization_snapshot | jsonb | YES | Frozen config at decision time |
| audit_snapshot | jsonb | YES | Frozen audit config at decision time |
| feature_flag_key | text | YES | Associated feature flag |
| decision_reason | text | YES | Why approved/rejected |
| decision_by | uuid | YES | Who made the decision |
| decision_at | timestamptz | YES | When decision was made |

**Indexes:**
- `(status, created_at DESC)` - Query by status
- `(created_by, created_at DESC)` - Query by creator
- GIN on `constitution_tags` - Tag filtering

### leo_vetting_rubrics

Versioned rubrics for evaluating proposals.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| created_by | uuid | NO | Creator |
| name | text | NO | Rubric name |
| version | int | NO | Version number |
| status | text | NO | 'draft', 'published', or 'deprecated' |
| weights | jsonb | NO | Criterion weights (must sum to 1.0) |
| criteria | jsonb | NO | Array of criterion definitions |
| scoring_scale | jsonb | NO | Scoring scale definition |
| description | text | YES | Description |
| effective_from | timestamptz | NO | When rubric becomes effective |
| effective_to | timestamptz | YES | When rubric expires |

**Constraints:**
- Unique: `(name, version)`
- Weights must sum to 1.0 ± 0.0001 (trigger enforced)
- Published rubrics are immutable (trigger enforced)

### leo_prioritization_config

System-wide prioritization configuration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| created_by | uuid | NO | Creator |
| version | int | NO | Version number |
| status | text | NO | 'draft', 'active', or 'deprecated' |
| weights | jsonb | NO | Prioritization weights |
| constraints | jsonb | NO | Prioritization constraints |
| description | text | YES | Description |

**Constraints:**
- Unique: `(version)`

### leo_audit_config

Audit requirements configuration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| created_by | uuid | NO | Creator |
| version | int | NO | Version number |
| status | text | NO | 'draft', 'active', or 'deprecated' |
| event_retention_days | int | NO | Days to retain events (7-3650) |
| pii_redaction_rules | jsonb | NO | PII redaction rules |
| required_event_types | jsonb | NO | Required event types |
| description | text | YES | Description |

**Constraints:**
- Unique: `(version)`
- `event_retention_days` between 7 and 3650

### leo_feature_flags

Feature flags for controlled rollout.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| updated_at | timestamptz | NO | Auto-updated on modification |
| key | text | NO | Unique flag key |
| name | text | NO | Display name |
| description | text | YES | Description |
| status | text | NO | 'draft', 'enabled', 'disabled', 'expired', 'archived' |
| owner_user_id | uuid | NO | Flag owner |
| owner_team | text | NO | Owning team (default: 'ehg_engineer') |
| expires_at | timestamptz | YES | Expiration time |
| conditions | jsonb | NO | Targeting conditions |
| rollout_percentage | int | NO | Rollout % (0-100) |
| proposal_id | uuid | YES | FK to linked proposal |
| last_changed_by | uuid | YES | Last modifier |
| last_changed_at | timestamptz | YES | Last modification time |

**Constraints:**
- Unique: `(key)`
- `rollout_percentage` between 0 and 100
- Cannot enable expired flags (trigger enforced)

### leo_events

Append-only event log.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| actor_user_id | uuid | YES | User who triggered event |
| actor_type | text | NO | 'human', 'agent', or 'system' |
| event_name | text | NO | Event name |
| entity_type | text | NO | Entity type |
| entity_id | uuid | YES | Entity ID |
| correlation_id | uuid | NO | Correlation ID for tracing |
| request_id | text | YES | Request ID |
| severity | text | NO | 'debug', 'info', 'warn', or 'error' |
| payload | jsonb | NO | Event payload |
| pii_level | text | NO | 'none', 'low', or 'high' |

**Constraints:**
- Append-only (UPDATE and DELETE blocked by trigger)
- `entity_type` in ('proposal', 'rubric', 'prioritization_config', 'audit_config', 'feature_flag', 'prompt')

**Indexes:**
- `(created_at DESC)` - Chronological queries
- `(entity_type, entity_id, created_at DESC)` - Entity history
- `(correlation_id)` - Request tracing
- GIN on `payload` - Payload search

### leo_prompts

Versioned agent prompts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | NO | Primary key |
| created_at | timestamptz | NO | Creation timestamp |
| created_by | uuid | NO | Creator |
| name | text | NO | Prompt name |
| version | int | NO | Version number |
| status | text | NO | 'draft', 'active', or 'deprecated' |
| prompt_text | text | NO | The prompt content |
| metadata | jsonb | NO | Prompt metadata |
| checksum | text | NO | SHA-256 hash of prompt_text |

**Constraints:**
- Unique: `(name, version)`
- Unique: `(checksum)`
- Checksum must match SHA-256 of prompt_text (trigger enforced)

## Database Functions

### leo_get_active_configs()

Returns exactly one active prioritization config and one active audit config.

**Returns:**
- `prioritization_config_id`: UUID
- `prioritization_config`: JSONB
- `audit_config_id`: UUID
- `audit_config`: JSONB

**Errors:**
- `invalid_active_config_state` if 0 or >1 active configs exist

### leo_get_active_prompt(p_name TEXT)

Returns the active prompt for a given name.

**Parameters:**
- `p_name`: Prompt name to retrieve

**Returns:**
- `id`: UUID
- `name`: TEXT
- `version`: INT
- `prompt_text`: TEXT
- `metadata`: JSONB
- `checksum`: TEXT

**Errors:**
- `active_prompt_not_found_or_ambiguous` if 0 or >1 active prompts

## TypeScript Types

TypeScript interfaces are available in `types/leo/`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/leo';

const supabase = createClient<Database>(url, key);

// Typed query
const { data } = await supabase
  .from('leo_proposals')
  .select('*')
  .eq('status', 'approved');

// data is correctly typed as LeoProposalRow[]
```

### Available Types

| File | Types |
|------|-------|
| `proposals.ts` | LeoProposalRow, LeoProposalInsert, LeoProposalUpdate, ProposalStatus |
| `rubrics.ts` | LeoVettingRubricRow, RubricWeights, RubricCriterion |
| `config.ts` | LeoPrioritizationConfigRow, LeoAuditConfigRow, ConfigStatus |
| `feature-flags.ts` | LeoFeatureFlagRow, FeatureFlagStatus, FlagConditions |
| `events.ts` | LeoEventRow, LeoEventInsert, EventEntityType, EventName |
| `prompts.ts` | LeoPromptRow, PromptStatus, PromptMetadata |
| `database.ts` | Database (for Supabase client), Json, TableRow, TableInsert |

## RLS Policies

All tables have Row Level Security enabled:

- **Service role**: Full access for server-side operations
- **Anon**: Read-only access to:
  - Published rubrics
  - Active configs
  - Enabled feature flags
  - Active prompts

## Migration

**File**: `database/migrations/20260131_leo_self_improve_data_contracts.sql`

Run with:
```bash
node scripts/run-sql-migration.js database/migrations/20260131_leo_self_improve_data_contracts.sql
```

## Verification

Run the verification script to test all constraints:

```bash
node scripts/verify/leo-data-contracts.js
```

This verifies:
- All tables exist
- State transitions are enforced
- Rubric immutability works
- Weight validation works
- Events are append-only
- Checksum validation works
- Database functions work
- TypeScript types compile

## Related Documentation

- [LEO Protocol Overview](../../01_architecture/leo-protocol-overview.md)
- [AEGIS Governance](../../03_protocols_and_standards/aegis-governance.md)
- [Strategic Directives Field Reference](../database/strategic_directives_v2_field_reference.md)
