# launch_mode_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| from_mode | `text` | **NO** | - | - |
| to_mode | `text` | **NO** | - | - |
| decided_by | `text` | **NO** | - | - |
| decision_id | `uuid` | YES | - | - |
| flipped_at | `timestamp with time zone` | **NO** | `now()` | - |
| consumed_at | `timestamp with time zone` | YES | - | - |
| confirmed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `launch_mode_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `launch_mode_audit_decision_id_fkey`: decision_id → chairman_decisions(id)
- `launch_mode_audit_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `launch_mode_audit_from_mode_check`: CHECK ((from_mode = ANY (ARRAY['simulated'::text, 'live'::text])))
- `launch_mode_audit_real_transition`: CHECK ((from_mode <> to_mode))
- `launch_mode_audit_to_mode_check`: CHECK ((to_mode = ANY (ARRAY['simulated'::text, 'live'::text])))

## Indexes

- `idx_launch_mode_audit_venture`
  ```sql
  CREATE INDEX idx_launch_mode_audit_venture ON public.launch_mode_audit USING btree (venture_id, flipped_at DESC)
  ```
- `launch_mode_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX launch_mode_audit_pkey ON public.launch_mode_audit USING btree (id)
  ```

## RLS Policies

### 1. launch_mode_audit_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
