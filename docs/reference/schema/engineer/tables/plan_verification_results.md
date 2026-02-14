# plan_verification_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T02:43:03.595Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('plan_verification_results_id_seq'::regclass)` | - |
| session_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `character varying(100)` | YES | - | - |
| sd_id | `character varying(100)` | YES | - | - |
| verification_type | `character varying(50)` | **NO** | `'final_supervisor'::character varying` | - |
| status | `character varying(20)` | **NO** | - | - |
| confidence_score | `integer(32)` | YES | - | - |
| verdict | `character varying(20)` | YES | - | - |
| sub_agent_results | `jsonb` | YES | `'{}'::jsonb` | - |
| requirements_met | `jsonb` | YES | `'[]'::jsonb` | - |
| requirements_unmet | `jsonb` | YES | `'[]'::jsonb` | - |
| requirements_total | `integer(32)` | YES | - | - |
| critical_issues | `jsonb` | YES | `'[]'::jsonb` | - |
| warnings | `jsonb` | YES | `'[]'::jsonb` | - |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| started_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| completed_at | `timestamp without time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| iteration_number | `integer(32)` | YES | `1` | - |
| triggered_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `plan_verification_results_pkey`: PRIMARY KEY (id)

### Check Constraints
- `plan_verification_results_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `plan_verification_results_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'timeout'::character varying])::text[])))
- `plan_verification_results_verdict_check`: CHECK (((verdict)::text = ANY ((ARRAY['pass'::character varying, 'fail'::character varying, 'conditional_pass'::character varying, 'escalate'::character varying])::text[])))

## Indexes

- `idx_verification_prd`
  ```sql
  CREATE INDEX idx_verification_prd ON public.plan_verification_results USING btree (prd_id)
  ```
- `idx_verification_session`
  ```sql
  CREATE INDEX idx_verification_session ON public.plan_verification_results USING btree (session_id)
  ```
- `idx_verification_status`
  ```sql
  CREATE INDEX idx_verification_status ON public.plan_verification_results USING btree (status)
  ```
- `plan_verification_results_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_verification_results_pkey ON public.plan_verification_results USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_plan_verification_results (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_plan_verification_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
