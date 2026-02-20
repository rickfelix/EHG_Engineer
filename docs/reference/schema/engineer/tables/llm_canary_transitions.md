# llm_canary_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| canary_state_id | `uuid` | YES | - | - |
| from_stage | `integer(32)` | **NO** | - | - |
| to_stage | `integer(32)` | **NO** | - | - |
| reason | `text` | **NO** | - | - |
| error_rate_at_transition | `numeric(5,4)` | YES | - | - |
| latency_p95_at_transition | `integer(32)` | YES | - | - |
| requests_since_last_stage | `integer(32)` | YES | - | - |
| triggered_by | `text` | **NO** | `'system'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `llm_canary_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `llm_canary_transitions_canary_state_id_fkey`: canary_state_id → llm_canary_state(id)

## Indexes

- `idx_llm_canary_transitions_state`
  ```sql
  CREATE INDEX idx_llm_canary_transitions_state ON public.llm_canary_transitions USING btree (canary_state_id)
  ```
- `idx_llm_canary_transitions_time`
  ```sql
  CREATE INDEX idx_llm_canary_transitions_time ON public.llm_canary_transitions USING btree (created_at DESC)
  ```
- `llm_canary_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_canary_transitions_pkey ON public.llm_canary_transitions USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
