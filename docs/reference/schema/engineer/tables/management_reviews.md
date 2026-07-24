# management_reviews Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 10
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| review_date | `date` | **NO** | - | - |
| review_type | `text` | YES | `'weekly'::text` | - |
| baseline_version_from | `integer(32)` | YES | - | - |
| baseline_version_to | `integer(32)` | YES | - | - |
| planned_capabilities | `integer(32)` | YES | - | - |
| actual_capabilities | `integer(32)` | YES | - | - |
| planned_ventures | `integer(32)` | YES | - | - |
| actual_ventures | `integer(32)` | YES | - | - |
| planned_sds | `integer(32)` | YES | - | - |
| actual_sds | `integer(32)` | YES | - | - |
| okr_snapshot | `jsonb` | YES | - | - |
| risk_snapshot | `jsonb` | YES | - | - |
| strategy_health | `jsonb` | YES | - | - |
| decisions | `jsonb` | YES | `'[]'::jsonb` | - |
| actions | `jsonb` | YES | `'[]'::jsonb` | - |
| pipeline_snapshot | `jsonb` | YES | - | - |
| eva_narrative | `text` | YES | - | - |
| eva_proposals | `jsonb` | YES | - | - |
| chairman_notes | `text` | YES | - | - |
| chairman_approved_proposals | `jsonb` | YES | - | - |
| overall_score | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `management_reviews_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `management_reviews_review_date_type_key`: UNIQUE (review_date, review_type)

### Check Constraints
- `management_reviews_overall_score_check`: CHECK (((overall_score >= 0) AND (overall_score <= 100)))
- `management_reviews_review_type_check`: CHECK ((review_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'ad_hoc'::text])))

## Indexes

- `management_reviews_pkey`
  ```sql
  CREATE UNIQUE INDEX management_reviews_pkey ON public.management_reviews USING btree (id)
  ```
- `management_reviews_review_date_type_key`
  ```sql
  CREATE UNIQUE INDEX management_reviews_review_date_type_key ON public.management_reviews USING btree (review_date, review_type)
  ```

## RLS Policies

### 1. authenticated_read_only (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
