# sd_contract_exceptions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| contract_id | `uuid` | **NO** | - | - |
| contract_type | `character varying(20)` | **NO** | - | - |
| exception_type | `character varying(50)` | **NO** | - | - |
| violation_details | `jsonb` | **NO** | `'{}'::jsonb` | - |
| justification | `text` | **NO** | - | - |
| scrutiny_level | `character varying(20)` | **NO** | `'medium'::character varying` | - |
| approval_status | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| approved_by | `character varying(100)` | YES | - | - |
| approval_justification | `text` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | **NO** | `'system'::character varying` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_contract_exceptions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_contract_exceptions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_contract_exceptions_approval_status_check`: CHECK (((approval_status)::text = ANY ((ARRAY['pending'::character varying, 'auto_approved'::character varying, 'approved'::character varying, 'rejected'::character varying, 'escalated'::character varying])::text[])))
- `sd_contract_exceptions_contract_type_check`: CHECK (((contract_type)::text = ANY ((ARRAY['data'::character varying, 'ux'::character varying])::text[])))
- `sd_contract_exceptions_exception_type_check`: CHECK (((exception_type)::text = ANY ((ARRAY['scope_expansion'::character varying, 'forbidden_operation'::character varying, 'path_boundary'::character varying, 'column_addition'::character varying, 'schema_deviation'::character varying, 'cultural_style_override'::character varying, 'other'::character varying])::text[])))
- `sd_contract_exceptions_justification_check`: CHECK ((length(justification) >= 50))
- `sd_contract_exceptions_scrutiny_level_check`: CHECK (((scrutiny_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))

## Indexes

- `idx_contract_exceptions_scrutiny`
  ```sql
  CREATE INDEX idx_contract_exceptions_scrutiny ON public.sd_contract_exceptions USING btree (scrutiny_level)
  ```
- `idx_contract_exceptions_sd`
  ```sql
  CREATE INDEX idx_contract_exceptions_sd ON public.sd_contract_exceptions USING btree (sd_id)
  ```
- `idx_contract_exceptions_status`
  ```sql
  CREATE INDEX idx_contract_exceptions_status ON public.sd_contract_exceptions USING btree (approval_status)
  ```
- `idx_contract_exceptions_type`
  ```sql
  CREATE INDEX idx_contract_exceptions_type ON public.sd_contract_exceptions USING btree (exception_type)
  ```
- `sd_contract_exceptions_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_contract_exceptions_pkey ON public.sd_contract_exceptions USING btree (id)
  ```

## RLS Policies

### 1. sd_contract_exceptions_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. sd_contract_exceptions_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. sd_contract_exceptions_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. sd_contract_exceptions_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
