# lead_evaluations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| business_value | `text` | **NO** | - | Assessment of business impact: HIGH/MEDIUM/LOW |
| duplication_risk | `text` | **NO** | - | Risk of overlapping with existing work: HIGH/MEDIUM/LOW |
| resource_cost | `text` | **NO** | - | Estimated resource requirements: HIGH/MEDIUM/LOW |
| scope_complexity | `text` | **NO** | - | Complexity and scope control assessment: HIGH/MEDIUM/LOW |
| final_decision | `text` | **NO** | - | LEAD decision: APPROVE/CONDITIONAL/CONSOLIDATE/DEFER/REJECT/CLARIFY |
| confidence_score | `integer(32)` | YES | `0` | Confidence in evaluation (0-100) |
| justification | `text` | **NO** | - | - |
| required_actions | `ARRAY` | YES | - | Array of actions required before proceeding |
| evaluated_at | `timestamp with time zone` | YES | `now()` | - |
| evaluator | `text` | YES | `'LEAD_CRITICAL_EVALUATOR_v1.0'::text` | - |
| evaluation_version | `text` | YES | `'1.0'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| business_value_score | `integer(32)` | YES | `50` | - |
| duplication_risk_score | `integer(32)` | YES | `50` | - |
| resource_cost_score | `integer(32)` | YES | `50` | - |
| scope_complexity_score | `integer(32)` | YES | `50` | - |
| technical_debt_impact | `text` | YES | `'NONE'::text` | - |
| dependency_risk | `text` | YES | `'NONE'::text` | - |
| scope_exclusions | `jsonb` | YES | `'[]'::jsonb` | - |
| baseline_snapshot | `jsonb` | YES | `'{}'::jsonb` | - |
| evidence_coverage_score | `integer(32)` | YES | `0` | - |

## Constraints

### Primary Key
- `lead_evaluations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `lead_evaluations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `lead_evaluations_sd_id_evaluated_at_key`: UNIQUE (sd_id, evaluated_at)

### Check Constraints
- `lead_eval_bvs_range`: CHECK (((business_value_score >= 0) AND (business_value_score <= 100)))
- `lead_eval_dr_check`: CHECK ((dependency_risk = ANY (ARRAY['NONE'::text, 'LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))
- `lead_eval_drs_range`: CHECK (((duplication_risk_score >= 0) AND (duplication_risk_score <= 100)))
- `lead_eval_ecs_range`: CHECK (((evidence_coverage_score >= 0) AND (evidence_coverage_score <= 100)))
- `lead_eval_rcs_range`: CHECK (((resource_cost_score >= 0) AND (resource_cost_score <= 100)))
- `lead_eval_scs_range`: CHECK (((scope_complexity_score >= 0) AND (scope_complexity_score <= 100)))
- `lead_eval_tdi_check`: CHECK ((technical_debt_impact = ANY (ARRAY['NONE'::text, 'LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))
- `lead_evaluations_business_value_check`: CHECK ((business_value = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `lead_evaluations_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `lead_evaluations_duplication_risk_check`: CHECK ((duplication_risk = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `lead_evaluations_final_decision_check`: CHECK ((final_decision = ANY (ARRAY['APPROVE'::text, 'CONDITIONAL'::text, 'CONSOLIDATE'::text, 'DEFER'::text, 'REJECT'::text, 'CLARIFY'::text])))
- `lead_evaluations_resource_cost_check`: CHECK ((resource_cost = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `lead_evaluations_scope_complexity_check`: CHECK ((scope_complexity = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))

## Indexes

- `idx_lead_evaluations_confidence`
  ```sql
  CREATE INDEX idx_lead_evaluations_confidence ON public.lead_evaluations USING btree (confidence_score)
  ```
- `idx_lead_evaluations_decision`
  ```sql
  CREATE INDEX idx_lead_evaluations_decision ON public.lead_evaluations USING btree (final_decision)
  ```
- `idx_lead_evaluations_evaluated_at`
  ```sql
  CREATE INDEX idx_lead_evaluations_evaluated_at ON public.lead_evaluations USING btree (evaluated_at DESC)
  ```
- `idx_lead_evaluations_sd_id`
  ```sql
  CREATE INDEX idx_lead_evaluations_sd_id ON public.lead_evaluations USING btree (sd_id)
  ```
- `lead_evaluations_pkey`
  ```sql
  CREATE UNIQUE INDEX lead_evaluations_pkey ON public.lead_evaluations USING btree (id)
  ```
- `lead_evaluations_sd_id_evaluated_at_key`
  ```sql
  CREATE UNIQUE INDEX lead_evaluations_sd_id_evaluated_at_key ON public.lead_evaluations USING btree (sd_id, evaluated_at)
  ```

## RLS Policies

### 1. authenticated_read_lead_evaluations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_lead_evaluations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_sd_after_lead_eval

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION update_sd_after_lead_evaluation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
