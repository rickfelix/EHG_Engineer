# sd_metadata_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-21T23:30:46.188Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| changed_field | `text` | **NO** | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | YES | - | - |
| changed_by | `text` | YES | `CURRENT_USER` | - |
| changed_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_metadata_audit_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_metadata_audit_log_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_sd_metadata_audit_changed_at`
  ```sql
  CREATE INDEX idx_sd_metadata_audit_changed_at ON public.sd_metadata_audit_log USING btree (changed_at DESC)
  ```
- `idx_sd_metadata_audit_sd_id`
  ```sql
  CREATE INDEX idx_sd_metadata_audit_sd_id ON public.sd_metadata_audit_log USING btree (sd_id)
  ```
- `sd_metadata_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_metadata_audit_log_pkey ON public.sd_metadata_audit_log USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
