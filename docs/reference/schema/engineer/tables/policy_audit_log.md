# policy_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T15:18:40.578Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| policy_id | `uuid` | YES | - | - |
| policy_version | `integer(32)` | **NO** | - | - |
| actor | `text` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| diff | `jsonb` | YES | - | - |
| score_output | `jsonb` | YES | - | - |
| dry_run | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `policy_audit_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `policy_audit_log_policy_id_fkey`: policy_id → portfolio_allocation_policies(id)

### Check Constraints
- `policy_audit_log_event_type_check`: CHECK ((event_type = ANY (ARRAY['INSERT'::text, 'ACTIVATE'::text, 'DEACTIVATE'::text, 'DRY_RUN'::text, 'SCORE_RUN'::text])))

## Indexes

- `idx_audit_event_type`
  ```sql
  CREATE INDEX idx_audit_event_type ON public.policy_audit_log USING btree (event_type)
  ```
- `idx_audit_policy_id`
  ```sql
  CREATE INDEX idx_audit_policy_id ON public.policy_audit_log USING btree (policy_id)
  ```
- `idx_audit_venture_id`
  ```sql
  CREATE INDEX idx_audit_venture_id ON public.policy_audit_log USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `policy_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX policy_audit_log_pkey ON public.policy_audit_log USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_audit (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_no_delete_audit

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION prevent_audit_log_mutation()`

### trg_no_update_audit

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION prevent_audit_log_mutation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
