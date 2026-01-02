# sd_type_validation_profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T19:42:40.935Z
**Rows**: 11
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| sd_type | `character varying(50)` | **NO** | - | - |
| lead_weight | `integer(32)` | YES | `20` | - |
| plan_weight | `integer(32)` | YES | `20` | - |
| exec_weight | `integer(32)` | YES | `30` | - |
| verify_weight | `integer(32)` | YES | `15` | - |
| final_weight | `integer(32)` | YES | `15` | - |
| requires_prd | `boolean` | YES | `true` | - |
| requires_deliverables | `boolean` | YES | `true` | - |
| requires_e2e_tests | `boolean` | YES | `true` | - |
| requires_retrospective | `boolean` | YES | `true` | - |
| requires_sub_agents | `boolean` | YES | `true` | - |
| min_handoffs | `integer(32)` | YES | `3` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| requires_e2e_in_acceptance_criteria | `boolean` | YES | `false` | If true, user stories for this SD type MUST include E2E test criteria in acceptance_criteria field |
| e2e_acceptance_criteria_template | `jsonb` | YES | - | Template JSON for E2E acceptance criteria that should be included in user stories |
| story_e2e_guidance | `text` | YES | - | Guidance text shown when creating user stories for this SD type |
| required_handoff_types | `ARRAY` | YES | `ARRAY['LEAD-TO-PLAN'::text, 'PLAN-TO-EXEC'::text, 'EXEC-TO-PLAN'::text]` | - |
| requires_user_stories | `boolean` | YES | `true` | If true, user stories must exist AND be validated for the verify phase to pass. Prevents Silent Success anti-pattern. |

## Constraints

### Primary Key
- `sd_type_validation_profiles_pkey`: PRIMARY KEY (sd_type)

### Check Constraints
- `sd_type_validation_profiles_exec_weight_check`: CHECK (((exec_weight >= 0) AND (exec_weight <= 100)))
- `sd_type_validation_profiles_final_weight_check`: CHECK (((final_weight >= 0) AND (final_weight <= 100)))
- `sd_type_validation_profiles_lead_weight_check`: CHECK (((lead_weight >= 0) AND (lead_weight <= 100)))
- `sd_type_validation_profiles_min_handoffs_check`: CHECK (((min_handoffs >= 0) AND (min_handoffs <= 5)))
- `sd_type_validation_profiles_plan_weight_check`: CHECK (((plan_weight >= 0) AND (plan_weight <= 100)))
- `sd_type_validation_profiles_verify_weight_check`: CHECK (((verify_weight >= 0) AND (verify_weight <= 100)))
- `weights_sum_to_100`: CHECK ((((((lead_weight + plan_weight) + exec_weight) + verify_weight) + final_weight) = 100))

## Indexes

- `sd_type_validation_profiles_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_type_validation_profiles_pkey ON public.sd_type_validation_profiles USING btree (sd_type)
  ```

## RLS Policies

### 1. sd_type_validation_profiles_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. sd_type_validation_profiles_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. sd_type_validation_profiles_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. sd_type_validation_profiles_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
