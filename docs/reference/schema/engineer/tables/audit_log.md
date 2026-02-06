# audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:37:01.745Z
**Rows**: 4
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| entity_type | `text` | **NO** | - | - |
| entity_id | `text` | **NO** | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| severity | `text` | YES | - | - |
| created_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `audit_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `audit_log_severity_check`: CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])))

## Indexes

- `audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
  ```
- `idx_audit_log_created_at`
  ```sql
  CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC)
  ```
- `idx_audit_log_entity`
  ```sql
  CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id)
  ```
- `idx_audit_log_event_type`
  ```sql
  CREATE INDEX idx_audit_log_event_type ON public.audit_log USING btree (event_type)
  ```
- `idx_audit_log_sd_type_changes`
  ```sql
  CREATE INDEX idx_audit_log_sd_type_changes ON public.audit_log USING btree (entity_id, event_type) WHERE (event_type ~~ 'sd_type_change%'::text)
  ```
- `idx_audit_log_severity`
  ```sql
  CREATE INDEX idx_audit_log_severity ON public.audit_log USING btree (severity) WHERE (severity = ANY (ARRAY['error'::text, 'critical'::text]))
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
