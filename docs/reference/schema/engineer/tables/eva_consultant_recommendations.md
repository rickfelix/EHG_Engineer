# eva_consultant_recommendations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T16:01:09.238Z
**Rows**: 51
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| recommendation_date | `date` | **NO** | - | - |
| trend_id | `uuid` | YES | - | - |
| recommendation_type | `text` | **NO** | - | Category: strategic (long-term), tactical (short-term), research (investigation), operational (process) |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| priority_score | `numeric(3,2)` | YES | - | Normalized priority between 0.00 (low) and 1.00 (critical) |
| action_type | `text` | **NO** | - | Suggested next action: create_sd, research, review, defer, or discuss |
| status | `text` | **NO** | `'pending'::text` | Chairman disposition: pending (awaiting review), accepted, deferred, rejected |
| chairman_feedback | `text` | YES | - | - |
| feedback_at | `timestamp with time zone` | YES | - | - |
| application_domain | `text` | YES | - | - |
| detected_by | `text` | YES | `'recommendation-engine.mjs'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| analysis_domain | `text` | YES | - | Business domain: market, product, operations, finance, technology, talent, competitive |
| data_points | `integer(32)` | YES | `0` | Number of data points supporting this finding |
| graduation_date | `timestamp with time zone` | YES | - | Timestamp when a medium-confidence finding graduated to high confidence |
| confidence_tier | `text` | YES | `'medium'::text` | Confidence classification tier: low, medium, or high |

## Constraints

### Primary Key
- `eva_consultant_recommendations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_consultant_recommendations_trend_id_fkey`: trend_id → eva_consultant_trends(id)

### Unique Constraints
- `eva_consultant_recommendations_recommendation_date_title_key`: UNIQUE (recommendation_date, title)

### Check Constraints
- `eva_consultant_recommendations_action_type_check`: CHECK ((action_type = ANY (ARRAY['create_sd'::text, 'research'::text, 'review'::text, 'defer'::text, 'discuss'::text])))
- `eva_consultant_recommendations_confidence_tier_check`: CHECK ((confidence_tier = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
- `eva_consultant_recommendations_priority_score_check`: CHECK (((priority_score >= (0)::numeric) AND (priority_score <= (1)::numeric)))
- `eva_consultant_recommendations_recommendation_type_check`: CHECK ((recommendation_type = ANY (ARRAY['strategic'::text, 'tactical'::text, 'research'::text, 'operational'::text])))
- `eva_consultant_recommendations_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'deferred'::text, 'rejected'::text])))

## Indexes

- `eva_consultant_recommendations_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_recommendations_pkey ON public.eva_consultant_recommendations USING btree (id)
  ```
- `eva_consultant_recommendations_recommendation_date_title_key`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_recommendations_recommendation_date_title_key ON public.eva_consultant_recommendations USING btree (recommendation_date, title)
  ```
- `idx_ecr_domain_type`
  ```sql
  CREATE INDEX idx_ecr_domain_type ON public.eva_consultant_recommendations USING btree (analysis_domain, recommendation_type)
  ```
- `idx_eva_consultant_recommendations_date`
  ```sql
  CREATE INDEX idx_eva_consultant_recommendations_date ON public.eva_consultant_recommendations USING btree (recommendation_date DESC)
  ```
- `idx_eva_consultant_recommendations_status`
  ```sql
  CREATE INDEX idx_eva_consultant_recommendations_status ON public.eva_consultant_recommendations USING btree (status)
  ```
- `idx_eva_consultant_recommendations_trend`
  ```sql
  CREATE INDEX idx_eva_consultant_recommendations_trend ON public.eva_consultant_recommendations USING btree (trend_id)
  ```

## RLS Policies

### 1. anon_select_eva_consultant_recommendations (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. service_role_all_eva_consultant_recommendations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
