# sd_checkpoint_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-17T11:36:37.316Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| phase | `text` | **NO** | - | - |
| transition | `text` | YES | - | - |
| validation_passed | `boolean` | **NO** | - | - |
| protocol_version | `text` | YES | - | - |
| claude_md_hash | `text` | YES | - | - |
| validation_details | `jsonb` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_checkpoint_history_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_checkpoint_history_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_checkpoint_created`
  ```sql
  CREATE INDEX idx_checkpoint_created ON public.sd_checkpoint_history USING btree (created_at DESC)
  ```
- `idx_checkpoint_sd`
  ```sql
  CREATE INDEX idx_checkpoint_sd ON public.sd_checkpoint_history USING btree (sd_id)
  ```
- `sd_checkpoint_history_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_checkpoint_history_pkey ON public.sd_checkpoint_history USING btree (id)
  ```

## RLS Policies

### 1. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
