# crm_contact_venture_access Table

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

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| contact_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| granted_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `crm_contact_venture_access_pkey`: PRIMARY KEY (contact_id, venture_id)

### Foreign Keys
- `crm_contact_venture_access_contact_id_fkey`: contact_id → crm_contacts(id)
- `crm_contact_venture_access_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `crm_contact_venture_access_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_contact_venture_access_pkey ON public.crm_contact_venture_access USING btree (contact_id, venture_id)
  ```
- `idx_crm_contact_venture_access_venture_id`
  ```sql
  CREATE INDEX idx_crm_contact_venture_access_venture_id ON public.crm_contact_venture_access USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
