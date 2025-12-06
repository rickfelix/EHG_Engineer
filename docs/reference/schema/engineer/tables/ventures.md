# ventures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-04T23:01:42.129Z
**Rows**: 669
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (51 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| stage | `USER-DEFINED` | **NO** | `'draft_idea'::venture_stage_enum` | - |
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
| current_workflow_stage | `integer(32)` | YES | `1` | - |
| workflow_status | `USER-DEFINED` | YES | `'pending'::workflow_status_enum` | - |
| ai_score | `numeric(3,2)` | YES | - | - |
| validation_score | `numeric(3,2)` | YES | - | - |
| risk_score | `USER-DEFINED` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| milestone | `character varying(100)` | YES | - | - |
| current_stage | `integer(32)` | YES | - | - |
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
| problem_statement | `text` | YES | - | - |
| solution_approach | `text` | YES | - | - |
| unique_value_proposition | `text` | YES | - | - |
| strategic_context | `jsonb` | YES | `'{}'::jsonb` | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| origin_type | `USER-DEFINED` | YES | `'manual'::venture_origin_type` | - |
| competitor_ref | `text` | YES | - | - |
| blueprint_id | `text` | YES | - | - |
| solution | `text` | YES | - | - |

## Constraints

### Primary Key
- `ventures_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ventures_company_id_fkey`: company_id → companies(id)
- `ventures_portfolio_id_fkey`: portfolio_id → portfolios(id)

## Indexes

- `idx_ventures_company`
  ```sql
  CREATE INDEX idx_ventures_company ON public.ventures USING btree (company_id)
  ```
- `idx_ventures_created_by`
  ```sql
  CREATE INDEX idx_ventures_created_by ON public.ventures USING btree (created_by)
  ```
- `idx_ventures_origin_type`
  ```sql
  CREATE INDEX idx_ventures_origin_type ON public.ventures USING btree (origin_type)
  ```
- `idx_ventures_portfolio`
  ```sql
  CREATE INDEX idx_ventures_portfolio ON public.ventures USING btree (portfolio_id)
  ```
- `idx_ventures_stage`
  ```sql
  CREATE INDEX idx_ventures_stage ON public.ventures USING btree (stage)
  ```
- `idx_ventures_status`
  ```sql
  CREATE INDEX idx_ventures_status ON public.ventures USING btree (status)
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

- **Roles**: {public}
- **Using**: `((company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE (user_company_access.user_id = auth.uid()))) OR (created_by = auth.uid()))`
- **With Check**: `((company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE (user_company_access.user_id = auth.uid()))) OR (created_by = auth.uid()))`

---

[← Back to Schema Overview](../database-schema-overview.md)
