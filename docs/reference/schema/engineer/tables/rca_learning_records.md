# rca_learning_records Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T13:58:48.132Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rcr_id | `uuid` | **NO** | - | - |
| features | `jsonb` | **NO** | - | - |
| label | `text` | YES | - | - |
| defect_class | `character varying(100)` | YES | - | - |
| preventable | `boolean` | YES | `true` | - |
| prevention_stage | `text` | YES | - | - |
| time_to_detect_hours | `numeric` | YES | - | - |
| time_to_resolve_hours | `numeric` | YES | - | - |
| eva_preference_id | `uuid` | YES | - | - |
| contributed_to_retrospective | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `rca_learning_records_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `rca_learning_records_rcr_id_fkey`: rcr_id → root_cause_reports(id)

### Check Constraints
- `rca_learning_records_prevention_stage_check`: CHECK ((prevention_stage = ANY (ARRAY['LEAD_PRE_APPROVAL'::text, 'PLAN_PRD'::text, 'EXEC_IMPL'::text, 'PLAN_VERIFY'::text, 'NEVER'::text])))

## Indexes

- `idx_learning_defect_class`
  ```sql
  CREATE INDEX idx_learning_defect_class ON public.rca_learning_records USING btree (defect_class)
  ```
- `idx_learning_preventable`
  ```sql
  CREATE INDEX idx_learning_preventable ON public.rca_learning_records USING btree (preventable, prevention_stage)
  ```
- `idx_learning_rcr_id`
  ```sql
  CREATE INDEX idx_learning_rcr_id ON public.rca_learning_records USING btree (rcr_id)
  ```
- `rca_learning_records_pkey`
  ```sql
  CREATE UNIQUE INDEX rca_learning_records_pkey ON public.rca_learning_records USING btree (id)
  ```

## RLS Policies

### 1. public_insert_rca_learning_records (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. public_select_rca_learning_records (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. service_role_all_rca_learning_records (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
