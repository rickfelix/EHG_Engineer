# agent_predictions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| prediction_type | `text` | **NO** | - | - |
| statement | `text` | **NO** | - | - |
| confidence | `numeric` | **NO** | - | - |
| timeframe | `text` | **NO** | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'pending'::text` | - |
| was_correct | `boolean` | YES | - | - |
| actual_value | `numeric` | YES | - | - |
| evidence | `text` | YES | - | - |
| outcome_metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `agent_predictions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_predictions_agent_id_fkey`: agent_id → agent_registry(id)
- `agent_predictions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `agent_predictions_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
- `agent_predictions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text])))

## Indexes

- `agent_predictions_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_predictions_pkey ON public.agent_predictions USING btree (id)
  ```
- `idx_agent_predictions_agent_id`
  ```sql
  CREATE INDEX idx_agent_predictions_agent_id ON public.agent_predictions USING btree (agent_id)
  ```
- `idx_agent_predictions_status`
  ```sql
  CREATE INDEX idx_agent_predictions_status ON public.agent_predictions USING btree (status)
  ```

## RLS Policies

### 1. service_role_all_agent_predictions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
