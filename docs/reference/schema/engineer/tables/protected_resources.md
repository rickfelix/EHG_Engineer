# protected_resources Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T23:00:08.909Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| resource_type | `text` | **NO** | - | Type of protected resource: venture, repo, application |
| resource_id | `text` | **NO** | - | Identifier of the resource. UUID for ventures, slug for repos (e.g. rickfelix/ehg) |
| venture_id | `uuid` | YES | - | - |
| protection_reason | `text` | **NO** | - | - |
| protected_by | `text` | **NO** | `'system'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `protected_resources_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_protected_resource`: UNIQUE (resource_type, resource_id)

## Indexes

- `protected_resources_pkey`
  ```sql
  CREATE UNIQUE INDEX protected_resources_pkey ON public.protected_resources USING btree (id)
  ```
- `unique_protected_resource`
  ```sql
  CREATE UNIQUE INDEX unique_protected_resource ON public.protected_resources USING btree (resource_type, resource_id)
  ```

## RLS Policies

### 1. protected_resources_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. protected_resources_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
