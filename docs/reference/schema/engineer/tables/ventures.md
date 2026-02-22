# ventures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:51:20.959Z
**Rows**: 9
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (76 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `USER-DEFINED` | **NO** | `'active'::venture_status_enum` | - |
| portfolio_id | `uuid` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| industry | `character varying(100)` | YES | - | - |
| target_market | `text` | YES | - | - |
| business_model | `text` | YES | - | - |
| value_proposition | `text` | YES | - | - |
| projected_revenue | `numeric(15,2)` | YES | - | - |
| projected_roi | `numeric(5,2)` | YES | - | - |
| funding_required | `numeric(15,2)` | YES | - | - |
| workflow_status | `USER-DEFINED` | YES | `'pending'::workflow_status_enum` | - |
| ai_score | `numeric(3,2)` | YES | - | - |
| validation_score | `numeric(3,2)` | YES | - | - |
| risk_score | `USER-DEFINED` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| milestone | `character varying(100)` | YES | - | - |
| attention_score | `numeric(3,2)` | YES | - | - |
| dwell_days | `integer(32)` | YES | `0` | - |
| gate_retries_7d | `integer(32)` | YES | `0` | - |
| gate_pass_rate_30d | `numeric(5,2)` | YES | - | - |
| milestone_velocity_30d | `numeric(5,2)` | YES | - | - |
| esg_blackout_flag | `boolean` | YES | `false` | - |
| is_demo | `boolean` | YES | `false` | - |
| tier | `integer(32)` | YES | `1` | - |
| source_blueprint_id | `uuid` | YES | - | - |
| workflow_started_at | `timestamp with time zone` | YES | - | - |
| workflow_completed_at | `timestamp with time zone` | YES | - | - |
| recursion_state | `jsonb` | YES | `'{}'::jsonb` | - |
| vision_alignment | `text` | YES | - | - |
| strategic_focus | `text` | YES | - | - |
| voice_title_url | `text` | YES | - | - |
| voice_description_url | `text` | YES | - | - |
| unification_version | `character varying(50)` | YES | `'legacy'::character varying` | - |
| category | `character varying(100)` | YES | - | - |
| problem_statement | `text` | **NO** | - | - |
| solution_approach | `text` | YES | - | - |
| unique_value_proposition | `text` | YES | - | - |
| strategic_context | `jsonb` | YES | `'{}'::jsonb` | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| origin_type | `USER-DEFINED` | YES | `'manual'::venture_origin_type` | - |
| competitor_ref | `text` | YES | - | - |
| blueprint_id | `text` | YES | - | - |
| solution | `text` | YES | - | - |
| brand_variants | `jsonb` | YES | `'[]'::jsonb` | Array of brand name variants for adaptive naming and multi-market localization. |
| current_lifecycle_stage | `integer(32)` | YES | `1` | CANONICAL stage column (1-25 range). This is the ONLY stage column.
   All other stage columns are DEPRECATED and prefixed with DEPRECATED_.
   SD-UNIFIED-PATH-2.0: One Column Law |
| venture_code | `character varying(20)` | YES | - | - |
| archetype | `character varying(50)` | YES | - | - |
| deployment_target | `character varying(50)` | YES | - | - |
| deployment_url | `text` | YES | - | - |
| repo_url | `text` | YES | - | - |
| decision_due_at | `timestamp with time zone` | YES | - | - |
| kill_reason | `text` | YES | - | - |
| killed_at | `timestamp with time zone` | YES | - | - |
| cultural_design_style | `USER-DEFINED` | YES | - | Cultural design style selected during Stage 10 (Strategic Naming).
Determines UI aesthetic variance applied by the design sub-agent.
Reference: docs/02_api/design_system_handcrafted.md |
| design_style_config | `jsonb` | YES | - | Optional JSON configuration for design style customization.
Example: {"intensity": 5, "color_override": "warm", "accessibility_strict": true} |
| ceo_agent_id | `uuid` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| health_score | `numeric(3,2)` | YES | `0.5` | - |
| calibration_delta | `numeric(5,3)` | YES | `0` | - |
| health_status | `character varying(20)` | YES | - | - |
| vertical_category | `text` | YES | `'other'::text` | Industry vertical for calibration multipliers. Values: healthcare (1.5x), fintech (1.3x), edtech (1.2x), logistics (1.0x), other (1.0x) |
| raw_chairman_intent | `text` | YES | - | Immutable original Chairman input captured at venture creation. This field should NEVER be modified after initial creation. Use problem_statement for the working/editable version. |
| problem_statement_locked_at | `timestamp with time zone` | YES | - | Timestamp when the problem_statement was locked (moved from draft to Stage 1). Once set, the raw_chairman_intent should be considered immutable. |
| moat_strategy | `jsonb` | YES | - | Moat type, compounding mechanism, and portfolio connection from Stage 0 moat architecture step |
| portfolio_synergy_score | `numeric(3,2)` | YES | - | - |
| time_horizon_classification | `text` | YES | - | - |
| build_estimate | `jsonb` | YES | - | - |
| brief_id | `uuid` | YES | - | - |
| discovery_strategy | `text` | YES | - | - |
| vision_id | `uuid` | YES | - | FK to eva_vision_documents. Replaces free-text vision_alignment over time. vision_alignment TEXT kept for backward compatibility until data migration + column drop in a future SD. |
| architecture_plan_id | `uuid` | YES | - | FK to eva_architecture_plans. Links venture to its formal Architecture Plan. |

## Constraints

### Primary Key
- `ventures_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ventures_archetype_fkey`: archetype → archetype_benchmarks(archetype)
- `ventures_architecture_plan_id_fkey`: architecture_plan_id → eva_architecture_plans(id)
- `ventures_brief_id_fkey`: brief_id → venture_briefs(id)
- `ventures_ceo_agent_id_fkey`: ceo_agent_id → agents(id)
- `ventures_company_id_fkey`: company_id → companies(id)
- `ventures_portfolio_id_fkey`: portfolio_id → portfolios(id)
- `ventures_vision_id_fkey`: vision_id → eva_vision_documents(id)

### Check Constraints
- `ventures_current_lifecycle_stage_check`: CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 25)))
- `ventures_health_status_check`: CHECK (((health_status)::text = ANY ((ARRAY['healthy'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
- `ventures_portfolio_synergy_score_check`: CHECK (((portfolio_synergy_score >= (0)::numeric) AND (portfolio_synergy_score <= (1)::numeric)))
- `ventures_time_horizon_classification_check`: CHECK ((time_horizon_classification = ANY (ARRAY['build_now'::text, 'park_later'::text, 'window_closing'::text])))
- `ventures_vertical_category_check`: CHECK ((vertical_category = ANY (ARRAY['healthcare'::text, 'fintech'::text, 'edtech'::text, 'logistics'::text, 'other'::text])))

## Indexes

- `idx_ventures_brand_variants`
  ```sql
  CREATE INDEX idx_ventures_brand_variants ON public.ventures USING gin (brand_variants)
  ```
- `idx_ventures_code`
  ```sql
  CREATE INDEX idx_ventures_code ON public.ventures USING btree (venture_code)
  ```
- `idx_ventures_company`
  ```sql
  CREATE INDEX idx_ventures_company ON public.ventures USING btree (company_id)
  ```
- `idx_ventures_created_by`
  ```sql
  CREATE INDEX idx_ventures_created_by ON public.ventures USING btree (created_by)
  ```
- `idx_ventures_cultural_design_style`
  ```sql
  CREATE INDEX idx_ventures_cultural_design_style ON public.ventures USING btree (cultural_design_style) WHERE (cultural_design_style IS NOT NULL)
  ```
- `idx_ventures_current_lifecycle_stage`
  ```sql
  CREATE INDEX idx_ventures_current_lifecycle_stage ON public.ventures USING btree (current_lifecycle_stage)
  ```
- `idx_ventures_health_score`
  ```sql
  CREATE INDEX idx_ventures_health_score ON public.ventures USING btree (health_score)
  ```
- `idx_ventures_lifecycle_stage`
  ```sql
  CREATE INDEX idx_ventures_lifecycle_stage ON public.ventures USING btree (current_lifecycle_stage)
  ```
- `idx_ventures_origin_type`
  ```sql
  CREATE INDEX idx_ventures_origin_type ON public.ventures USING btree (origin_type)
  ```
- `idx_ventures_portfolio`
  ```sql
  CREATE INDEX idx_ventures_portfolio ON public.ventures USING btree (portfolio_id)
  ```
- `idx_ventures_stage_status`
  ```sql
  CREATE INDEX idx_ventures_stage_status ON public.ventures USING btree (current_lifecycle_stage, status) WHERE (status = 'active'::venture_status_enum)
  ```
- `idx_ventures_status`
  ```sql
  CREATE INDEX idx_ventures_status ON public.ventures USING btree (status)
  ```
- `idx_ventures_variants_awaiting_approval`
  ```sql
  CREATE INDEX idx_ventures_variants_awaiting_approval ON public.ventures USING gin (brand_variants) WHERE (brand_variants @> '[{"lifecycle_status": "AWAITING_APPROVAL"}]'::jsonb)
  ```
- `idx_ventures_vertical_category`
  ```sql
  CREATE INDEX idx_ventures_vertical_category ON public.ventures USING btree (vertical_category)
  ```
- `idx_ventures_vision`
  ```sql
  CREATE INDEX idx_ventures_vision ON public.ventures USING btree (vision_id) WHERE (vision_id IS NOT NULL)
  ```
- `ventures_ceo_agent_id_idx`
  ```sql
  CREATE INDEX ventures_ceo_agent_id_idx ON public.ventures USING btree (ceo_agent_id) WHERE (ceo_agent_id IS NOT NULL)
  ```
- `ventures_pkey`
  ```sql
  CREATE UNIQUE INDEX ventures_pkey ON public.ventures USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated users to delete ventures (DELETE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid())::text = (created_by)::text)`

### 2. Allow authenticated users to insert ventures (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(((auth.uid())::text = (created_by)::text) OR (created_by IS NULL))`

### 3. Allow authenticated users to update ventures (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid())::text = (created_by)::text)`
- **With Check**: `((auth.uid())::text = (created_by)::text)`

### 4. Allow service_role to manage ventures (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. Company access ventures (ALL)

- **Roles**: {authenticated}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE (user_company_access.user_id = auth.uid())))`

## Triggers

### auto_populate_company_id_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_populate_venture_company_id()`

### enforce_tier0_stage_cap

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION prevent_tier0_stage_progression()`

### enforce_tier0_stage_cap

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION prevent_tier0_stage_progression()`

### trg_validate_stage_column

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION fn_validate_stage_column()`

### trg_validate_stage_column

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_validate_stage_column()`

### update_ventures_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_ventures_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
