# risk_recalibration_forms Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T02:21:57.307Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (43 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| venture_id | `uuid` | **NO** | - | - |
| gate_number | `integer(32)` | **NO** | - | Gate 3: Ideation→Validation, Gate 4: Validation→Development, Gate 5: Development→Scaling, Gate 6: Scaling→Exit |
| from_phase | `character varying(50)` | **NO** | - | - |
| to_phase | `character varying(50)` | **NO** | - | - |
| assessment_date | `timestamp with time zone` | **NO** | `now()` | - |
| assessor_type | `character varying(20)` | **NO** | - | - |
| assessor_id | `uuid` | YES | - | - |
| previous_assessment_id | `uuid` | YES | - | - |
| previous_assessment_date | `timestamp with time zone` | YES | - | - |
| market_risk_previous | `character varying(20)` | YES | - | - |
| market_risk_current | `character varying(20)` | **NO** | - | - |
| market_risk_delta | `character varying(10)` | **NO** | - | IMPROVED (↓), STABLE (→), DEGRADED (↑), NEW (★), RESOLVED (✓) |
| market_risk_justification | `text` | YES | - | - |
| market_risk_mitigations | `jsonb` | YES | `'[]'::jsonb` | - |
| technical_risk_previous | `character varying(20)` | YES | - | - |
| technical_risk_current | `character varying(20)` | **NO** | - | - |
| technical_risk_delta | `character varying(10)` | **NO** | - | - |
| technical_risk_justification | `text` | YES | - | - |
| technical_risk_mitigations | `jsonb` | YES | `'[]'::jsonb` | - |
| financial_risk_previous | `character varying(20)` | YES | - | - |
| financial_risk_current | `character varying(20)` | **NO** | - | - |
| financial_risk_delta | `character varying(10)` | **NO** | - | - |
| financial_risk_justification | `text` | YES | - | - |
| financial_risk_mitigations | `jsonb` | YES | `'[]'::jsonb` | - |
| operational_risk_previous | `character varying(20)` | YES | - | - |
| operational_risk_current | `character varying(20)` | **NO** | - | - |
| operational_risk_delta | `character varying(10)` | **NO** | - | - |
| operational_risk_justification | `text` | YES | - | - |
| operational_risk_mitigations | `jsonb` | YES | `'[]'::jsonb` | - |
| new_risks | `jsonb` | YES | `'[]'::jsonb` | - |
| resolved_risks | `jsonb` | YES | `'[]'::jsonb` | - |
| risk_trajectory | `character varying(20)` | **NO** | - | - |
| blocking_risks | `boolean` | **NO** | `false` | TRUE if any CRITICAL risks exist without Chairman approval |
| chairman_review_required | `boolean` | **NO** | `false` | TRUE if any CRITICAL risk or 2+ HIGH risks |
| go_decision | `character varying(20)` | **NO** | - | - |
| conditions | `jsonb` | YES | `'[]'::jsonb` | - |
| status | `character varying(20)` | **NO** | `'PENDING'::character varying` | - |
| approved_by | `uuid` | YES | - | - |
| approval_date | `timestamp with time zone` | YES | - | - |
| approval_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `risk_recalibration_forms_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `risk_recalibration_forms_approved_by_fkey`: approved_by → users(id)
- `risk_recalibration_forms_assessor_id_fkey`: assessor_id → users(id)
- `risk_recalibration_forms_previous_assessment_id_fkey`: previous_assessment_id → risk_recalibration_forms(id)
- `risk_recalibration_forms_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `risk_recalibration_forms_venture_id_gate_number_key`: UNIQUE (venture_id, gate_number)

### Check Constraints
- `risk_recalibration_forms_assessor_type_check`: CHECK (((assessor_type)::text = ANY ((ARRAY['LEO'::character varying, 'CHAIRMAN'::character varying, 'HUMAN'::character varying])::text[])))
- `risk_recalibration_forms_financial_risk_current_check`: CHECK (((financial_risk_current)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[])))
- `risk_recalibration_forms_financial_risk_delta_check`: CHECK (((financial_risk_delta)::text = ANY ((ARRAY['IMPROVED'::character varying, 'STABLE'::character varying, 'DEGRADED'::character varying, 'NEW'::character varying, 'RESOLVED'::character varying])::text[])))
- `risk_recalibration_forms_financial_risk_previous_check`: CHECK (((financial_risk_previous)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'N/A'::character varying])::text[])))
- `risk_recalibration_forms_from_phase_check`: CHECK (((from_phase)::text = ANY ((ARRAY['IDEATION'::character varying, 'VALIDATION'::character varying, 'DEVELOPMENT'::character varying, 'SCALING'::character varying])::text[])))
- `risk_recalibration_forms_gate_number_check`: CHECK ((gate_number = ANY (ARRAY[3, 4, 5, 6])))
- `risk_recalibration_forms_go_decision_check`: CHECK (((go_decision)::text = ANY ((ARRAY['GO'::character varying, 'NO_GO'::character varying, 'CONDITIONAL'::character varying])::text[])))
- `risk_recalibration_forms_market_risk_current_check`: CHECK (((market_risk_current)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[])))
- `risk_recalibration_forms_market_risk_delta_check`: CHECK (((market_risk_delta)::text = ANY ((ARRAY['IMPROVED'::character varying, 'STABLE'::character varying, 'DEGRADED'::character varying, 'NEW'::character varying, 'RESOLVED'::character varying])::text[])))
- `risk_recalibration_forms_market_risk_previous_check`: CHECK (((market_risk_previous)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'N/A'::character varying])::text[])))
- `risk_recalibration_forms_operational_risk_current_check`: CHECK (((operational_risk_current)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[])))
- `risk_recalibration_forms_operational_risk_delta_check`: CHECK (((operational_risk_delta)::text = ANY ((ARRAY['IMPROVED'::character varying, 'STABLE'::character varying, 'DEGRADED'::character varying, 'NEW'::character varying, 'RESOLVED'::character varying])::text[])))
- `risk_recalibration_forms_operational_risk_previous_check`: CHECK (((operational_risk_previous)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'N/A'::character varying])::text[])))
- `risk_recalibration_forms_risk_trajectory_check`: CHECK (((risk_trajectory)::text = ANY ((ARRAY['IMPROVING'::character varying, 'STABLE'::character varying, 'DEGRADING'::character varying])::text[])))
- `risk_recalibration_forms_status_check`: CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'ESCALATED'::character varying])::text[])))
- `risk_recalibration_forms_technical_risk_current_check`: CHECK (((technical_risk_current)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[])))
- `risk_recalibration_forms_technical_risk_delta_check`: CHECK (((technical_risk_delta)::text = ANY ((ARRAY['IMPROVED'::character varying, 'STABLE'::character varying, 'DEGRADED'::character varying, 'NEW'::character varying, 'RESOLVED'::character varying])::text[])))
- `risk_recalibration_forms_technical_risk_previous_check`: CHECK (((technical_risk_previous)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'N/A'::character varying])::text[])))
- `risk_recalibration_forms_to_phase_check`: CHECK (((to_phase)::text = ANY ((ARRAY['VALIDATION'::character varying, 'DEVELOPMENT'::character varying, 'SCALING'::character varying, 'EXIT'::character varying])::text[])))

## Indexes

- `idx_risk_recal_chairman_review`
  ```sql
  CREATE INDEX idx_risk_recal_chairman_review ON public.risk_recalibration_forms USING btree (chairman_review_required) WHERE (chairman_review_required = true)
  ```
- `idx_risk_recal_decision`
  ```sql
  CREATE INDEX idx_risk_recal_decision ON public.risk_recalibration_forms USING btree (go_decision)
  ```
- `idx_risk_recal_gate`
  ```sql
  CREATE INDEX idx_risk_recal_gate ON public.risk_recalibration_forms USING btree (gate_number)
  ```
- `idx_risk_recal_status`
  ```sql
  CREATE INDEX idx_risk_recal_status ON public.risk_recalibration_forms USING btree (status)
  ```
- `idx_risk_recal_venture`
  ```sql
  CREATE INDEX idx_risk_recal_venture ON public.risk_recalibration_forms USING btree (venture_id)
  ```
- `risk_recalibration_forms_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_recalibration_forms_pkey ON public.risk_recalibration_forms USING btree (id)
  ```
- `risk_recalibration_forms_venture_id_gate_number_key`
  ```sql
  CREATE UNIQUE INDEX risk_recalibration_forms_venture_id_gate_number_key ON public.risk_recalibration_forms USING btree (venture_id, gate_number)
  ```

## RLS Policies

### 1. Authenticated users can read risk forms (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on risk_recalibration_forms (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_risk_form_chairman_flag

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION fn_update_risk_form_chairman_flag()`

### trg_update_risk_form_chairman_flag

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_risk_form_chairman_flag()`

---

[← Back to Schema Overview](../database-schema-overview.md)
