# org_guard_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| objective_key | `text` | **NO** | - | - |
| guard_key | `text` | **NO** | - | - |
| guard_type | `text` | **NO** | `'anti_goodhart'::text` | - |
| predicate_description | `text` | **NO** | - | - |
| mode | `text` | **NO** | `'advisory'::text` | - |
| status | `text` | **NO** | `'active'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `org_guard_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `org_guard_registry_guard_key_key`: UNIQUE (guard_key)

### Check Constraints
- `org_guard_registry_guard_type_check`: CHECK ((guard_type = ANY (ARRAY['anti_goodhart'::text, 'constraint'::text, 'tripwire'::text])))
- `org_guard_registry_mode_check`: CHECK ((mode = ANY (ARRAY['advisory'::text, 'blocking'::text])))
- `org_guard_registry_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))

## Indexes

- `idx_org_guard_registry_objective`
  ```sql
  CREATE INDEX idx_org_guard_registry_objective ON public.org_guard_registry USING btree (objective_key)
  ```
- `org_guard_registry_guard_key_key`
  ```sql
  CREATE UNIQUE INDEX org_guard_registry_guard_key_key ON public.org_guard_registry USING btree (guard_key)
  ```
- `org_guard_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX org_guard_registry_pkey ON public.org_guard_registry USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_org_guard_registry (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
