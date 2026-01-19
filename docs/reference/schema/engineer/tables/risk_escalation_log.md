# risk_escalation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T16:40:59.907Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| risk_form_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| escalation_type | `character varying(30)` | **NO** | - | - |
| escalation_reason | `text` | **NO** | - | - |
| risk_category | `character varying(20)` | YES | - | - |
| risk_level | `character varying(20)` | YES | - | - |
| escalated_to | `character varying(20)` | **NO** | - | - |
| escalated_at | `timestamp with time zone` | **NO** | `now()` | - |
| response_time_hours | `numeric(6,2)` | YES | - | Time from escalation to resolution. Target: <4hrs for CRITICAL, <24hrs for HIGH |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `risk_escalation_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `risk_escalation_log_risk_form_id_fkey`: risk_form_id → risk_recalibration_forms(id)
- `risk_escalation_log_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `risk_escalation_log_escalated_to_check`: CHECK (((escalated_to)::text = ANY ((ARRAY['CHAIRMAN'::character varying, 'EVA'::character varying, 'CHAIRMAN_AND_EVA'::character varying])::text[])))
- `risk_escalation_log_escalation_type_check`: CHECK (((escalation_type)::text = ANY ((ARRAY['CRITICAL_RISK'::character varying, 'MULTIPLE_HIGH_RISKS'::character varying, 'CONSECUTIVE_DEGRADATION'::character varying, 'NEW_CRITICAL_RISK'::character varying, 'MANUAL_ESCALATION'::character varying])::text[])))
- `risk_escalation_log_risk_category_check`: CHECK (((risk_category)::text = ANY ((ARRAY['MARKET'::character varying, 'TECHNICAL'::character varying, 'FINANCIAL'::character varying, 'OPERATIONAL'::character varying])::text[])))
- `risk_escalation_log_risk_level_check`: CHECK (((risk_level)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying])::text[])))

## Indexes

- `idx_risk_escalation_form`
  ```sql
  CREATE INDEX idx_risk_escalation_form ON public.risk_escalation_log USING btree (risk_form_id)
  ```
- `idx_risk_escalation_type`
  ```sql
  CREATE INDEX idx_risk_escalation_type ON public.risk_escalation_log USING btree (escalation_type)
  ```
- `idx_risk_escalation_unresolved`
  ```sql
  CREATE INDEX idx_risk_escalation_unresolved ON public.risk_escalation_log USING btree (resolved_at) WHERE (resolved_at IS NULL)
  ```
- `idx_risk_escalation_venture`
  ```sql
  CREATE INDEX idx_risk_escalation_venture ON public.risk_escalation_log USING btree (venture_id)
  ```
- `risk_escalation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_escalation_log_pkey ON public.risk_escalation_log USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can read risk escalations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on risk_escalation_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
