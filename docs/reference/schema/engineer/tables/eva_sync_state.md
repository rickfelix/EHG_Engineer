# eva_sync_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_type | `text` | **NO** | - | - |
| source_identifier | `text` | **NO** | - | - |
| last_sync_at | `timestamp with time zone` | YES | - | - |
| last_sync_cursor | `text` | YES | - | - |
| total_synced | `integer(32)` | YES | `0` | - |
| source_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| consecutive_failures | `integer(32)` | YES | `0` | - |
| last_error | `text` | YES | - | - |
| last_error_at | `timestamp with time zone` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_sync_state_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_sync_state_source_type_source_identifier_key`: UNIQUE (source_type, source_identifier)

### Check Constraints
- `eva_sync_state_source_type_check`: CHECK ((source_type = ANY (ARRAY['todoist'::text, 'youtube'::text])))

## Indexes

- `eva_sync_state_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_sync_state_pkey ON public.eva_sync_state USING btree (id)
  ```
- `eva_sync_state_source_type_source_identifier_key`
  ```sql
  CREATE UNIQUE INDEX eva_sync_state_source_type_source_identifier_key ON public.eva_sync_state USING btree (source_type, source_identifier)
  ```
- `idx_eva_sync_state_active`
  ```sql
  CREATE INDEX idx_eva_sync_state_active ON public.eva_sync_state USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_eva_sync_state_source`
  ```sql
  CREATE INDEX idx_eva_sync_state_source ON public.eva_sync_state USING btree (source_type)
  ```

## RLS Policies

### 1. manage_eva_sync_state (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_eva_sync_state (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_eva_sync_state_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_intake_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
