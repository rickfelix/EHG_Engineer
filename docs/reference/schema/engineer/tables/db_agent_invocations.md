# db_agent_invocations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-08T23:25:43.489Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| correlation_id | `uuid` | **NO** | - | - |
| conversation_id | `text` | YES | - | - |
| message_id | `text` | YES | - | - |
| intent | `character varying(50)` | **NO** | - | - |
| confidence | `numeric(4,3)` | **NO** | - | - |
| matched_trigger_ids | `ARRAY` | YES | - | - |
| decision | `character varying(50)` | **NO** | - | - |
| block_reason | `text` | YES | - | - |
| environment | `character varying(50)` | YES | - | - |
| db_agent_enabled | `boolean` | YES | - | - |
| execution_result | `jsonb` | YES | - | - |
| latency_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `db_agent_invocations_pkey`: PRIMARY KEY (id)

## Indexes

- `db_agent_invocations_pkey`
  ```sql
  CREATE UNIQUE INDEX db_agent_invocations_pkey ON public.db_agent_invocations USING btree (id)
  ```
- `idx_db_agent_invocations_correlation`
  ```sql
  CREATE INDEX idx_db_agent_invocations_correlation ON public.db_agent_invocations USING btree (correlation_id)
  ```
- `idx_db_agent_invocations_created_at`
  ```sql
  CREATE INDEX idx_db_agent_invocations_created_at ON public.db_agent_invocations USING btree (created_at)
  ```
- `idx_db_agent_invocations_decision`
  ```sql
  CREATE INDEX idx_db_agent_invocations_decision ON public.db_agent_invocations USING btree (decision)
  ```
- `idx_db_agent_invocations_intent`
  ```sql
  CREATE INDEX idx_db_agent_invocations_intent ON public.db_agent_invocations USING btree (intent)
  ```

## RLS Policies

### 1. service_role_all_db_agent_invocations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
