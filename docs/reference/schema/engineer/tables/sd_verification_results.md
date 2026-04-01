# sd_verification_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-01T22:49:08.070Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying` | **NO** | - | - |
| verification_type | `character varying(50)` | **NO** | - | - |
| result | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| score | `integer(32)` | YES | - | - |
| tier | `character varying(20)` | **NO** | `'standard'::character varying` | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |
| verified_at | `timestamp with time zone` | YES | `now()` | - |
| verified_by | `character varying(100)` | YES | `'PCVP_VERIFIER'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_verification_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_verification_results_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_verification_results_score_check`: CHECK (((score >= 0) AND (score <= 100)))

## Indexes

- `idx_svr_result`
  ```sql
  CREATE INDEX idx_svr_result ON public.sd_verification_results USING btree (result)
  ```
- `idx_svr_sd_id`
  ```sql
  CREATE INDEX idx_svr_sd_id ON public.sd_verification_results USING btree (sd_id)
  ```
- `idx_svr_type`
  ```sql
  CREATE INDEX idx_svr_type ON public.sd_verification_results USING btree (verification_type)
  ```
- `sd_verification_results_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_verification_results_pkey ON public.sd_verification_results USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
