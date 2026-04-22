# venture_resources Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-22T22:11:25.679Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| resource_type | `text` | **NO** | - | - |
| resource_identifier | `text` | **NO** | - | - |
| provider | `text` | **NO** | `'unknown'::text` | - |
| status | `text` | **NO** | `'active'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_resources_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_resources_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_resources_venture_id_resource_type_resource_identif_key`: UNIQUE (venture_id, resource_type, resource_identifier)

### Check Constraints
- `venture_resources_resource_type_check`: CHECK ((resource_type = ANY (ARRAY['github_repo'::text, 'vercel_deployment'::text, 'local_directory'::text, 'supabase_project'::text, 'domain'::text, 'npm_package'::text])))
- `venture_resources_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'cleaned'::text, 'failed'::text, 'orphaned'::text])))

## Indexes

- `idx_venture_resources_status`
  ```sql
  CREATE INDEX idx_venture_resources_status ON public.venture_resources USING btree (status)
  ```
- `idx_venture_resources_venture_id`
  ```sql
  CREATE INDEX idx_venture_resources_venture_id ON public.venture_resources USING btree (venture_id)
  ```
- `venture_resources_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_resources_pkey ON public.venture_resources USING btree (id)
  ```
- `venture_resources_venture_id_resource_type_resource_identif_key`
  ```sql
  CREATE UNIQUE INDEX venture_resources_venture_id_resource_type_resource_identif_key ON public.venture_resources USING btree (venture_id, resource_type, resource_identifier)
  ```

## RLS Policies

### 1. venture_resources_select_own (SELECT)

- **Roles**: {authenticated}
- **Using**: `((current_setting('role'::text, true) = 'service_role'::text) OR portfolio.has_venture_access(venture_id))`

### 2. venture_resources_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_venture_resources_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_resources_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
