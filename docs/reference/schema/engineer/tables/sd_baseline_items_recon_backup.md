# sd_baseline_items_recon_backup Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 41
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| backup_id | `bigint(64)` | **NO** | `nextval('sd_baseline_items_recon_backup_backup_id_seq'::regclass)` | - |
| recon_action | `text` | **NO** | - | - |
| resolved_sd_key | `text` | YES | - | - |
| backed_up_at | `timestamp with time zone` | **NO** | `now()` | - |
| item_id | `uuid` | YES | - | - |
| baseline_id | `uuid` | YES | - | - |
| sd_id | `text` | YES | - | - |
| sequence_rank | `integer(32)` | YES | - | - |
| track | `text` | YES | - | - |
| track_name | `text` | YES | - | - |
| dependencies_snapshot | `jsonb` | YES | - | - |
| dependency_health_score | `numeric` | YES | - | - |
| is_ready | `boolean` | YES | - | - |
| notes | `text` | YES | - | - |
| estimated_effort_hours | `numeric` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `sd_baseline_items_recon_backup_pkey`: PRIMARY KEY (backup_id)

## Indexes

- `sd_baseline_items_recon_backup_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_items_recon_backup_pkey ON public.sd_baseline_items_recon_backup USING btree (backup_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
