# scope_completion_chain Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| entity_type | `text` | **NO** | - | - |
| entity_id | `uuid` | **NO** | - | - |
| expected_phase | `text` | YES | - | - |
| actual_phase | `text` | YES | - | - |
| expected_completion_at | `timestamp with time zone` | YES | - | - |
| actual_completion_at | `timestamp with time zone` | YES | - | - |
| chain_status | `text` | **NO** | `'in_progress'::text` | - |
| correlation_id | `uuid` | YES | - | - |
| smoke_test_passed_at | `timestamp with time zone` | YES | - | - |
| runtime_observed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `scope_completion_chain_pkey`: PRIMARY KEY (id)

### Check Constraints
- `scope_completion_chain_chain_status_check`: CHECK ((chain_status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'abandoned'::text, 'superseded'::text])))
- `scope_completion_chain_entity_type_check`: CHECK ((entity_type = ANY (ARRAY['sd'::text, 'handoff'::text, 'phase'::text, 'child_sd'::text])))

## Indexes

- `idx_scope_completion_chain_correlation`
  ```sql
  CREATE INDEX idx_scope_completion_chain_correlation ON public.scope_completion_chain USING btree (correlation_id)
  ```
- `idx_scope_completion_chain_created`
  ```sql
  CREATE INDEX idx_scope_completion_chain_created ON public.scope_completion_chain USING btree (created_at DESC)
  ```
- `idx_scope_completion_chain_entity`
  ```sql
  CREATE INDEX idx_scope_completion_chain_entity ON public.scope_completion_chain USING btree (entity_type, entity_id)
  ```
- `idx_scope_completion_chain_status`
  ```sql
  CREATE INDEX idx_scope_completion_chain_status ON public.scope_completion_chain USING btree (chain_status)
  ```
- `scope_completion_chain_pkey`
  ```sql
  CREATE UNIQUE INDEX scope_completion_chain_pkey ON public.scope_completion_chain USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
