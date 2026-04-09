# blueprint_quality_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T19:26:25.872Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | FK to ventures table - scopes assessment to a specific venture |
| template_id | `uuid` | YES | - | FK to blueprint_templates - which template was used |
| artifact_type | `text` | **NO** | - | - |
| assessment_scores | `jsonb` | YES | `'{}'::jsonb` | JSONB breakdown of individual rubric dimension scores |
| overall_score | `numeric(5,2)` | YES | - | Weighted aggregate score (0.00 - 100.00) |
| gate_decision | `text` | YES | - | Promotion gate decision: pass, fail, or retry |
| assessor_model | `text` | YES | - | Model identifier that performed the assessment |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `blueprint_quality_assessments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `blueprint_quality_assessments_template_id_fkey`: template_id → blueprint_templates(id)
- `blueprint_quality_assessments_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `blueprint_quality_assessments_gate_decision_check`: CHECK ((gate_decision = ANY (ARRAY['pass'::text, 'fail'::text, 'retry'::text])))

## Indexes

- `blueprint_quality_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX blueprint_quality_assessments_pkey ON public.blueprint_quality_assessments USING btree (id)
  ```
- `idx_bqa_template_id`
  ```sql
  CREATE INDEX idx_bqa_template_id ON public.blueprint_quality_assessments USING btree (template_id)
  ```
- `idx_bqa_venture_id`
  ```sql
  CREATE INDEX idx_bqa_venture_id ON public.blueprint_quality_assessments USING btree (venture_id)
  ```

## RLS Policies

### 1. delete_blueprint_quality_assessments_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = blueprint_quality_assessments.venture_id) AND (v.created_by = auth.uid()))))`

### 2. insert_blueprint_quality_assessments_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = blueprint_quality_assessments.venture_id) AND (v.created_by = auth.uid()))))`

### 3. select_blueprint_quality_assessments_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = blueprint_quality_assessments.venture_id) AND (v.created_by = auth.uid()))))`

### 4. service_role_blueprint_quality_assessments_policy (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. update_blueprint_quality_assessments_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = blueprint_quality_assessments.venture_id) AND (v.created_by = auth.uid()))))`
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = blueprint_quality_assessments.venture_id) AND (v.created_by = auth.uid()))))`

## Triggers

### trg_blueprint_quality_assessments_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
