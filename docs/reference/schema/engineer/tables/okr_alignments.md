# okr_alignments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying` | **NO** | - | - |
| key_result_id | `uuid` | YES | - | Nullable: an alignment may target the parent objective without a specific key result (the loader filters falsy key_result_id values via .filter(Boolean) before fetching key_results). |
| contribution_type | `text` | YES | - | - |
| impact_weight | `numeric` | YES | `1.0` | Multiplier used by intelligence-loader.js: totalScore += 10 * impact_weight * urgencyMultiplier. Defaults to 1.0; the loader also applies its own `?? 1.0` fallback for legacy/null rows. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `okr_alignments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `okr_alignments_key_result_id_fkey`: key_result_id → key_results(id)
- `okr_alignments_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_okr_alignments_key_result_id`
  ```sql
  CREATE INDEX idx_okr_alignments_key_result_id ON public.okr_alignments USING btree (key_result_id)
  ```
- `idx_okr_alignments_sd_id`
  ```sql
  CREATE INDEX idx_okr_alignments_sd_id ON public.okr_alignments USING btree (sd_id)
  ```
- `okr_alignments_pkey`
  ```sql
  CREATE UNIQUE INDEX okr_alignments_pkey ON public.okr_alignments USING btree (id)
  ```

## RLS Policies

### 1. okr_alignments_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. okr_alignments_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
