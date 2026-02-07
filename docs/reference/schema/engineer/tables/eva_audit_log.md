# eva_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T02:21:57.307Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| eva_venture_id | `uuid` | YES | - | - |
| action_type | `text` | **NO** | - | - |
| action_source | `text` | **NO** | `'system'::text` | - |
| action_data | `jsonb` | YES | `'{}'::jsonb` | - |
| actor_type | `text` | YES | `'system'::text` | - |
| actor_id | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_audit_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_audit_log_eva_venture_id_fkey`: eva_venture_id → eva_ventures(id)

### Check Constraints
- `eva_audit_log_actor_type_check`: CHECK ((actor_type = ANY (ARRAY['system'::text, 'user'::text, 'automation'::text])))

## Indexes

- `eva_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_audit_log_pkey ON public.eva_audit_log USING btree (id)
  ```
- `idx_eva_audit_action`
  ```sql
  CREATE INDEX idx_eva_audit_action ON public.eva_audit_log USING btree (action_type)
  ```
- `idx_eva_audit_created`
  ```sql
  CREATE INDEX idx_eva_audit_created ON public.eva_audit_log USING btree (created_at DESC)
  ```
- `idx_eva_audit_venture`
  ```sql
  CREATE INDEX idx_eva_audit_venture ON public.eva_audit_log USING btree (eva_venture_id)
  ```

## RLS Policies

### 1. eva_audit_log_admin_access (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
