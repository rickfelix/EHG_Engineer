# org_objective_registry Table

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

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| objective_key | `text` | **NO** | - | - |
| statement | `text` | **NO** | - | - |
| metric | `text` | YES | - | - |
| target | `text` | YES | - | - |
| mode | `text` | **NO** | `'advisory'::text` | - |
| status | `text` | **NO** | `'active'::text` | - |
| created_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `org_objective_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `org_objective_registry_venture_id_objective_key_key`: UNIQUE (venture_id, objective_key)

### Check Constraints
- `org_objective_registry_mode_check`: CHECK ((mode = ANY (ARRAY['advisory'::text, 'blocking'::text])))
- `org_objective_registry_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))

## Indexes

- `org_objective_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX org_objective_registry_pkey ON public.org_objective_registry USING btree (id)
  ```
- `org_objective_registry_venture_id_objective_key_key`
  ```sql
  CREATE UNIQUE INDEX org_objective_registry_venture_id_objective_key_key ON public.org_objective_registry USING btree (venture_id, objective_key)
  ```

## RLS Policies

### 1. service_role_all_org_objective_registry (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
