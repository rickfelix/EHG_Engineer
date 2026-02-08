# connection_strategies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-08T00:47:01.129Z
**Rows**: 5
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| service_name | `text` | **NO** | - | - |
| method_name | `text` | **NO** | - | - |
| rank | `integer(32)` | **NO** | `1` | - |
| env_var_required | `text` | YES | - | - |
| connection_type | `text` | **NO** | `'supabase_client'::text` | - |
| description | `text` | YES | - | - |
| is_enabled | `boolean` | **NO** | `true` | - |
| config | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `connection_strategies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_connection_strategy`: UNIQUE (service_name, method_name)

### Check Constraints
- `ck_connection_type`: CHECK ((connection_type = ANY (ARRAY['pg_client'::text, 'supabase_client'::text, 'supabase_service'::text, 'http'::text, 'grpc'::text])))

## Indexes

- `connection_strategies_pkey`
  ```sql
  CREATE UNIQUE INDEX connection_strategies_pkey ON public.connection_strategies USING btree (id)
  ```
- `idx_connection_strategies_service_rank`
  ```sql
  CREATE INDEX idx_connection_strategies_service_rank ON public.connection_strategies USING btree (service_name, rank) WHERE (is_enabled = true)
  ```
- `uq_connection_strategy`
  ```sql
  CREATE UNIQUE INDEX uq_connection_strategy ON public.connection_strategies USING btree (service_name, method_name)
  ```

## Triggers

### trg_connection_strategies_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_connection_strategies_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
