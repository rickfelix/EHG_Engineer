# advisory_checkpoints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:05:42.917Z
**Rows**: 3
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage_number | `integer(32)` | YES | - | - |
| checkpoint_name | `character varying(100)` | **NO** | - | - |
| description | `text` | YES | - | - |
| trigger_condition | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `advisory_checkpoints_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `advisory_checkpoints_stage_number_fkey`: stage_number → lifecycle_stage_config(stage_number)

## Indexes

- `advisory_checkpoints_pkey`
  ```sql
  CREATE UNIQUE INDEX advisory_checkpoints_pkey ON public.advisory_checkpoints USING btree (id)
  ```
- `idx_advisory_checkpoints_stage`
  ```sql
  CREATE INDEX idx_advisory_checkpoints_stage ON public.advisory_checkpoints USING btree (stage_number)
  ```

## RLS Policies

### 1. advisory_checkpoints_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. advisory_checkpoints_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. advisory_checkpoints_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. advisory_checkpoints_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
