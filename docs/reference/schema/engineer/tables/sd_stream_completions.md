# sd_stream_completions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T00:25:05.664Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| stream_name | `character varying(50)` | **NO** | - | - |
| depth_level | `character varying(20)` | **NO** | - | - |
| status | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| validated_by | `character varying(50)` | YES | - | - |
| validation_score | `integer(32)` | YES | - | - |
| outputs | `jsonb` | YES | `'{}'::jsonb` | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_stream_completions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_stream_completions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_stream_completions_sd_id_stream_name_key`: UNIQUE (sd_id, stream_name)

### Check Constraints
- `sd_stream_completions_depth_level_check`: CHECK (((depth_level)::text = ANY ((ARRAY['checklist'::character varying, 'brief'::character varying, 'full'::character varying, 'adr'::character varying])::text[])))
- `sd_stream_completions_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'skipped'::character varying, 'na'::character varying])::text[])))
- `sd_stream_completions_validation_score_check`: CHECK (((validation_score >= 0) AND (validation_score <= 100)))

## Indexes

- `idx_stream_comp_sd_id`
  ```sql
  CREATE INDEX idx_stream_comp_sd_id ON public.sd_stream_completions USING btree (sd_id)
  ```
- `sd_stream_completions_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_stream_completions_pkey ON public.sd_stream_completions USING btree (id)
  ```
- `sd_stream_completions_sd_id_stream_name_key`
  ```sql
  CREATE UNIQUE INDEX sd_stream_completions_sd_id_stream_name_key ON public.sd_stream_completions USING btree (sd_id, stream_name)
  ```

## RLS Policies

### 1. Stream completions are accessible by all (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
