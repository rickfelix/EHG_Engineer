# venture_capture_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 65
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| snapshot | `jsonb` | **NO** | `'{}'::jsonb` | JSONB blob: { scoring_thresholds, architecture_patterns, dfe_calibrations, pricing_params, gtm_effectiveness, extractor_version, extracted_at } — same shape as template_data in venture_templates, but this row is NOT a template and NOT consumed by the promotion path. |
| provenance | `text` | **NO** | `'unvalidated'::text` | unvalidated = pre-outcome (default); validated = source venture later outcome-resolved (killed/first-revenue). Provenance alone does NOT trigger promotion — promotion is a separate, explicit, chairman-gated path that does not exist yet. |
| captured_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_capture_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_capture_snapshots_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_capture_snapshots_venture_id_lifecycle_stage_key`: UNIQUE (venture_id, lifecycle_stage)

### Check Constraints
- `venture_capture_snapshots_lifecycle_stage_check`: CHECK (((lifecycle_stage >= 1) AND (lifecycle_stage <= 26)))
- `venture_capture_snapshots_provenance_check`: CHECK ((provenance = ANY (ARRAY['unvalidated'::text, 'validated'::text])))

## Indexes

- `idx_venture_capture_snapshots_venture`
  ```sql
  CREATE INDEX idx_venture_capture_snapshots_venture ON public.venture_capture_snapshots USING btree (venture_id)
  ```
- `venture_capture_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_capture_snapshots_pkey ON public.venture_capture_snapshots USING btree (id)
  ```
- `venture_capture_snapshots_venture_id_lifecycle_stage_key`
  ```sql
  CREATE UNIQUE INDEX venture_capture_snapshots_venture_id_lifecycle_stage_key ON public.venture_capture_snapshots USING btree (venture_id, lifecycle_stage)
  ```

## RLS Policies

### 1. venture_capture_snapshots_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. venture_capture_snapshots_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
