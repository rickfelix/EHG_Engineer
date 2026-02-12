# leo_vetting_outcomes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T05:02:16.883Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| feedback_id | `uuid` | YES | - | - |
| proposal_id | `uuid` | YES | - | - |
| outcome | `text` | **NO** | - | - |
| rubric_score | `numeric(5,2)` | YES | - | - |
| rubric_version_id | `uuid` | YES | - | - |
| aegis_result | `jsonb` | YES | `'{}'::jsonb` | - |
| processed_by | `text` | **NO** | `'vetting_engine'::text` | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| notes | `text` | YES | - | - |
| human_decision | `text` | YES | - | - |
| human_decision_by | `text` | YES | - | - |
| human_decision_at | `timestamp with time zone` | YES | - | - |
| human_decision_notes | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_vetting_outcomes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_vetting_outcomes_feedback_id_fkey`: feedback_id → leo_feedback(id)
- `leo_vetting_outcomes_proposal_id_fkey`: proposal_id → leo_proposals(id)
- `leo_vetting_outcomes_rubric_version_id_fkey`: rubric_version_id → leo_vetting_rubrics(id)

### Check Constraints
- `leo_vetting_outcomes_human_decision_check`: CHECK ((human_decision = ANY (ARRAY['confirmed'::text, 'overridden'::text, 'reviewed'::text])))
- `leo_vetting_outcomes_outcome_check`: CHECK ((outcome = ANY (ARRAY['approved'::text, 'rejected'::text, 'needs_revision'::text, 'deferred'::text, 'escalated'::text])))
- `leo_vetting_outcomes_rubric_score_check`: CHECK (((rubric_score >= (0)::numeric) AND (rubric_score <= (100)::numeric)))

## Indexes

- `idx_vetting_outcomes_created_at`
  ```sql
  CREATE INDEX idx_vetting_outcomes_created_at ON public.leo_vetting_outcomes USING btree (created_at)
  ```
- `idx_vetting_outcomes_feedback_id`
  ```sql
  CREATE INDEX idx_vetting_outcomes_feedback_id ON public.leo_vetting_outcomes USING btree (feedback_id)
  ```
- `idx_vetting_outcomes_outcome`
  ```sql
  CREATE INDEX idx_vetting_outcomes_outcome ON public.leo_vetting_outcomes USING btree (outcome)
  ```
- `idx_vetting_outcomes_proposal_id`
  ```sql
  CREATE INDEX idx_vetting_outcomes_proposal_id ON public.leo_vetting_outcomes USING btree (proposal_id)
  ```
- `leo_vetting_outcomes_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_vetting_outcomes_pkey ON public.leo_vetting_outcomes USING btree (id)
  ```

## RLS Policies

### 1. Allow human decision updates (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `((outcome = ( SELECT leo_vetting_outcomes_1.outcome
   FROM leo_vetting_outcomes leo_vetting_outcomes_1
  WHERE (leo_vetting_outcomes_1.id = leo_vetting_outcomes_1.id))) AND (rubric_score = ( SELECT leo_vetting_outcomes_1.rubric_score
   FROM leo_vetting_outcomes leo_vetting_outcomes_1
  WHERE (leo_vetting_outcomes_1.id = leo_vetting_outcomes_1.id))) AND (aegis_result = ( SELECT leo_vetting_outcomes_1.aegis_result
   FROM leo_vetting_outcomes leo_vetting_outcomes_1
  WHERE (leo_vetting_outcomes_1.id = leo_vetting_outcomes_1.id))))`

### 2. Allow read access to vetting outcomes (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Allow service role to insert vetting outcomes (INSERT)

- **Roles**: {public}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
