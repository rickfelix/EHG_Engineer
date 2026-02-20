# handoff_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T20:49:31.394Z
**Rows**: 8,782
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| attempted_by | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| handoff_type | `text` | YES | - | - |
| from_phase | `text` | YES | - | - |
| to_phase | `text` | YES | - | - |
| blocked | `boolean` | YES | `false` | - |
| block_reason | `text` | YES | - | - |
| request_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `handoff_audit_log_pkey`: PRIMARY KEY (id)

## Indexes

- `handoff_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX handoff_audit_log_pkey ON public.handoff_audit_log USING btree (id)
  ```
- `idx_handoff_audit_blocked`
  ```sql
  CREATE INDEX idx_handoff_audit_blocked ON public.handoff_audit_log USING btree (blocked) WHERE (blocked = true)
  ```
- `idx_handoff_audit_created`
  ```sql
  CREATE INDEX idx_handoff_audit_created ON public.handoff_audit_log USING btree (created_at DESC)
  ```
- `idx_handoff_audit_sd`
  ```sql
  CREATE INDEX idx_handoff_audit_sd ON public.handoff_audit_log USING btree (sd_id)
  ```

## RLS Policies

### 1. Authenticated users can view handoff_audit_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to handoff_audit_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
