# telemetry_thresholds Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T01:15:47.435Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| dimension_type | `text` | **NO** | - | - |
| dimension_key | `text` | YES | - | - |
| threshold_ratio | `numeric` | **NO** | `3.0` | - |
| min_samples | `integer(32)` | **NO** | `3` | - |
| baseline_window_days | `integer(32)` | **NO** | `7` | - |
| lookback_window_days | `integer(32)` | **NO** | `1` | - |
| max_per_run | `integer(32)` | **NO** | `3` | - |
| max_per_day | `integer(32)` | **NO** | `10` | - |
| cooldown_hours | `integer(32)` | **NO** | `24` | - |
| enable_auto_create | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `telemetry_thresholds_pkey`: PRIMARY KEY (id)

### Check Constraints
- `telemetry_thresholds_dimension_type_check`: CHECK ((dimension_type = ANY (ARRAY['global'::text, 'phase'::text, 'gate'::text, 'subagent'::text, 'handoff'::text])))

## Indexes

- `idx_telemetry_thresholds_dimension`
  ```sql
  CREATE INDEX idx_telemetry_thresholds_dimension ON public.telemetry_thresholds USING btree (dimension_type, dimension_key)
  ```
- `idx_telemetry_thresholds_unique_dimension`
  ```sql
  CREATE UNIQUE INDEX idx_telemetry_thresholds_unique_dimension ON public.telemetry_thresholds USING btree (dimension_type, COALESCE(dimension_key, '__global__'::text))
  ```
- `telemetry_thresholds_pkey`
  ```sql
  CREATE UNIQUE INDEX telemetry_thresholds_pkey ON public.telemetry_thresholds USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_telemetry_thresholds (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_telemetry_thresholds (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### telemetry_thresholds_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_telemetry_thresholds_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
