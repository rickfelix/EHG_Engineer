# switchon_decision_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| component | `text` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| actor | `text` | **NO** | - | - |
| policy_version | `text` | **NO** | - | - |
| evidence_snapshot | `jsonb` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `switchon_decision_audit_pkey`: PRIMARY KEY (id)

### Check Constraints
- `switchon_decision_audit_decision_check`: CHECK ((decision = ANY (ARRAY['auto-proceed'::text, 'held-for-chairman'::text])))

## Indexes

- `idx_switchon_decision_audit_component_time`
  ```sql
  CREATE INDEX idx_switchon_decision_audit_component_time ON public.switchon_decision_audit USING btree (component, created_at DESC)
  ```
- `switchon_decision_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX switchon_decision_audit_pkey ON public.switchon_decision_audit USING btree (id)
  ```

## RLS Policies

### 1. switchon_decision_audit_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. switchon_decision_audit_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
