# venture_service_bindings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-01T22:49:08.070Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| service_id | `uuid` | **NO** | - | - |
| api_version | `text` | **NO** | - | - |
| config | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'active'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_service_bindings_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_service_bindings_service_id_fkey`: service_id → ehg_services(id)
- `venture_service_bindings_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `vsb_unique_binding`: UNIQUE (venture_id, service_id)

### Check Constraints
- `vsb_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text])))

## Indexes

- `idx_venture_service_bindings_venture`
  ```sql
  CREATE INDEX idx_venture_service_bindings_venture ON public.venture_service_bindings USING btree (venture_id)
  ```
- `venture_service_bindings_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_service_bindings_pkey ON public.venture_service_bindings USING btree (id)
  ```
- `vsb_unique_binding`
  ```sql
  CREATE UNIQUE INDEX vsb_unique_binding ON public.venture_service_bindings USING btree (venture_id, service_id)
  ```

## RLS Policies

### 1. vsb_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vsb_venture_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. vsb_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_venture_service_bindings

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
