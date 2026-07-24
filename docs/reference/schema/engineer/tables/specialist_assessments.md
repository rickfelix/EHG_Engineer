# specialist_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| assessment_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_candidate_id | `uuid` | YES | - | - |
| council_id | `uuid` | YES | - | - |
| perspective_id | `uuid` | YES | - | - |
| evidence_reviewed | `jsonb` | **NO** | `'[]'::jsonb` | - |
| findings | `jsonb` | **NO** | `'[]'::jsonb` | - |
| opportunities | `jsonb` | **NO** | `'[]'::jsonb` | - |
| risks | `jsonb` | **NO** | `'[]'::jsonb` | - |
| assumptions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| confidence | `numeric(4,3)` | YES | - | - |
| recommended_action | `text` | YES | - | - |
| dissent_flags | `jsonb` | **NO** | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| prompt_version | `text` | YES | - | - |
| model_version | `text` | YES | - | - |

## Constraints

### Primary Key
- `specialist_assessments_pkey`: PRIMARY KEY (assessment_id)

### Check Constraints
- `specialist_assessments_confidence_check`: CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))))
- `specialist_assessments_recommended_action_check`: CHECK (((recommended_action IS NULL) OR (recommended_action = ANY (ARRAY['reject'::text, 'monitor'::text, 'research'::text, 'prototype'::text, 'validate'::text, 'incubate'::text, 'launch'::text, 'scale'::text]))))

## Indexes

- `specialist_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX specialist_assessments_pkey ON public.specialist_assessments USING btree (assessment_id)
  ```

## RLS Policies

### 1. service_role_all_specialist_assessments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
