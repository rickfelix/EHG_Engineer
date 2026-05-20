# chairman_dashboard_config_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-20T22:24:02.779Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| audit_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| action | `text` | **NO** | - | - |
| changed_at | `timestamp with time zone` | **NO** | `now()` | - |
| changed_by | `uuid` | YES | - | - |
| source_id | `uuid` | **NO** | - | - |
| old_row | `jsonb` | YES | - | - |
| new_row | `jsonb` | YES | - | - |
| diff | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `chairman_dashboard_config_audit_pkey`: PRIMARY KEY (audit_id)

### Check Constraints
- `chairman_dashboard_config_audit_action_check`: CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))

## Indexes

- `chairman_dashboard_config_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_dashboard_config_audit_pkey ON public.chairman_dashboard_config_audit USING btree (audit_id)
  ```
- `idx_chairman_dashboard_config_audit_changed_at`
  ```sql
  CREATE INDEX idx_chairman_dashboard_config_audit_changed_at ON public.chairman_dashboard_config_audit USING btree (changed_at DESC)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
