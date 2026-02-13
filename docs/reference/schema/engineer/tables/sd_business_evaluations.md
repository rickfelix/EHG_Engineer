# sd_business_evaluations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T23:53:41.400Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| business_problem_statement | `text` | YES | - | - |
| solution_value_proposition | `text` | YES | - | - |
| measurable_outcomes | `jsonb` | YES | `'[]'::jsonb` | - |
| roi_calculation | `jsonb` | YES | `'{}'::jsonb` | - |
| duplication_risk | `text` | YES | - | - |
| existing_capabilities_analysis | `text` | YES | - | - |
| resource_justification | `text` | YES | - | - |
| opportunity_cost | `text` | YES | - | - |
| scope_clarity_score | `integer(32)` | YES | - | - |
| complexity_assessment | `text` | YES | - | - |
| minimum_viable_scope | `text` | YES | - | - |
| evaluation_result | `text` | **NO** | - | - |
| evaluation_rationale | `text` | **NO** | - | - |
| conditional_requirements | `text` | YES | - | - |
| evaluated_by | `text` | YES | `'LEAD'::text` | - |
| evaluation_date | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_business_evaluations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_business_evaluations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_business_evaluations_complexity_assessment_check`: CHECK ((complexity_assessment = ANY (ARRAY['SIMPLE'::text, 'MODERATE'::text, 'COMPLEX'::text, 'VERY_COMPLEX'::text])))
- `sd_business_evaluations_duplication_risk_check`: CHECK ((duplication_risk = ANY (ARRAY['NONE'::text, 'LOW'::text, 'MEDIUM'::text, 'HIGH'::text])))
- `sd_business_evaluations_evaluation_result_check`: CHECK ((evaluation_result = ANY (ARRAY['APPROVE'::text, 'CONDITIONAL'::text, 'CONSOLIDATE'::text, 'DEFER'::text, 'REJECT'::text, 'CLARIFY'::text])))
- `sd_business_evaluations_scope_clarity_score_check`: CHECK (((scope_clarity_score >= 1) AND (scope_clarity_score <= 10)))

## Indexes

- `idx_business_evaluations_result`
  ```sql
  CREATE INDEX idx_business_evaluations_result ON public.sd_business_evaluations USING btree (evaluation_result)
  ```
- `idx_business_evaluations_sd_id`
  ```sql
  CREATE INDEX idx_business_evaluations_sd_id ON public.sd_business_evaluations USING btree (sd_id)
  ```
- `sd_business_evaluations_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_business_evaluations_pkey ON public.sd_business_evaluations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_business_evaluations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_business_evaluations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
