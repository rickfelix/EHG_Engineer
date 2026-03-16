# ehg_services Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T23:08:53.541Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| service_key | `text` | **NO** | - | Unique key: marketing, branding, customer_service, etc. |
| display_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| api_version | `text` | **NO** | `'v1'::text` | - |
| artifact_schema | `jsonb` | **NO** | - | JSON Schema contract for artifacts produced by this service. |
| status | `text` | **NO** | `'active'::text` | - |
| config | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_services_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `ehg_services_service_key_key`: UNIQUE (service_key)

### Check Constraints
- `ehg_services_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text])))

## Indexes

- `ehg_services_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_services_pkey ON public.ehg_services USING btree (id)
  ```
- `ehg_services_service_key_key`
  ```sql
  CREATE UNIQUE INDEX ehg_services_service_key_key ON public.ehg_services USING btree (service_key)
  ```

## RLS Policies

### 1. ehg_services_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ehg_services_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. ehg_services_read_all (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### ehg_services_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

### set_updated_at_ehg_services

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
