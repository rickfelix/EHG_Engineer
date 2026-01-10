# uat_audit_trail Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T03:37:46.398Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| entity_type | `character varying(50)` | YES | - | - |
| entity_id | `uuid` | YES | - | - |
| action | `character varying(50)` | YES | - | - |
| changes | `jsonb` | YES | - | - |
| performed_by | `character varying(100)` | YES | - | - |
| performed_at | `timestamp with time zone` | YES | `now()` | - |
| ip_address | `inet` | YES | - | - |
| user_agent | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_audit_trail_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_uat_audit_trail_entity`
  ```sql
  CREATE INDEX idx_uat_audit_trail_entity ON public.uat_audit_trail USING btree (entity_type, entity_id)
  ```
- `idx_uat_audit_trail_performed_at`
  ```sql
  CREATE INDEX idx_uat_audit_trail_performed_at ON public.uat_audit_trail USING btree (performed_at DESC)
  ```
- `uat_audit_trail_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_audit_trail_pkey ON public.uat_audit_trail USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
