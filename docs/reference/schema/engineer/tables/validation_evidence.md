# validation_evidence Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T22:50:58.156Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| validation_id | `uuid` | YES | - | - |
| evidence_type | `character varying(50)` | **NO** | - | - |
| file_path | `character varying(500)` | YES | - | - |
| file_name | `character varying(255)` | YES | - | - |
| file_size | `integer(32)` | YES | - | - |
| mime_type | `character varying(100)` | YES | - | - |
| component_name | `character varying(255)` | YES | - | - |
| test_case | `character varying(255)` | YES | - | - |
| viewport_size | `character varying(50)` | YES | - | - |
| elements_found | `jsonb` | YES | `'[]'::jsonb` | - |
| elements_missing | `jsonb` | YES | `'[]'::jsonb` | - |
| accessibility_issues | `jsonb` | YES | `'[]'::jsonb` | - |
| performance_metrics | `jsonb` | YES | - | - |
| captured_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `validation_evidence_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `validation_evidence_validation_id_fkey`: validation_id → ui_validation_results(id)

## Indexes

- `idx_evidence_type`
  ```sql
  CREATE INDEX idx_evidence_type ON public.validation_evidence USING btree (evidence_type)
  ```
- `idx_evidence_validation`
  ```sql
  CREATE INDEX idx_evidence_validation ON public.validation_evidence USING btree (validation_id)
  ```
- `validation_evidence_pkey`
  ```sql
  CREATE UNIQUE INDEX validation_evidence_pkey ON public.validation_evidence USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_validation_evidence (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_validation_evidence (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
