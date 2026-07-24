# role_drain_sets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 69
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| role | `text` | **NO** | - | - |
| kind | `text` | **NO** | - | - |
| direction | `text` | **NO** | `'inbound'::text` | - |
| status | `text` | **NO** | `'active'::text` | - |
| provenance | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `role_drain_sets_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `role_drain_sets_role_kind_direction_key`: UNIQUE (role, kind, direction)

### Check Constraints
- `role_drain_sets_direction_check`: CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
- `role_drain_sets_kind_check`: CHECK ((kind ~ '^[A-Za-z][A-Za-z0-9_]*$'::text))
- `role_drain_sets_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text])))

## Indexes

- `idx_role_drain_sets_role_active`
  ```sql
  CREATE INDEX idx_role_drain_sets_role_active ON public.role_drain_sets USING btree (role, direction) WHERE (status = 'active'::text)
  ```
- `role_drain_sets_pkey`
  ```sql
  CREATE UNIQUE INDEX role_drain_sets_pkey ON public.role_drain_sets USING btree (id)
  ```
- `role_drain_sets_role_kind_direction_key`
  ```sql
  CREATE UNIQUE INDEX role_drain_sets_role_kind_direction_key ON public.role_drain_sets USING btree (role, kind, direction)
  ```

## RLS Policies

### 1. role_drain_sets_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
