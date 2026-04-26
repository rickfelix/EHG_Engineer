# venture_sd_artifact_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_type | `text` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| sd_layer | `text` | **NO** | - | - |
| classification | `text` | **NO** | - | - |
| is_required | `boolean` | **NO** | `false` | - |
| lifecycle_stage | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_sd_artifact_mapping_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_sd_artifact_mapping_venture_type_artifact_type_sd_l_key`: UNIQUE (venture_type, artifact_type, sd_layer)

### Check Constraints
- `venture_sd_artifact_mapping_classification_check`: CHECK ((classification = ANY (ARRAY['universal'::text, 'layer_specific'::text, 'supplemental'::text])))
- `venture_sd_artifact_mapping_sd_layer_check`: CHECK ((sd_layer = ANY (ARRAY['data'::text, 'api'::text, 'ui'::text, 'tests'::text, 'all'::text])))

## Indexes

- `idx_vsam_artifact_type`
  ```sql
  CREATE INDEX idx_vsam_artifact_type ON public.venture_sd_artifact_mapping USING btree (artifact_type)
  ```
- `idx_vsam_classification`
  ```sql
  CREATE INDEX idx_vsam_classification ON public.venture_sd_artifact_mapping USING btree (classification)
  ```
- `idx_vsam_venture_type`
  ```sql
  CREATE INDEX idx_vsam_venture_type ON public.venture_sd_artifact_mapping USING btree (venture_type)
  ```
- `venture_sd_artifact_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_sd_artifact_mapping_pkey ON public.venture_sd_artifact_mapping USING btree (id)
  ```
- `venture_sd_artifact_mapping_venture_type_artifact_type_sd_l_key`
  ```sql
  CREATE UNIQUE INDEX venture_sd_artifact_mapping_venture_type_artifact_type_sd_l_key ON public.venture_sd_artifact_mapping USING btree (venture_type, artifact_type, sd_layer)
  ```

## Triggers

### trg_vsam_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_vsam_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
