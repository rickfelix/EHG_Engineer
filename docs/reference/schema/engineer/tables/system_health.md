# system_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T03:28:36.177Z
**Rows**: 1
**RLS**: Enabled (6 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| service_name | `character varying(50)` | **NO** | - | - |
| circuit_breaker_state | `character varying(20)` | **NO** | - | State: closed (healthy), open (failing), half-open (recovery test) |
| failure_count | `integer(32)` | YES | `0` | Consecutive failure count (resets on success) |
| last_failure_at | `timestamp with time zone` | YES | - | Timestamp of most recent failure |
| last_success_at | `timestamp with time zone` | YES | - | Timestamp of most recent success |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `system_health_pkey`: PRIMARY KEY (service_name)

### Check Constraints
- `system_health_circuit_breaker_state_check`: CHECK (((circuit_breaker_state)::text = ANY ((ARRAY['open'::character varying, 'half-open'::character varying, 'closed'::character varying])::text[])))

## Indexes

- `system_health_pkey`
  ```sql
  CREATE UNIQUE INDEX system_health_pkey ON public.system_health USING btree (service_name)
  ```

## RLS Policies

### 1. Allow anon users to read system_health (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. Allow authenticated users to insert system_health (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow authenticated users to read system_health (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Allow service role to update system_health (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 5. Allow service_role to delete system_health (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 6. insert_system_health_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
