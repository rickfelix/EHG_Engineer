# ship_escape_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 86
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pr_number | `integer(32)` | **NO** | - | - |
| repo | `text` | **NO** | - | - |
| session_id | `text` | **NO** | - | - |
| reason | `text` | **NO** | - | - |
| merge_commit_sha | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ship_escape_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_ship_escape_audit_pr`
  ```sql
  CREATE INDEX idx_ship_escape_audit_pr ON public.ship_escape_audit USING btree (pr_number, repo)
  ```
- `ship_escape_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX ship_escape_audit_pkey ON public.ship_escape_audit USING btree (id)
  ```

## RLS Policies

### 1. ship_escape_audit_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
