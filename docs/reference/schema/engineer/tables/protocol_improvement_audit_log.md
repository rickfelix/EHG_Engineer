# protocol_improvement_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T01:18:40.647Z
**Rows**: 29
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| action | `character varying(50)` | **NO** | - | - |
| improvement_id | `uuid` | YES | - | - |
| improvement_summary | `text` | YES | - | - |
| target_table | `character varying(100)` | YES | - | - |
| actor_id | `text` | YES | - | - |
| actor_type | `character varying(20)` | YES | `'system'::character varying` | - |
| timestamp | `timestamp with time zone` | YES | `now()` | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `protocol_improvement_audit_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `protocol_improvement_audit_log_improvement_id_fkey`: improvement_id → protocol_improvement_queue(id)

### Check Constraints
- `valid_action`: CHECK (((action)::text = ANY ((ARRAY['CREATED'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'APPLIED'::character varying, 'REVERTED'::character varying, 'EXPIRED'::character varying, 'VALIDATION_FAILED'::character varying])::text[])))
- `valid_actor_type`: CHECK (((actor_type)::text = ANY ((ARRAY['system'::character varying, 'user'::character varying, 'automated'::character varying])::text[])))

## Indexes

- `idx_audit_log_action`
  ```sql
  CREATE INDEX idx_audit_log_action ON public.protocol_improvement_audit_log USING btree (action)
  ```
- `idx_audit_log_actor`
  ```sql
  CREATE INDEX idx_audit_log_actor ON public.protocol_improvement_audit_log USING btree (actor_id, actor_type)
  ```
- `idx_audit_log_improvement_id`
  ```sql
  CREATE INDEX idx_audit_log_improvement_id ON public.protocol_improvement_audit_log USING btree (improvement_id)
  ```
- `idx_audit_log_timestamp`
  ```sql
  CREATE INDEX idx_audit_log_timestamp ON public.protocol_improvement_audit_log USING btree ("timestamp" DESC)
  ```
- `protocol_improvement_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX protocol_improvement_audit_log_pkey ON public.protocol_improvement_audit_log USING btree (id)
  ```

## RLS Policies

### 1. audit_log_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. audit_log_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
