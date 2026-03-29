# venture_artifact_summaries Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T22:45:56.772Z
**Rows**: 29
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| artifact_id | `uuid` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| summary_text | `text` | **NO** | - | - |
| tags | `jsonb` | YES | `'[]'::jsonb` | - |
| llm_model | `text` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| source_updated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_artifact_summaries_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_artifact_summaries_artifact_id_fkey`: artifact_id → venture_artifacts(id)
- `venture_artifact_summaries_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_artifact_summaries_venture_id_artifact_id_key`: UNIQUE (venture_id, artifact_id)

## Indexes

- `idx_vas_artifact_type`
  ```sql
  CREATE INDEX idx_vas_artifact_type ON public.venture_artifact_summaries USING btree (artifact_type)
  ```
- `idx_vas_lifecycle_stage`
  ```sql
  CREATE INDEX idx_vas_lifecycle_stage ON public.venture_artifact_summaries USING btree (lifecycle_stage)
  ```
- `idx_vas_venture_id`
  ```sql
  CREATE INDEX idx_vas_venture_id ON public.venture_artifact_summaries USING btree (venture_id)
  ```
- `venture_artifact_summaries_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_artifact_summaries_pkey ON public.venture_artifact_summaries USING btree (id)
  ```
- `venture_artifact_summaries_venture_id_artifact_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_artifact_summaries_venture_id_artifact_id_key ON public.venture_artifact_summaries USING btree (venture_id, artifact_id)
  ```

## Triggers

### trg_vas_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_vas_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
