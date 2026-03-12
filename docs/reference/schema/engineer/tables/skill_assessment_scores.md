# skill_assessment_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-12T11:52:15.801Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| skill_name | `text` | **NO** | - | - |
| skill_file | `text` | **NO** | - | - |
| version | `text` | **NO** | - | - |
| description_text | `text` | YES | - | - |
| rubric_scores | `jsonb` | **NO** | - | - |
| total_score | `numeric(4,2)` | **NO** | - | - |
| is_baseline | `boolean` | YES | `false` | - |
| assessed_at | `timestamp with time zone` | YES | `now()` | - |
| assessed_by | `text` | YES | `'manual'::text` | - |

## Constraints

### Primary Key
- `skill_assessment_scores_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_skill_scores_baseline`
  ```sql
  CREATE INDEX idx_skill_scores_baseline ON public.skill_assessment_scores USING btree (is_baseline) WHERE (is_baseline = true)
  ```
- `idx_skill_scores_name`
  ```sql
  CREATE INDEX idx_skill_scores_name ON public.skill_assessment_scores USING btree (skill_name)
  ```
- `skill_assessment_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX skill_assessment_scores_pkey ON public.skill_assessment_scores USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access_skill_assessment_scores (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
