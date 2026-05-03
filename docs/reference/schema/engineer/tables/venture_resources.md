# venture_resources Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-03T00:54:41.781Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

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
| repo_url | `text` | YES | - | GitHub repository URL captured at Stage 19 Replit-deployment registration. Populated by `POST /api/stage19/:ventureId/register-deployment` (SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-3). Read by exit-gate-enforcer for the `gates.exit` "GitHub repo URL stored in venture_resources" verifier. NULL for ventures that skip Replit. |
| deployment_url | `text` | YES | - | Replit / hosting deployment URL captured at Stage 19 registration alongside `repo_url`. Same SD/FR. Indexed by partial unique index `venture_resources_venture_deployment_url_uniq` to prevent duplicate registrations per venture. NULL for non-Replit ventures. |

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
- `venture_resources_venture_deployment_url_uniq` (partial)
  ```sql
  CREATE UNIQUE INDEX venture_resources_venture_deployment_url_uniq
    ON public.venture_resources (venture_id, deployment_url)
    WHERE deployment_url IS NOT NULL
  ```
  Added by migration `20260503_venture_resources_add_replit_urls.sql` to prevent duplicate Replit deployment registrations on the same venture. Partial-on-NOT-NULL so existing rows without `deployment_url` are unaffected.

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
