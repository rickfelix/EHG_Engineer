# gate_boundary_config_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-29T17:02:01.084Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_stage | `integer(32)` | **NO** | - | - |
| to_stage | `integer(32)` | **NO** | - | - |
| changed_by | `text` | YES | - | - |
| changed_at | `timestamp with time zone` | **NO** | `now()` | - |
| field_changed | `text` | **NO** | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `gate_boundary_config_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `gate_boundary_config_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_boundary_config_audit_pkey ON public.gate_boundary_config_audit USING btree (id)
  ```

## RLS Policies

### 1. gate_boundary_config_audit_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
