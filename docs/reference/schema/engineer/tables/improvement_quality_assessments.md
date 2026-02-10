# improvement_quality_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T13:31:44.352Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| improvement_id | `uuid` | YES | - | Reference to the improvement being evaluated |
| evaluator_model | `character varying(50)` | **NO** | - | AI model used for evaluation (e.g., claude-3-sonnet) |
| score | `integer(32)` | YES | - | Overall quality score 0-100 |
| criteria_scores | `jsonb` | YES | - | Breakdown by criteria: specificity, necessity, atomicity, safety, evidence |
| recommendation | `character varying(20)` | YES | - | AI recommendation: APPROVE, REJECT, NEEDS_REVISION |
| reasoning | `text` | YES | - | Detailed reasoning for the score and recommendation |
| evaluated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `improvement_quality_assessments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `improvement_quality_assessments_improvement_id_fkey`: improvement_id → protocol_improvement_queue(id)

### Check Constraints
- `improvement_quality_assessments_score_check`: CHECK (((score >= 0) AND (score <= 100)))

## Indexes

- `improvement_quality_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX improvement_quality_assessments_pkey ON public.improvement_quality_assessments USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_improvement_quality_assessments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
