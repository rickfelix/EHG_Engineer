# leo_error_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T17:46:55.871Z
**Rows**: 10
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| error_type | `text` | **NO** | - | - |
| error_message | `text` | **NO** | - | - |
| error_code | `text` | YES | - | - |
| error_stack | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| operation | `text` | **NO** | - | - |
| component | `text` | **NO** | - | - |
| attempt_count | `integer(32)` | YES | `1` | - |
| is_recoverable | `boolean` | YES | `true` | - |
| recovery_guidance | `text` | YES | - | - |
| suggested_action | `text` | YES | - | - |
| context | `jsonb` | YES | `'{}'::jsonb` | - |
| severity | `text` | **NO** | `'error'::text` | - |
| status | `text` | **NO** | `'new'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| session_id | `text` | YES | - | - |
| user_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `leo_error_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_error_log_error_type_check`: CHECK ((error_type = ANY (ARRAY['API_FAILURE'::text, 'DATABASE_ERROR'::text, 'VALIDATION_ERROR'::text, 'SYSTEM_ERROR'::text, 'NETWORK_ERROR'::text, 'AUTH_ERROR'::text, 'CIRCUIT_BREAKER'::text, 'TIMEOUT'::text, 'RATE_LIMIT'::text, 'UNKNOWN'::text])))
- `leo_error_log_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'error'::text, 'warning'::text, 'info'::text])))
- `leo_error_log_status_check`: CHECK ((status = ANY (ARRAY['new'::text, 'ack'::text, 'resolved'::text, 'ignored'::text])))

## Indexes

- `idx_leo_error_log_component`
  ```sql
  CREATE INDEX idx_leo_error_log_component ON public.leo_error_log USING btree (component)
  ```
- `idx_leo_error_log_created_at`
  ```sql
  CREATE INDEX idx_leo_error_log_created_at ON public.leo_error_log USING btree (created_at DESC)
  ```
- `idx_leo_error_log_sd_id`
  ```sql
  CREATE INDEX idx_leo_error_log_sd_id ON public.leo_error_log USING btree (sd_id)
  ```
- `idx_leo_error_log_severity`
  ```sql
  CREATE INDEX idx_leo_error_log_severity ON public.leo_error_log USING btree (severity)
  ```
- `idx_leo_error_log_status`
  ```sql
  CREATE INDEX idx_leo_error_log_status ON public.leo_error_log USING btree (status)
  ```
- `idx_leo_error_log_type`
  ```sql
  CREATE INDEX idx_leo_error_log_type ON public.leo_error_log USING btree (error_type)
  ```
- `idx_leo_error_log_unresolved`
  ```sql
  CREATE INDEX idx_leo_error_log_unresolved ON public.leo_error_log USING btree (status) WHERE (status = ANY (ARRAY['new'::text, 'ack'::text]))
  ```
- `leo_error_log_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_error_log_pkey ON public.leo_error_log USING btree (id)
  ```

## RLS Policies

### 1. leo_error_log_auth_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_error_log_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_leo_error_log_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_leo_error_log_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
