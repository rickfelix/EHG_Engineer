# sd_kickbacks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T15:02:05.311Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| from_phase | `text` | **NO** | - | - |
| to_phase | `text` | **NO** | - | - |
| wall_name | `text` | **NO** | - | - |
| failure_reason | `text` | **NO** | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| max_retries | `integer(32)` | YES | `3` | - |
| resolution_status | `text` | YES | `'pending'::text` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| escalated_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_kickbacks_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_kickbacks_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

### Check Constraints
- `sd_kickbacks_resolution_status_check`: CHECK ((resolution_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'resolved'::text, 'escalated'::text])))

## Indexes

- `idx_kickbacks_sd_id`
  ```sql
  CREATE INDEX idx_kickbacks_sd_id ON public.sd_kickbacks USING btree (sd_id)
  ```
- `idx_kickbacks_status`
  ```sql
  CREATE INDEX idx_kickbacks_status ON public.sd_kickbacks USING btree (resolution_status)
  ```
- `sd_kickbacks_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_kickbacks_pkey ON public.sd_kickbacks USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to sd_kickbacks (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
