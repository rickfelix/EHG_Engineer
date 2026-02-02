# plan_technical_validations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T03:32:43.746Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| technical_feasibility | `text` | **NO** | - | Assessment of technical implementability: HIGH/MEDIUM/LOW |
| implementation_risk | `text` | **NO** | - | Risk level for implementation: HIGH/MEDIUM/LOW |
| resource_timeline | `text` | **NO** | - | Resource availability assessment: REALISTIC/CONSTRAINED/UNREALISTIC |
| quality_assurance | `text` | **NO** | - | QA planning level: COMPREHENSIVE/STANDARD/BASIC |
| final_decision | `text` | **NO** | - | PLAN decision: APPROVE/CONDITIONAL/REDESIGN/DEFER/REJECT/RESEARCH |
| complexity_score | `integer(32)` | YES | `0` | Implementation complexity score (0-10) |
| sub_agent_reports | `jsonb` | YES | `'[]'::jsonb` | JSON array of sub-agent execution results |
| quality_gates | `ARRAY` | YES | `ARRAY[]::text[]` | Array of required quality gates for implementation |
| validated_at | `timestamp with time zone` | YES | `now()` | - |
| validator | `text` | YES | `'PLAN_TECHNICAL_VALIDATION_ORCHESTRATOR_v1.0'::text` | - |
| validation_version | `text` | YES | `'1.0'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `plan_technical_validations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `plan_technical_validations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `plan_technical_validations_sd_id_validated_at_key`: UNIQUE (sd_id, validated_at)

### Check Constraints
- `plan_technical_validations_complexity_score_check`: CHECK (((complexity_score >= 0) AND (complexity_score <= 10)))
- `plan_technical_validations_final_decision_check`: CHECK ((final_decision = ANY (ARRAY['APPROVE'::text, 'CONDITIONAL'::text, 'REDESIGN'::text, 'DEFER'::text, 'REJECT'::text, 'RESEARCH'::text])))
- `plan_technical_validations_implementation_risk_check`: CHECK ((implementation_risk = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `plan_technical_validations_quality_assurance_check`: CHECK ((quality_assurance = ANY (ARRAY['COMPREHENSIVE'::text, 'STANDARD'::text, 'BASIC'::text])))
- `plan_technical_validations_resource_timeline_check`: CHECK ((resource_timeline = ANY (ARRAY['REALISTIC'::text, 'CONSTRAINED'::text, 'UNREALISTIC'::text])))
- `plan_technical_validations_technical_feasibility_check`: CHECK ((technical_feasibility = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))

## Indexes

- `idx_plan_validations_complexity`
  ```sql
  CREATE INDEX idx_plan_validations_complexity ON public.plan_technical_validations USING btree (complexity_score)
  ```
- `idx_plan_validations_decision`
  ```sql
  CREATE INDEX idx_plan_validations_decision ON public.plan_technical_validations USING btree (final_decision)
  ```
- `idx_plan_validations_sd_id`
  ```sql
  CREATE INDEX idx_plan_validations_sd_id ON public.plan_technical_validations USING btree (sd_id)
  ```
- `idx_plan_validations_validated_at`
  ```sql
  CREATE INDEX idx_plan_validations_validated_at ON public.plan_technical_validations USING btree (validated_at DESC)
  ```
- `plan_technical_validations_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_technical_validations_pkey ON public.plan_technical_validations USING btree (id)
  ```
- `plan_technical_validations_sd_id_validated_at_key`
  ```sql
  CREATE UNIQUE INDEX plan_technical_validations_sd_id_validated_at_key ON public.plan_technical_validations USING btree (sd_id, validated_at)
  ```

## RLS Policies

### 1. plan_validations_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. plan_validations_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trigger_create_quality_gates

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION create_quality_gates_from_validation()`

### trigger_update_sd_after_plan_validation

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION update_sd_after_plan_validation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
