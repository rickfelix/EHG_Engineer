# pcvp_verification_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T18:35:15.729Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying` | **NO** | - | - |
| sd_key | `character varying` | YES | - | - |
| event_type | `character varying(50)` | **NO** | - | - |
| event_data | `jsonb` | YES | `'{}'::jsonb` | - |
| verification_score | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | `'PCVP_SYSTEM'::character varying` | - |

## Constraints

### Primary Key
- `pcvp_verification_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_pvl_created_at`
  ```sql
  CREATE INDEX idx_pvl_created_at ON public.pcvp_verification_log USING btree (created_at)
  ```
- `idx_pvl_event_type`
  ```sql
  CREATE INDEX idx_pvl_event_type ON public.pcvp_verification_log USING btree (event_type)
  ```
- `idx_pvl_sd_id`
  ```sql
  CREATE INDEX idx_pvl_sd_id ON public.pcvp_verification_log USING btree (sd_id)
  ```
- `pcvp_verification_log_pkey`
  ```sql
  CREATE UNIQUE INDEX pcvp_verification_log_pkey ON public.pcvp_verification_log USING btree (id)
  ```

## RLS Policies

### 1. pcvp_log_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. pcvp_log_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
