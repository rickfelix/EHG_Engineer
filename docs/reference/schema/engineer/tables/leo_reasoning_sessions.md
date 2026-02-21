# leo_reasoning_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:38:02.749Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(255)` | YES | - | - |
| prd_id | `character varying(255)` | YES | - | - |
| depth_level | `character varying(20)` | **NO** | - | - |
| complexity_score | `integer(32)` | YES | - | - |
| auto_trigger_reasons | `ARRAY` | YES | `'{}'::text[]` | - |
| trigger_keywords | `ARRAY` | YES | `'{}'::text[]` | - |
| reasoning_chain | `jsonb` | **NO** | `'{}'::jsonb` | - |
| complexity_factors | `jsonb` | YES | `'{}'::jsonb` | - |
| reasoning_quality_score | `integer(32)` | YES | - | - |
| depth_appropriateness_score | `integer(32)` | YES | - | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| context_tokens_used | `integer(32)` | YES | - | - |
| triggered_by_agent | `character varying(50)` | YES | - | - |
| processed_by_agent | `character varying(50)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_reasoning_sessions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_reasoning_sessions_complexity_score_check`: CHECK (((complexity_score >= 0) AND (complexity_score <= 100)))
- `leo_reasoning_sessions_depth_appropriateness_score_check`: CHECK (((depth_appropriateness_score >= 0) AND (depth_appropriateness_score <= 100)))
- `leo_reasoning_sessions_depth_level_check`: CHECK (((depth_level)::text = ANY ((ARRAY['quick'::character varying, 'standard'::character varying, 'deep'::character varying, 'ultra'::character varying])::text[])))
- `leo_reasoning_sessions_reasoning_quality_score_check`: CHECK (((reasoning_quality_score >= 0) AND (reasoning_quality_score <= 100)))

## Indexes

- `idx_reasoning_complexity_score`
  ```sql
  CREATE INDEX idx_reasoning_complexity_score ON public.leo_reasoning_sessions USING btree (complexity_score DESC)
  ```
- `idx_reasoning_created_at`
  ```sql
  CREATE INDEX idx_reasoning_created_at ON public.leo_reasoning_sessions USING btree (created_at DESC)
  ```
- `idx_reasoning_depth_level`
  ```sql
  CREATE INDEX idx_reasoning_depth_level ON public.leo_reasoning_sessions USING btree (depth_level)
  ```
- `idx_reasoning_prd_id`
  ```sql
  CREATE INDEX idx_reasoning_prd_id ON public.leo_reasoning_sessions USING btree (prd_id)
  ```
- `idx_reasoning_sd_id`
  ```sql
  CREATE INDEX idx_reasoning_sd_id ON public.leo_reasoning_sessions USING btree (sd_id)
  ```
- `idx_reasoning_triggered_by`
  ```sql
  CREATE INDEX idx_reasoning_triggered_by ON public.leo_reasoning_sessions USING btree (triggered_by_agent)
  ```
- `leo_reasoning_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_reasoning_sessions_pkey ON public.leo_reasoning_sessions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_reasoning_sessions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_reasoning_sessions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### reasoning_completion_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_reasoning_completed_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
