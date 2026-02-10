# sdip_ai_analysis Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T10:56:13.611Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| submission_id | `character varying(255)` | YES | - | - |
| analysis_type | `character varying(50)` | **NO** | - | - |
| ai_provider | `character varying(50)` | YES | `'openai'::character varying` | - |
| model_used | `character varying(100)` | YES | - | - |
| prompt_used | `text` | YES | - | - |
| response_data | `jsonb` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `sdip_ai_analysis_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sdip_ai_analysis_submission_id_fkey`: submission_id → directive_submissions(submission_id)

## Indexes

- `idx_ai_submission`
  ```sql
  CREATE INDEX idx_ai_submission ON public.sdip_ai_analysis USING btree (submission_id)
  ```
- `sdip_ai_analysis_pkey`
  ```sql
  CREATE UNIQUE INDEX sdip_ai_analysis_pkey ON public.sdip_ai_analysis USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sdip_ai_analysis (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sdip_ai_analysis (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
