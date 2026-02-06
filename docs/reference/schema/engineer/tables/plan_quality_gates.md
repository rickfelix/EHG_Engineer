# plan_quality_gates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T10:56:34.729Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| validation_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| gate_name | `text` | **NO** | - | - |
| gate_type | `text` | **NO** | - | - |
| is_required | `boolean` | YES | `true` | - |
| is_complete | `boolean` | YES | `false` | - |
| completion_evidence | `text` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| completed_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `plan_quality_gates_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `plan_quality_gates_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `plan_quality_gates_validation_id_fkey`: validation_id → plan_technical_validations(id)

### Unique Constraints
- `plan_quality_gates_validation_id_gate_name_key`: UNIQUE (validation_id, gate_name)

### Check Constraints
- `plan_quality_gates_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['SECURITY'::text, 'DATABASE'::text, 'TESTING'::text, 'PERFORMANCE'::text, 'DESIGN'::text, 'VALIDATION'::text])))

## Indexes

- `idx_plan_quality_gates_complete`
  ```sql
  CREATE INDEX idx_plan_quality_gates_complete ON public.plan_quality_gates USING btree (is_complete)
  ```
- `idx_plan_quality_gates_sd_id`
  ```sql
  CREATE INDEX idx_plan_quality_gates_sd_id ON public.plan_quality_gates USING btree (sd_id)
  ```
- `idx_plan_quality_gates_validation_id`
  ```sql
  CREATE INDEX idx_plan_quality_gates_validation_id ON public.plan_quality_gates USING btree (validation_id)
  ```
- `plan_quality_gates_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_quality_gates_pkey ON public.plan_quality_gates USING btree (id)
  ```
- `plan_quality_gates_validation_id_gate_name_key`
  ```sql
  CREATE UNIQUE INDEX plan_quality_gates_validation_id_gate_name_key ON public.plan_quality_gates USING btree (validation_id, gate_name)
  ```

## RLS Policies

### 1. plan_quality_gates_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. plan_quality_gates_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
