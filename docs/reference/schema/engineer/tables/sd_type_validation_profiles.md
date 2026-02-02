# sd_type_validation_profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T11:20:40.032Z
**Rows**: 16
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (29 total)

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
| requires_human_verifiable_outcome | `boolean` | YES | `false` | If true, SD completion requires evidence that a human (or LLM acting as human) verified the outcome works. For feature SDs with UI, this triggers UAT Agent + LLM UX Oracle validation. |
| human_verification_type | `text` | YES | `'none'::text` | Type of human verification required: ui_smoke_test (Playwright + LLM UX), api_test (endpoint verification), cli_verification (script output check), documentation_review (manual doc check), none (no human verification) |
| smoke_test_template | `jsonb` | YES | `'[]'::jsonb` | Template for smoke test steps. Array of {step_number, instruction_template, expected_outcome_template}. Merged with SD-specific context at runtime. |
| requires_llm_ux_validation | `boolean` | YES | `false` | If true, LLM UX Oracle (GPT-5.2) must evaluate affected pages with minimum score threshold. |
| llm_ux_min_score | `integer(32)` | YES | `50` | Minimum LLM UX Oracle score (0-100) required for SD completion. Default 50 (standard stringency). |
| llm_ux_required_lenses | `ARRAY` | YES | `ARRAY['first-time-user'::text]` | Which LLM UX Oracle lenses must pass: first-time-user, accessibility, mobile-user, error-recovery, cognitive-load |
| requires_uat_execution | `boolean` | YES | `false` | If true, UAT Agent must execute smoke test steps via Playwright MCP and capture evidence. |
| gate2_exempt_sections | `ARRAY` | YES | `'{}'::text[]` | Array of Gate 2 section codes that are exempt for this SD type. Exempt sections award full points without validation. Valid codes: B1_migrations, B2_rls, B3_complexity, C1_queries, D2_migration_tests |
| required_sub_agents | `jsonb` | YES | `'{}'::jsonb` | Phase-keyed sub-agent requirements. Format: {"PLAN": ["STORIES", "DESIGN"], "EXEC": ["TESTING"]} |

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
- `valid_human_verification_type`: CHECK ((human_verification_type = ANY (ARRAY['ui_smoke_test'::text, 'api_test'::text, 'cli_verification'::text, 'documentation_review'::text, 'none'::text])))
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
