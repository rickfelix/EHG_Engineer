# switchon_auto_actions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| component | `text` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `switchon_auto_actions_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_switchon_auto_actions_component_time`
  ```sql
  CREATE INDEX idx_switchon_auto_actions_component_time ON public.switchon_auto_actions USING btree (component, occurred_at DESC)
  ```
- `switchon_auto_actions_pkey`
  ```sql
  CREATE UNIQUE INDEX switchon_auto_actions_pkey ON public.switchon_auto_actions USING btree (id)
  ```

## RLS Policies

### 1. switchon_auto_actions_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. switchon_auto_actions_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
