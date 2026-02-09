# debate_circuit_breaker Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:07:57.226Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| run_id | `text` | **NO** | - | - |
| debate_count | `integer(32)` | **NO** | `0` | - |
| max_debates_per_run | `integer(32)` | **NO** | `3` | - |
| last_debate_at | `timestamp with time zone` | YES | - | - |
| cooldown_hours | `integer(32)` | **NO** | `24` | - |
| cooldown_until | `timestamp with time zone` | YES | - | - |
| circuit_open | `boolean` | **NO** | `false` | - |
| trip_reason | `text` | YES | - | - |
| trip_at | `timestamp with time zone` | YES | - | - |
| reset_count | `integer(32)` | **NO** | `0` | - |
| last_reset_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `debate_circuit_breaker_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `debate_circuit_breaker_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `debate_circuit_breaker_sd_id_run_id_key`: UNIQUE (sd_id, run_id)

## Indexes

- `debate_circuit_breaker_pkey`
  ```sql
  CREATE UNIQUE INDEX debate_circuit_breaker_pkey ON public.debate_circuit_breaker USING btree (id)
  ```
- `debate_circuit_breaker_sd_id_run_id_key`
  ```sql
  CREATE UNIQUE INDEX debate_circuit_breaker_sd_id_run_id_key ON public.debate_circuit_breaker USING btree (sd_id, run_id)
  ```
- `idx_circuit_breaker_cooldown`
  ```sql
  CREATE INDEX idx_circuit_breaker_cooldown ON public.debate_circuit_breaker USING btree (cooldown_until)
  ```
- `idx_circuit_breaker_sd_run`
  ```sql
  CREATE INDEX idx_circuit_breaker_sd_run ON public.debate_circuit_breaker USING btree (sd_id, run_id)
  ```
- `idx_circuit_breaker_status`
  ```sql
  CREATE INDEX idx_circuit_breaker_status ON public.debate_circuit_breaker USING btree (circuit_open) WHERE (circuit_open = true)
  ```

## RLS Policies

### 1. Allow read access to circuit breaker (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Allow service role full access to circuit breaker (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
