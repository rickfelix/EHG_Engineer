# ai_quality_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-10T16:10:41.778Z
**Rows**: 278
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| content_type | `text` | **NO** | - | Type of content being assessed: sd, prd, user_story, or retrospective |
| content_id | `text` | **NO** | - | ID of the content being assessed (polymorphic FK to respective table) |
| model | `text` | **NO** | `'gpt-4o-mini'::text` | - |
| temperature | `numeric(3,2)` | YES | `0.3` | - |
| scores | `jsonb` | **NO** | - | JSONB: { "criterion_name": { "score": 0-10, "reasoning": "1 sentence why" } } |
| weighted_score | `integer(32)` | **NO** | - | Weighted average of criterion scores (0-100 scale). Threshold: >= 70 to pass. |
| feedback | `jsonb` | YES | `'{}'::jsonb` | JSONB: { "required": ["Fix X"], "recommended": ["Consider Y"] } |
| assessed_at | `timestamp with time zone` | YES | `now()` | - |
| assessment_duration_ms | `integer(32)` | YES | - | - |
| tokens_used | `jsonb` | YES | - | JSONB: { "prompt_tokens": N, "completion_tokens": N, "total_tokens": N } |
| cost_usd | `numeric(10,6)` | YES | - | Actual cost in USD for this assessment (gpt-4o-mini: $0.15/1M input, $0.60/1M output) |
| rubric_version | `text` | YES | `'v1.0.0'::text` | - |
| sd_type | `text` | YES | - | Strategic Directive type: documentation, infrastructure, feature, database, security. Used for conditional threshold and evaluation guidance. |
| pass_threshold | `integer(32)` | YES | `70` | Dynamic pass threshold (0-100) used for this assessment. Varies by sd_type: docs=50%, infra=55%, feature=60%, database=65%, security=65% (Phase 1 baseline). |

## Constraints

### Primary Key
- `ai_quality_assessments_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_assessment_per_content`: UNIQUE (content_type, content_id, assessed_at)

### Check Constraints
- `ai_quality_assessments_content_type_check`: CHECK ((content_type = ANY (ARRAY['sd'::text, 'prd'::text, 'user_story'::text, 'retrospective'::text])))
- `ai_quality_assessments_pass_threshold_check`: CHECK (((pass_threshold >= 0) AND (pass_threshold <= 100)))
- `ai_quality_assessments_sd_type_check`: CHECK ((sd_type = ANY (ARRAY['documentation'::text, 'infrastructure'::text, 'feature'::text, 'database'::text, 'security'::text])))
- `ai_quality_assessments_weighted_score_check`: CHECK (((weighted_score >= 0) AND (weighted_score <= 100)))

## Indexes

- `ai_quality_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX ai_quality_assessments_pkey ON public.ai_quality_assessments USING btree (id)
  ```
- `idx_ai_assessments_content`
  ```sql
  CREATE INDEX idx_ai_assessments_content ON public.ai_quality_assessments USING btree (content_type, content_id)
  ```
- `idx_ai_assessments_model`
  ```sql
  CREATE INDEX idx_ai_assessments_model ON public.ai_quality_assessments USING btree (model)
  ```
- `idx_ai_assessments_passed`
  ```sql
  CREATE INDEX idx_ai_assessments_passed ON public.ai_quality_assessments USING btree (content_type, ((weighted_score >= 70)))
  ```
- `idx_ai_assessments_score`
  ```sql
  CREATE INDEX idx_ai_assessments_score ON public.ai_quality_assessments USING btree (weighted_score)
  ```
- `idx_ai_assessments_time`
  ```sql
  CREATE INDEX idx_ai_assessments_time ON public.ai_quality_assessments USING btree (assessed_at DESC)
  ```
- `idx_ai_quality_assessments_sd_type`
  ```sql
  CREATE INDEX idx_ai_quality_assessments_sd_type ON public.ai_quality_assessments USING btree (sd_type)
  ```
- `unique_assessment_per_content`
  ```sql
  CREATE UNIQUE INDEX unique_assessment_per_content ON public.ai_quality_assessments USING btree (content_type, content_id, assessed_at)
  ```

## RLS Policies

### 1. Allow all for service role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow read for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. Allow read for authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
