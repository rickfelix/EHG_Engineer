# workflow_recovery_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| workflow_id | `text` | **NO** | - | - |
| last_checkpoint_id | `text` | YES | - | - |
| recovery_attempts | `integer(32)` | YES | `0` | - |
| last_recovery_at | `timestamp without time zone` | YES | - | - |
| recovery_status | `text` | YES | - | - |
| error_details | `jsonb` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `workflow_recovery_state_pkey`: PRIMARY KEY (workflow_id)

### Check Constraints
- `workflow_recovery_state_recovery_status_check`: CHECK ((recovery_status = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text, 'IN_PROGRESS'::text, 'PENDING'::text])))

## Indexes

- `workflow_recovery_state_pkey`
  ```sql
  CREATE UNIQUE INDEX workflow_recovery_state_pkey ON public.workflow_recovery_state USING btree (workflow_id)
  ```

## RLS Policies

### 1. authenticated_read_workflow_recovery_state (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_workflow_recovery_state (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
