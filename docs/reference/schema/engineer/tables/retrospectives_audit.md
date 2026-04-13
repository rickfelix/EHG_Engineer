# retrospectives_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T12:55:49.260Z
**Rows**: 212
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| retrospective_id | `uuid` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| old_data | `jsonb` | YES | - | - |
| new_data | `jsonb` | YES | - | - |
| changed_by | `text` | YES | `((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)` | - |
| changed_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospectives_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospectives_audit_retrospective_id_fkey`: retrospective_id → retrospectives(id)

### Check Constraints
- `retrospectives_audit_action_check`: CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))

## Indexes

- `retrospectives_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospectives_audit_pkey ON public.retrospectives_audit USING btree (id)
  ```

## RLS Policies

### 1. Authenticated can read retrospectives_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role can insert retrospectives_audit (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
