# org_agent_roles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 32
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| role_key | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| domain | `text` | YES | - | - |
| is_routing_role | `boolean` | **NO** | `false` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `org_agent_roles_pkey`: PRIMARY KEY (role_key)

## Indexes

- `org_agent_roles_pkey`
  ```sql
  CREATE UNIQUE INDEX org_agent_roles_pkey ON public.org_agent_roles USING btree (role_key)
  ```

## RLS Policies

### 1. service_role_all_org_agent_roles (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
