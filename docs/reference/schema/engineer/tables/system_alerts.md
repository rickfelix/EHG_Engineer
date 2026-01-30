# system_alerts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T14:08:57.716Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| alert_type | `text` | **NO** | - | - |
| severity | `text` | **NO** | `'warning'::text` | - |
| title | `text` | **NO** | - | - |
| message | `text` | **NO** | - | - |
| source_service | `text` | **NO** | - | - |
| source_entity_id | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| acknowledged_by | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `system_alerts_pkey`: PRIMARY KEY (id)

### Check Constraints
- `system_alerts_alert_type_check`: CHECK ((alert_type = ANY (ARRAY['circuit_breaker'::text, 'threshold_breach'::text, 'system_health'::text, 'eva_error'::text])))
- `system_alerts_severity_check`: CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))

## Indexes

- `idx_system_alerts_created`
  ```sql
  CREATE INDEX idx_system_alerts_created ON public.system_alerts USING btree (created_at DESC)
  ```
- `idx_system_alerts_type_severity`
  ```sql
  CREATE INDEX idx_system_alerts_type_severity ON public.system_alerts USING btree (alert_type, severity)
  ```
- `idx_system_alerts_unresolved`
  ```sql
  CREATE INDEX idx_system_alerts_unresolved ON public.system_alerts USING btree (resolved_at) WHERE (resolved_at IS NULL)
  ```
- `system_alerts_pkey`
  ```sql
  CREATE UNIQUE INDEX system_alerts_pkey ON public.system_alerts USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can view system_alerts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to system_alerts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_system_alerts_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
