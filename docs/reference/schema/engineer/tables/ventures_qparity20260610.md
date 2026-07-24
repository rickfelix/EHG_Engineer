# ventures_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (87 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| name | `character varying(255)` | YES | - | - |
| description | `text` | YES | - | - |
| status | `USER-DEFINED` | YES | - | - |
| portfolio_id | `uuid` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| industry | `character varying(100)` | YES | - | - |
| target_market | `text` | YES | - | - |
| business_model | `text` | YES | - | - |
| value_proposition | `text` | YES | - | - |
| projected_revenue | `numeric(15,2)` | YES | - | - |
| projected_roi | `numeric(5,2)` | YES | - | - |
| funding_required | `numeric(15,2)` | YES | - | - |
| workflow_status | `USER-DEFINED` | YES | - | - |
| ai_score | `numeric(3,2)` | YES | - | - |
| validation_score | `numeric(3,2)` | YES | - | - |
| risk_score | `USER-DEFINED` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| milestone | `character varying(100)` | YES | - | - |
| attention_score | `numeric(3,2)` | YES | - | - |
| dwell_days | `integer(32)` | YES | - | - |
| gate_retries_7d | `integer(32)` | YES | - | - |
| gate_pass_rate_30d | `numeric(5,2)` | YES | - | - |
| milestone_velocity_30d | `numeric(5,2)` | YES | - | - |
| esg_blackout_flag | `boolean` | YES | - | - |
| is_demo | `boolean` | YES | - | - |
| tier | `integer(32)` | YES | - | - |
| source_blueprint_id | `uuid` | YES | - | - |
| workflow_started_at | `timestamp with time zone` | YES | - | - |
| workflow_completed_at | `timestamp with time zone` | YES | - | - |
| recursion_state | `jsonb` | YES | - | - |
| vision_alignment | `text` | YES | - | - |
| strategic_focus | `text` | YES | - | - |
| voice_title_url | `text` | YES | - | - |
| voice_description_url | `text` | YES | - | - |
| unification_version | `character varying(50)` | YES | - | - |
| category | `character varying(100)` | YES | - | - |
| problem_statement | `text` | YES | - | - |
| solution_approach | `text` | YES | - | - |
| unique_value_proposition | `text` | YES | - | - |
| strategic_context | `jsonb` | YES | - | - |
| tags | `ARRAY` | YES | - | - |
| origin_type | `USER-DEFINED` | YES | - | - |
| competitor_ref | `text` | YES | - | - |
| blueprint_id | `text` | YES | - | - |
| solution | `text` | YES | - | - |
| brand_variants | `jsonb` | YES | - | - |
| current_lifecycle_stage | `integer(32)` | YES | - | - |
| venture_code | `character varying(20)` | YES | - | - |
| archetype | `character varying(50)` | YES | - | - |
| deployment_target | `character varying(50)` | YES | - | - |
| deployment_url | `text` | YES | - | - |
| repo_url | `text` | YES | - | - |
| decision_due_at | `timestamp with time zone` | YES | - | - |
| kill_reason | `text` | YES | - | - |
| killed_at | `timestamp with time zone` | YES | - | - |
| cultural_design_style | `USER-DEFINED` | YES | - | - |
| design_style_config | `jsonb` | YES | - | - |
| ceo_agent_id | `uuid` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| health_score | `numeric(3,2)` | YES | - | - |
| calibration_delta | `numeric(5,3)` | YES | - | - |
| health_status | `character varying(20)` | YES | - | - |
| vertical_category | `text` | YES | - | - |
| raw_chairman_intent | `text` | YES | - | - |
| problem_statement_locked_at | `timestamp with time zone` | YES | - | - |
| moat_strategy | `jsonb` | YES | - | - |
| portfolio_synergy_score | `numeric(3,2)` | YES | - | - |
| time_horizon_classification | `text` | YES | - | - |
| build_estimate | `jsonb` | YES | - | - |
| brief_id | `uuid` | YES | - | - |
| discovery_strategy | `text` | YES | - | - |
| vision_id | `uuid` | YES | - | - |
| architecture_plan_id | `uuid` | YES | - | - |
| pipeline_mode | `text` | YES | - | - |
| deleted_at | `timestamp with time zone` | YES | - | - |
| orchestrator_state | `text` | YES | - | - |
| orchestrator_lock_id | `uuid` | YES | - | - |
| orchestrator_lock_acquired_at | `timestamp with time zone` | YES | - | - |
| growth_strategy | `USER-DEFINED` | YES | - | - |
| venture_type | `text` | YES | - | - |
| autonomy_level | `text` | YES | - | - |
| target_platform | `text` | YES | - | - |
| business_model_class | `text` | YES | - | - |
| build_model | `character varying(20)` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
