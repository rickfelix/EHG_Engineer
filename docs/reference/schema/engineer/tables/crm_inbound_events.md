# crm_inbound_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2,556
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source | `text` | **NO** | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| fetched_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `crm_inbound_events_pkey`: PRIMARY KEY (id)

## Indexes

- `crm_inbound_events_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_inbound_events_pkey ON public.crm_inbound_events USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
