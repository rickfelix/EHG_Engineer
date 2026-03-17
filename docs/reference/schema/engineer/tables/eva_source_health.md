# eva_source_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T18:58:02.392Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_name | `text` | **NO** | - | Source identifier, e.g. todoist, youtube |
| last_sync_at | `timestamp with time zone` | YES | - | Timestamp of last successful sync |
| last_item_count | `integer(32)` | YES | `0` | Number of items from last sync |
| status | `text` | **NO** | `'healthy'::text` | Health status: healthy, degraded, or stale |
| degraded_since | `timestamp with time zone` | YES | - | Timestamp when source first became degraded |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_source_health_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_source_health_source_name_key`: UNIQUE (source_name)

### Check Constraints
- `eva_source_health_status_check`: CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'stale'::text])))

## Indexes

- `eva_source_health_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_source_health_pkey ON public.eva_source_health USING btree (id)
  ```
- `eva_source_health_source_name_key`
  ```sql
  CREATE UNIQUE INDEX eva_source_health_source_name_key ON public.eva_source_health USING btree (source_name)
  ```
- `idx_eva_source_health_source_name`
  ```sql
  CREATE INDEX idx_eva_source_health_source_name ON public.eva_source_health USING btree (source_name)
  ```
- `idx_eva_source_health_status`
  ```sql
  CREATE INDEX idx_eva_source_health_status ON public.eva_source_health USING btree (status)
  ```

## RLS Policies

### 1. anon_select_eva_source_health (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. service_role_all_eva_source_health (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_eva_source_health_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_source_health_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
