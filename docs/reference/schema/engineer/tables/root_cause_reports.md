# root_cause_reports Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T11:54:04.563Z
**Rows**: 4
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (41 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| scope_type | `text` | **NO** | - | - |
| scope_id | `text` | **NO** | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| prd_id | `character varying(100)` | YES | - | - |
| detected_at | `timestamp with time zone` | **NO** | `now()` | - |
| trigger_source | `text` | **NO** | - | - |
| trigger_tier | `integer(32)` | **NO** | - | - |
| failure_signature | `text` | **NO** | - | Unique identifier for deduplication (e.g., test_name + error_type + file_path) |
| failure_signature_hash | `text` | YES | - | - |
| problem_statement | `text` | **NO** | - | - |
| repro_steps | `text` | YES | - | - |
| repro_success_rate | `numeric` | YES | - | - |
| observed | `jsonb` | **NO** | - | - |
| expected | `jsonb` | **NO** | - | - |
| root_cause | `text` | YES | - | - |
| root_cause_category | `text` | YES | - | - |
| causal_chain | `jsonb` | YES | `'[]'::jsonb` | - |
| contributing_factors | `jsonb` | YES | `'[]'::jsonb` | - |
| evidence_refs | `jsonb` | YES | `'{}'::jsonb` | - |
| log_quality | `integer(32)` | YES | - | - |
| evidence_strength | `integer(32)` | YES | - | - |
| pattern_match_score | `integer(32)` | YES | - | - |
| historical_success_bonus | `integer(32)` | YES | - | - |
| confidence | `integer(32)` | **NO** | - | Confidence score (0-100): BASE(40) + log_quality(20) + evidence_strength(20) + pattern_match(15) + historical_success(5) |
| impact_level | `text` | **NO** | - | - |
| likelihood_level | `text` | **NO** | - | - |
| severity_priority | `text` | YES | - | Generated priority (P0-P4) from impact × likelihood matrix |
| status | `text` | **NO** | `'OPEN'::text` | - |
| analysis_attempts | `integer(32)` | YES | `1` | Guardrail: Limited to 3 attempts before manual escalation required |
| related_rcr_ids | `ARRAY` | YES | - | - |
| pattern_id | `character varying(100)` | YES | - | - |
| recurrence_count | `integer(32)` | YES | `1` | - |
| first_occurrence_at | `timestamp with time zone` | YES | `now()` | - |
| retrospective_id | `uuid` | YES | - | - |
| lessons_captured | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| created_by | `text` | YES | `'RCA'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `root_cause_reports_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `root_cause_reports_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `root_cause_reports_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `root_cause_reports_analysis_attempts_check`: CHECK ((analysis_attempts <= 3))
- `root_cause_reports_confidence_check`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `root_cause_reports_evidence_strength_check`: CHECK (((evidence_strength >= 0) AND (evidence_strength <= 20)))
- `root_cause_reports_historical_success_bonus_check`: CHECK (((historical_success_bonus >= 0) AND (historical_success_bonus <= 5)))
- `root_cause_reports_impact_level_check`: CHECK ((impact_level = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `root_cause_reports_likelihood_level_check`: CHECK ((likelihood_level = ANY (ARRAY['FREQUENT'::text, 'OCCASIONAL'::text, 'RARE'::text, 'ISOLATED'::text])))
- `root_cause_reports_log_quality_check`: CHECK (((log_quality >= 0) AND (log_quality <= 20)))
- `root_cause_reports_pattern_match_score_check`: CHECK (((pattern_match_score >= 0) AND (pattern_match_score <= 15)))
- `root_cause_reports_repro_success_rate_check`: CHECK (((repro_success_rate >= (0)::numeric) AND (repro_success_rate <= (1)::numeric)))
- `root_cause_reports_root_cause_category_check`: CHECK ((root_cause_category = ANY (ARRAY['CODE_DEFECT'::text, 'CONFIG_ERROR'::text, 'INFRASTRUCTURE'::text, 'PROCESS_GAP'::text, 'REQUIREMENTS_AMBIGUITY'::text, 'TEST_COVERAGE_GAP'::text, 'DEPENDENCY_ISSUE'::text, 'ENVIRONMENTAL'::text, 'UNKNOWN'::text])))
- `root_cause_reports_scope_type_check`: CHECK ((scope_type = ANY (ARRAY['SD'::text, 'PRD'::text, 'BACKLOG'::text, 'PIPELINE'::text, 'RUNTIME'::text, 'SUB_AGENT'::text])))
- `root_cause_reports_status_check`: CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'CAPA_PENDING'::text, 'CAPA_APPROVED'::text, 'FIX_IN_PROGRESS'::text, 'RESOLVED'::text, 'WONT_FIX'::text, 'STALE'::text])))
- `root_cause_reports_trigger_source_check`: CHECK ((trigger_source = ANY (ARRAY['QUALITY_GATE'::text, 'CI_PIPELINE'::text, 'RUNTIME'::text, 'MANUAL'::text, 'SUB_AGENT'::text, 'TEST_FAILURE'::text, 'HANDOFF_REJECTION'::text])))
- `root_cause_reports_trigger_tier_check`: CHECK (((trigger_tier >= 1) AND (trigger_tier <= 4)))
- `valid_confidence_for_status`: CHECK ((((status = 'OPEN'::text) AND (confidence >= 40)) OR ((status = ANY (ARRAY['IN_REVIEW'::text, 'CAPA_PENDING'::text])) AND (confidence >= 60)) OR ((status = ANY (ARRAY['CAPA_APPROVED'::text, 'FIX_IN_PROGRESS'::text, 'RESOLVED'::text])) AND (confidence >= 70)) OR (status = ANY (ARRAY['WONT_FIX'::text, 'STALE'::text]))))

## Indexes

- `idx_rcr_created_at`
  ```sql
  CREATE INDEX idx_rcr_created_at ON public.root_cause_reports USING btree (created_at DESC)
  ```
- `idx_rcr_dedup`
  ```sql
  CREATE UNIQUE INDEX idx_rcr_dedup ON public.root_cause_reports USING btree (failure_signature_hash) WHERE (status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text]))
  ```
- `idx_rcr_pattern_id`
  ```sql
  CREATE INDEX idx_rcr_pattern_id ON public.root_cause_reports USING btree (pattern_id) WHERE (pattern_id IS NOT NULL)
  ```
- `idx_rcr_prd_id`
  ```sql
  CREATE INDEX idx_rcr_prd_id ON public.root_cause_reports USING btree (prd_id) WHERE (prd_id IS NOT NULL)
  ```
- `idx_rcr_sd_id`
  ```sql
  CREATE INDEX idx_rcr_sd_id ON public.root_cause_reports USING btree (sd_id) WHERE (sd_id IS NOT NULL)
  ```
- `idx_rcr_severity`
  ```sql
  CREATE INDEX idx_rcr_severity ON public.root_cause_reports USING btree (severity_priority, created_at DESC)
  ```
- `idx_rcr_status`
  ```sql
  CREATE INDEX idx_rcr_status ON public.root_cause_reports USING btree (status) WHERE (status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'CAPA_PENDING'::text]))
  ```
- `idx_rcr_trigger_source`
  ```sql
  CREATE INDEX idx_rcr_trigger_source ON public.root_cause_reports USING btree (trigger_source, trigger_tier)
  ```
- `root_cause_reports_pkey`
  ```sql
  CREATE UNIQUE INDEX root_cause_reports_pkey ON public.root_cause_reports USING btree (id)
  ```

## RLS Policies

### 1. public_insert_root_cause_reports (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. public_select_root_cause_reports (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. public_update_root_cause_reports (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 4. service_role_all_root_cause_reports (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_auto_stale_rca

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_stale_rca()`

### update_rcr_updated_at_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_rcr_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
