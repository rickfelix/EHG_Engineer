# agent_learning_outcomes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T15:11:07.799Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (33 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| lead_decision | `text` | YES | - | - |
| lead_confidence | `integer(32)` | YES | - | - |
| lead_reasoning | `text` | YES | - | - |
| lead_decision_date | `timestamp with time zone` | YES | - | - |
| plan_decision | `text` | YES | - | - |
| plan_complexity_score | `integer(32)` | YES | - | - |
| plan_technical_feasibility | `text` | YES | - | - |
| plan_implementation_risk | `text` | YES | - | - |
| plan_decision_date | `timestamp with time zone` | YES | - | - |
| exec_final_quality_score | `integer(32)` | YES | - | - |
| exec_implementation_type | `text` | YES | - | - |
| exec_actual_complexity | `integer(32)` | YES | - | - |
| exec_completion_date | `timestamp with time zone` | YES | - | - |
| business_outcome | `text` | YES | - | - |
| business_outcome_date | `timestamp with time zone` | YES | - | - |
| business_outcome_notes | `text` | YES | - | - |
| user_satisfaction_score | `integer(32)` | YES | - | - |
| stakeholder_feedback | `text` | YES | - | - |
| production_issues_count | `integer(32)` | YES | `0` | - |
| performance_meets_requirements | `boolean` | YES | - | - |
| security_issues_found | `integer(32)` | YES | `0` | - |
| accessibility_compliance | `boolean` | YES | - | - |
| usage_adoption_rate | `numeric` | YES | - | - |
| business_kpi_impact | `numeric` | YES | - | - |
| roi_achieved | `numeric` | YES | - | - |
| project_tags | `ARRAY` | YES | - | - |
| complexity_factors | `ARRAY` | YES | - | - |
| success_factors | `ARRAY` | YES | - | - |
| failure_factors | `ARRAY` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `agent_learning_outcomes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_learning_outcomes_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `agent_learning_outcomes_sd_id_key`: UNIQUE (sd_id)

### Check Constraints
- `agent_learning_outcomes_business_outcome_check`: CHECK ((business_outcome = ANY (ARRAY['SUCCESS'::text, 'PARTIAL_SUCCESS'::text, 'FAILURE'::text, 'CANCELLED'::text, 'PENDING'::text])))
- `agent_learning_outcomes_exec_actual_complexity_check`: CHECK (((exec_actual_complexity >= 1) AND (exec_actual_complexity <= 10)))
- `agent_learning_outcomes_exec_final_quality_score_check`: CHECK (((exec_final_quality_score >= 0) AND (exec_final_quality_score <= 100)))
- `agent_learning_outcomes_exec_implementation_type_check`: CHECK ((exec_implementation_type = ANY (ARRAY['UI_COMPONENT'::text, 'API_ENDPOINT'::text, 'DATABASE_CHANGE'::text, 'AUTHENTICATION'::text, 'SYSTEM_TOOLING'::text, 'GENERAL_FEATURE'::text])))
- `agent_learning_outcomes_lead_confidence_check`: CHECK (((lead_confidence >= 0) AND (lead_confidence <= 100)))
- `agent_learning_outcomes_lead_decision_check`: CHECK ((lead_decision = ANY (ARRAY['APPROVE'::text, 'CONDITIONAL'::text, 'CONSOLIDATE'::text, 'DEFER'::text, 'REJECT'::text, 'CLARIFY'::text])))
- `agent_learning_outcomes_plan_complexity_score_check`: CHECK (((plan_complexity_score >= 0) AND (plan_complexity_score <= 10)))
- `agent_learning_outcomes_plan_decision_check`: CHECK ((plan_decision = ANY (ARRAY['APPROVE'::text, 'CONDITIONAL'::text, 'REDESIGN'::text, 'DEFER'::text, 'REJECT'::text, 'RESEARCH'::text])))
- `agent_learning_outcomes_plan_implementation_risk_check`: CHECK ((plan_implementation_risk = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `agent_learning_outcomes_plan_technical_feasibility_check`: CHECK ((plan_technical_feasibility = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `agent_learning_outcomes_user_satisfaction_score_check`: CHECK (((user_satisfaction_score >= 1) AND (user_satisfaction_score <= 10)))

## Indexes

- `agent_learning_outcomes_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_learning_outcomes_pkey ON public.agent_learning_outcomes USING btree (id)
  ```
- `agent_learning_outcomes_sd_id_key`
  ```sql
  CREATE UNIQUE INDEX agent_learning_outcomes_sd_id_key ON public.agent_learning_outcomes USING btree (sd_id)
  ```
- `idx_learning_outcomes_business_outcome`
  ```sql
  CREATE INDEX idx_learning_outcomes_business_outcome ON public.agent_learning_outcomes USING btree (business_outcome)
  ```
- `idx_learning_outcomes_dates`
  ```sql
  CREATE INDEX idx_learning_outcomes_dates ON public.agent_learning_outcomes USING btree (lead_decision_date, plan_decision_date, exec_completion_date)
  ```
- `idx_learning_outcomes_lead_decision`
  ```sql
  CREATE INDEX idx_learning_outcomes_lead_decision ON public.agent_learning_outcomes USING btree (lead_decision)
  ```
- `idx_learning_outcomes_plan_decision`
  ```sql
  CREATE INDEX idx_learning_outcomes_plan_decision ON public.agent_learning_outcomes USING btree (plan_decision)
  ```
- `idx_learning_outcomes_project_tags`
  ```sql
  CREATE INDEX idx_learning_outcomes_project_tags ON public.agent_learning_outcomes USING gin (project_tags)
  ```
- `idx_learning_outcomes_sd_id`
  ```sql
  CREATE INDEX idx_learning_outcomes_sd_id ON public.agent_learning_outcomes USING btree (sd_id)
  ```

## RLS Policies

### 1. intelligence_outcomes_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. intelligence_outcomes_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
