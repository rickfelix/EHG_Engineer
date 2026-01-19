# eva_circuit_breaker Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T11:57:52.417Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `text` | **NO** | - | - |
| state | `text` | **NO** | `'closed'::text` | - |
| failure_count | `integer(32)` | **NO** | `0` | - |
| failure_threshold | `integer(32)` | **NO** | `3` | - |
| recovery_timeout_ms | `integer(32)` | **NO** | `300000` | - |
| last_failure_at | `timestamp with time zone` | YES | - | - |
| last_success_at | `timestamp with time zone` | YES | - | - |
| tripped_at | `timestamp with time zone` | YES | - | - |
| recent_failures | `jsonb` | YES | `'[]'::jsonb` | - |
| auto_reset_enabled | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_circuit_breaker_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_circuit_breaker_venture_unique`: UNIQUE (venture_id)

### Check Constraints
- `eva_circuit_breaker_state_check`: CHECK ((state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text])))

## Indexes

- `eva_circuit_breaker_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_circuit_breaker_pkey ON public.eva_circuit_breaker USING btree (id)
  ```
- `eva_circuit_breaker_venture_unique`
  ```sql
  CREATE UNIQUE INDEX eva_circuit_breaker_venture_unique ON public.eva_circuit_breaker USING btree (venture_id)
  ```
- `idx_eva_circuit_breaker_state`
  ```sql
  CREATE INDEX idx_eva_circuit_breaker_state ON public.eva_circuit_breaker USING btree (state)
  ```
- `idx_eva_circuit_breaker_venture`
  ```sql
  CREATE INDEX idx_eva_circuit_breaker_venture ON public.eva_circuit_breaker USING btree (venture_id)
  ```

## RLS Policies

### 1. Authenticated users can view eva_circuit_breaker (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to eva_circuit_breaker (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_eva_circuit_breaker_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
