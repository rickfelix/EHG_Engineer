# sd_stream_requirements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T22:34:16.420Z
**Rows**: 88
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_type | `character varying(50)` | **NO** | - | - |
| stream_name | `character varying(50)` | **NO** | - | - |
| stream_category | `character varying(20)` | **NO** | - | - |
| requirement_level | `character varying(20)` | **NO** | - | - |
| conditional_keywords | `ARRAY` | YES | `'{}'::text[]` | - |
| minimum_depth | `character varying(20)` | YES | `'checklist'::character varying` | - |
| description | `text` | YES | - | - |
| validation_sub_agent | `character varying(50)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_stream_requirements_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_stream_requirements_sd_type_stream_name_key`: UNIQUE (sd_type, stream_name)

### Check Constraints
- `sd_stream_requirements_minimum_depth_check`: CHECK (((minimum_depth)::text = ANY ((ARRAY['checklist'::character varying, 'brief'::character varying, 'full'::character varying, 'adr'::character varying])::text[])))
- `sd_stream_requirements_requirement_level_check`: CHECK (((requirement_level)::text = ANY ((ARRAY['required'::character varying, 'optional'::character varying, 'conditional'::character varying, 'skip'::character varying])::text[])))
- `sd_stream_requirements_stream_category_check`: CHECK (((stream_category)::text = ANY ((ARRAY['design'::character varying, 'architecture'::character varying])::text[])))

## Indexes

- `idx_stream_req_sd_type`
  ```sql
  CREATE INDEX idx_stream_req_sd_type ON public.sd_stream_requirements USING btree (sd_type)
  ```
- `sd_stream_requirements_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_stream_requirements_pkey ON public.sd_stream_requirements USING btree (id)
  ```
- `sd_stream_requirements_sd_type_stream_name_key`
  ```sql
  CREATE UNIQUE INDEX sd_stream_requirements_sd_type_stream_name_key ON public.sd_stream_requirements USING btree (sd_type, stream_name)
  ```

## RLS Policies

### 1. Stream requirements are readable by all (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
