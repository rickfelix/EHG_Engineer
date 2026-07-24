# sourcing_engine_activation_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| arm | `text` | **NO** | - | - |
| enabled | `boolean` | **NO** | `false` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `sourcing_engine_activation_state_pkey`: PRIMARY KEY (arm)

## Indexes

- `sourcing_engine_activation_state_pkey`
  ```sql
  CREATE UNIQUE INDEX sourcing_engine_activation_state_pkey ON public.sourcing_engine_activation_state USING btree (arm)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
