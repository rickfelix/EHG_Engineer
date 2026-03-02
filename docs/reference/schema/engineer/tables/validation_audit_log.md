# validation_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 36,129
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| correlation_id | `character varying(100)` | **NO** | - | Groups related audit events from the same validation run |
| sd_id | `character varying(100)` | YES | - | - |
| sd_type | `character varying(50)` | YES | - | - |
| validator_name | `character varying(100)` | **NO** | - | Name of the validator that detected the issue (e.g., bypass_detection, coverage_validation) |
| failure_reason | `text` | **NO** | - | - |
| artifact_id | `character varying(255)` | YES | - | - |
| failure_category | `character varying(50)` | **NO** | - | Category of failure (bypass, missing_coverage, gate_failure, constraint_violation) |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| execution_context | `character varying(50)` | YES | `'cli'::character varying` | Where validation ran (cli, ci, server) |

## Constraints

### Primary Key
- `validation_audit_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_validation_audit_log_correlation_id`
  ```sql
  CREATE INDEX idx_validation_audit_log_correlation_id ON public.validation_audit_log USING btree (correlation_id)
  ```
- `idx_validation_audit_log_created_at`
  ```sql
  CREATE INDEX idx_validation_audit_log_created_at ON public.validation_audit_log USING btree (created_at DESC)
  ```
- `idx_validation_audit_log_failure_category`
  ```sql
  CREATE INDEX idx_validation_audit_log_failure_category ON public.validation_audit_log USING btree (failure_category)
  ```
- `idx_validation_audit_log_sd_id`
  ```sql
  CREATE INDEX idx_validation_audit_log_sd_id ON public.validation_audit_log USING btree (sd_id)
  ```
- `idx_validation_audit_log_validator_name`
  ```sql
  CREATE INDEX idx_validation_audit_log_validator_name ON public.validation_audit_log USING btree (validator_name)
  ```
- `validation_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX validation_audit_log_pkey ON public.validation_audit_log USING btree (id)
  ```

## RLS Policies

### 1. audit_log_insert_authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. audit_log_insert_service (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. audit_log_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
