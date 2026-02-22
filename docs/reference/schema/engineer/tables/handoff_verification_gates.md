# handoff_verification_gates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:05:57.778Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| handoff_id | `uuid` | YES | - | - |
| sd_id | `character varying(255)` | **NO** | - | - |
| prd_id | `character varying(255)` | YES | - | - |
| gate_type | `character varying(50)` | **NO** | - | - |
| gate_name | `character varying(200)` | **NO** | - | - |
| gate_description | `text` | YES | - | - |
| verification_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| evidence | `jsonb` | YES | `'{}'::jsonb` | - |
| confidence_score | `integer(32)` | YES | - | - |
| quality_score | `integer(32)` | YES | - | - |
| verified_by | `character varying(50)` | YES | - | - |
| verified_at | `timestamp with time zone` | YES | - | - |
| verification_notes | `text` | YES | - | - |
| requirements | `jsonb` | YES | `'{}'::jsonb` | - |
| is_mandatory | `boolean` | YES | `true` | - |
| blocks_handoff | `boolean` | YES | `true` | - |
| priority | `integer(32)` | YES | `50` | - |
| assigned_to_agent | `character varying(50)` | YES | - | - |
| verification_agent | `character varying(50)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| auto_generated | `boolean` | YES | `false` | - |
| generation_rule | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `handoff_verification_gates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `handoff_verification_gates_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `handoff_verification_gates_gate_type_check`: CHECK (((gate_type)::text = ANY ((ARRAY['user_stories'::character varying, 'test_coverage'::character varying, 'implementation_evidence'::character varying, 'performance_verification'::character varying, 'security_review'::character varying, 'code_review'::character varying, 'integration_tests'::character varying])::text[])))
- `handoff_verification_gates_quality_score_check`: CHECK (((quality_score >= 0) AND (quality_score <= 100)))
- `handoff_verification_gates_verification_status_check`: CHECK (((verification_status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'pass'::character varying, 'fail'::character varying, 'skipped'::character varying, 'blocked'::character varying])::text[])))

## Indexes

- `handoff_verification_gates_pkey`
  ```sql
  CREATE UNIQUE INDEX handoff_verification_gates_pkey ON public.handoff_verification_gates USING btree (id)
  ```
- `idx_verification_gates_assigned`
  ```sql
  CREATE INDEX idx_verification_gates_assigned ON public.handoff_verification_gates USING btree (assigned_to_agent)
  ```
- `idx_verification_gates_mandatory`
  ```sql
  CREATE INDEX idx_verification_gates_mandatory ON public.handoff_verification_gates USING btree (is_mandatory, blocks_handoff)
  ```
- `idx_verification_gates_prd_id`
  ```sql
  CREATE INDEX idx_verification_gates_prd_id ON public.handoff_verification_gates USING btree (prd_id)
  ```
- `idx_verification_gates_priority`
  ```sql
  CREATE INDEX idx_verification_gates_priority ON public.handoff_verification_gates USING btree (priority DESC)
  ```
- `idx_verification_gates_sd_id`
  ```sql
  CREATE INDEX idx_verification_gates_sd_id ON public.handoff_verification_gates USING btree (sd_id)
  ```
- `idx_verification_gates_status`
  ```sql
  CREATE INDEX idx_verification_gates_status ON public.handoff_verification_gates USING btree (verification_status)
  ```
- `idx_verification_gates_type`
  ```sql
  CREATE INDEX idx_verification_gates_type ON public.handoff_verification_gates USING btree (gate_type)
  ```

## RLS Policies

### 1. authenticated_read_handoff_verification_gates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_handoff_verification_gates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### verification_gate_update_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_verification_gate_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
