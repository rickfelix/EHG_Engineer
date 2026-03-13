# venture_separability_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-13T22:17:42.364Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| overall_score | `numeric(5,2)` | **NO** | - | - |
| infrastructure_independence | `numeric(5,2)` | YES | `0` | - |
| data_portability | `numeric(5,2)` | YES | `0` | - |
| ip_clarity | `numeric(5,2)` | YES | `0` | - |
| team_dependency | `numeric(5,2)` | YES | `0` | - |
| operational_autonomy | `numeric(5,2)` | YES | `0` | - |
| dimension_weights | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| scored_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_separability_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_separability_scores_venture_id_fkey`: venture_id → eva_ventures(id)

### Check Constraints
- `venture_separability_scores_overall_score_check`: CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)))

## Indexes

- `idx_separability_scores_venture_scored`
  ```sql
  CREATE INDEX idx_separability_scores_venture_scored ON public.venture_separability_scores USING btree (venture_id, scored_at DESC)
  ```
- `venture_separability_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_separability_scores_pkey ON public.venture_separability_scores USING btree (id)
  ```

## RLS Policies

### 1. separability_scores_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. separability_scores_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. separability_scores_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
