# fleet_desired_slots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| name | `text` | **NO** | - | - |
| color | `text` | YES | - | - |
| role | `text` | YES | - | - |
| account_profile | `text` | YES | - | - |
| model | `text` | YES | - | - |
| effort | `text` | YES | - | - |
| worktree | `text` | YES | - | - |
| resume_uuid | `text` | YES | - | - |
| enabled | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `fleet_desired_slots_pkey`: PRIMARY KEY (name)

## Indexes

- `fleet_desired_slots_pkey`
  ```sql
  CREATE UNIQUE INDEX fleet_desired_slots_pkey ON public.fleet_desired_slots USING btree (name)
  ```
- `idx_fleet_desired_slots_enabled`
  ```sql
  CREATE INDEX idx_fleet_desired_slots_enabled ON public.fleet_desired_slots USING btree (name) WHERE (enabled = true)
  ```

## RLS Policies

### 1. fleet_desired_slots_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
