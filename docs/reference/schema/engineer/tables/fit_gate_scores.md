# fit_gate_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T06:32:46.037Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| intake_submission_id | `uuid` | **NO** | - | - |
| evaluated_by | `uuid` | **NO** | - | - |
| evaluator_role | `text` | YES | - | - |
| total_score | `numeric(5,2)` | **NO** | - | Calculated weighted total score (0-100) |
| passing_threshold | `numeric(5,2)` | **NO** | `70.00` | - |
| pass_fail_status | `text` | **NO** | - | Overall evaluation outcome based on threshold and criteria |
| criteria_scores | `jsonb` | **NO** | - | Weighted scoring criteria with scores, weights, and qualitative notes |
| strengths | `ARRAY` | YES | - | - |
| weaknesses | `ARRAY` | YES | - | - |
| recommendations | `ARRAY` | YES | - | - |
| evaluator_notes | `text` | YES | - | - |
| decision_rationale | `text` | YES | - | - |
| confidence_level | `text` | YES | - | - |
| risk_factors | `ARRAY` | YES | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| previous_score_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `fit_gate_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fit_gate_scores_intake_submission_id_fkey`: intake_submission_id → intake_submissions(id)
- `fit_gate_scores_previous_score_id_fkey`: previous_score_id → fit_gate_scores(id)

### Unique Constraints
- `unique_submission_version`: UNIQUE (intake_submission_id, version)

### Check Constraints
- `criteria_scores_not_empty`: CHECK (((jsonb_typeof(criteria_scores) = 'object'::text) AND (criteria_scores <> '{}'::jsonb)))
- `fit_gate_scores_confidence_level_check`: CHECK ((confidence_level = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
- `fit_gate_scores_pass_fail_status_check`: CHECK ((pass_fail_status = ANY (ARRAY['pass'::text, 'fail'::text, 'conditional_pass'::text])))
- `fit_gate_scores_total_score_check`: CHECK (((total_score >= (0)::numeric) AND (total_score <= (100)::numeric)))

## Indexes

- `fit_gate_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX fit_gate_scores_pkey ON public.fit_gate_scores USING btree (id)
  ```
- `idx_fit_gate_scores_created_at`
  ```sql
  CREATE INDEX idx_fit_gate_scores_created_at ON public.fit_gate_scores USING btree (created_at DESC)
  ```
- `idx_fit_gate_scores_criteria_gin`
  ```sql
  CREATE INDEX idx_fit_gate_scores_criteria_gin ON public.fit_gate_scores USING gin (criteria_scores)
  ```
- `idx_fit_gate_scores_evaluated_by`
  ```sql
  CREATE INDEX idx_fit_gate_scores_evaluated_by ON public.fit_gate_scores USING btree (evaluated_by)
  ```
- `idx_fit_gate_scores_pass_fail`
  ```sql
  CREATE INDEX idx_fit_gate_scores_pass_fail ON public.fit_gate_scores USING btree (pass_fail_status)
  ```
- `idx_fit_gate_scores_submission_id`
  ```sql
  CREATE INDEX idx_fit_gate_scores_submission_id ON public.fit_gate_scores USING btree (intake_submission_id)
  ```
- `idx_fit_gate_scores_total_score`
  ```sql
  CREATE INDEX idx_fit_gate_scores_total_score ON public.fit_gate_scores USING btree (total_score DESC)
  ```
- `unique_submission_version`
  ```sql
  CREATE UNIQUE INDEX unique_submission_version ON public.fit_gate_scores USING btree (intake_submission_id, version)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. insert_fit_gate_scores_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `((auth.uid() = evaluated_by) AND (EXISTS ( SELECT 1
   FROM user_organizations
  WHERE ((user_organizations.user_id = auth.uid()) AND (user_organizations.role = ANY (ARRAY['evaluator'::text, 'admin'::text, 'owner'::text]))))))`

### 3. select_fit_gate_scores_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `(intake_submission_id IN ( SELECT intake_submissions.id
   FROM intake_submissions
  WHERE ((auth.uid() = intake_submissions.submitted_by) OR (intake_submissions.organization_id IN ( SELECT user_organizations.organization_id
           FROM user_organizations
          WHERE (user_organizations.user_id = auth.uid()))))))`

### 4. update_fit_gate_scores_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = evaluated_by)`
- **With Check**: `(auth.uid() = evaluated_by)`

## Triggers

### fit_gate_scores_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
