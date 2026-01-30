# leo_handoff_validations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T13:36:19.189Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| execution_id | `uuid` | YES | - | - |
| validator_type | `text` | **NO** | - | Type of validation: template, prd_quality, sub_agent, or checklist |
| passed | `boolean` | **NO** | - | - |
| score | `integer(32)` | YES | `0` | - |
| max_score | `integer(32)` | YES | `100` | - |
| percentage | `integer(32)` | YES | - | - |
| validation_details | `jsonb` | **NO** | `'{}'::jsonb` | - |
| errors | `jsonb` | YES | `'[]'::jsonb` | - |
| warnings | `jsonb` | YES | `'[]'::jsonb` | - |
| blocking_issues | `jsonb` | YES | `'[]'::jsonb` | - |
| validated_at | `timestamp with time zone` | YES | `now()` | - |
| validator_version | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_handoff_validations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_handoff_validations_execution_id_fkey`: execution_id → leo_handoff_executions(id)

### Check Constraints
- `leo_handoff_validations_validator_type_check`: CHECK ((validator_type = ANY (ARRAY['template'::text, 'prd_quality'::text, 'sub_agent'::text, 'checklist'::text])))

## Indexes

- `idx_handoff_validations_execution`
  ```sql
  CREATE INDEX idx_handoff_validations_execution ON public.leo_handoff_validations USING btree (execution_id)
  ```
- `idx_handoff_validations_passed`
  ```sql
  CREATE INDEX idx_handoff_validations_passed ON public.leo_handoff_validations USING btree (passed)
  ```
- `idx_handoff_validations_type`
  ```sql
  CREATE INDEX idx_handoff_validations_type ON public.leo_handoff_validations USING btree (validator_type)
  ```
- `leo_handoff_validations_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_handoff_validations_pkey ON public.leo_handoff_validations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_handoff_validations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_handoff_validations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
