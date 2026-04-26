# integration_verification_records Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| gate_name | `text` | **NO** | - | - |
| result | `text` | **NO** | - | - |
| score | `integer(32)` | YES | `0` | - |
| max_score | `integer(32)` | YES | `100` | - |
| gaps_found | `jsonb` | YES | `'[]'::jsonb` | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |
| checked_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `integration_verification_records_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `integration_verification_records_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `integration_verification_records_result_check`: CHECK ((result = ANY (ARRAY['pass'::text, 'fail'::text, 'skip'::text, 'error'::text])))

## Indexes

- `idx_ivr_checked_at`
  ```sql
  CREATE INDEX idx_ivr_checked_at ON public.integration_verification_records USING btree (checked_at DESC)
  ```
- `idx_ivr_gate_name`
  ```sql
  CREATE INDEX idx_ivr_gate_name ON public.integration_verification_records USING btree (gate_name)
  ```
- `idx_ivr_sd_id`
  ```sql
  CREATE INDEX idx_ivr_sd_id ON public.integration_verification_records USING btree (sd_id)
  ```
- `integration_verification_records_pkey`
  ```sql
  CREATE UNIQUE INDEX integration_verification_records_pkey ON public.integration_verification_records USING btree (id)
  ```

## RLS Policies

### 1. Authenticated read on integration_verification_records (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on integration_verification_records (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
