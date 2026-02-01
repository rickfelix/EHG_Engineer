# leo_audit_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T19:26:07.334Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| enabled | `boolean` | **NO** | `true` | Master switch for audit execution |
| schedule_cron | `text` | **NO** | - | Cron expression for audit schedule (e.g., "0 2 * * 1" for Mondays at 2 AM) |
| timezone | `text` | **NO** | `'UTC'::text` | Timezone for cron schedule interpretation |
| stale_after_days | `integer(32)` | **NO** | `14` | Days before SD marked as stale/abandoned |
| warn_after_days | `integer(32)` | **NO** | `7` | Days before warning about stale SD |
| max_findings_per_sd | `integer(32)` | **NO** | `25` | Maximum findings to report per SD |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_audit_config_pkey`: PRIMARY KEY (id)

## Indexes

- `leo_audit_config_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_audit_config_pkey ON public.leo_audit_config USING btree (id)
  ```

## Triggers

### trigger_leo_audit_config_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_leo_audit_config_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
