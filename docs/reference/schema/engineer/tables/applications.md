# applications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-31T17:03:47.186Z
**Rows**: 10
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(120)` | **NO** | - | - |
| normalized_name | `character varying(120)` | **NO** | - | - |
| kind | `character varying(20)` | **NO** | `'venture'::character varying` | - |
| github_repo | `text` | YES | - | - |
| local_path | `text` | YES | - | - |
| repo_url | `text` | YES | - | - |
| deployment_url | `text` | YES | - | - |
| deployment_target | `character varying(60)` | YES | - | - |
| supabase_project_id | `text` | YES | - | - |
| current_lifecycle_stage | `integer(32)` | YES | - | - |
| status | `character varying(20)` | **NO** | `'active'::character varying` | - |
| venture_id | `uuid` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| trust_tier | `character varying(20)` | **NO** | `'external'::character varying` | auto-merge eligibility: platform=unattended OK, trusted=vetted internal, external=human merge required (venture/3rd-party). SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C2/VB-2. |
| metrics_base_url | `text` | YES | - | Base URL of the venture's authenticated GET /v1/metrics endpoint (e.g. https://crongenius.<acct>.workers.dev). NULL => the daily telemetry pull skips this venture. |
| metrics_api_key_ref | `text` | YES | - | D5: NAME of the env var / secret holding the venture read key (NOT the raw secret). The pull job resolves it at runtime via process.env[metrics_api_key_ref]. Rotation = update the secret value; this reference is unchanged. |
| deleted_at | `timestamp with time zone` | YES | - | SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001: reversible tombstone. NULL == live. Set when the linked venture is retired/deleted; clearing it restores the row. |
| deleted_by | `text` | YES | - | - |
| deletion_reason | `text` | YES | - | - |

## Constraints

### Primary Key
- `applications_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `applications_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `applications_kind_check`: CHECK (((kind)::text = ANY ((ARRAY['platform'::character varying, 'venture'::character varying])::text[])))
- `applications_status_check`: CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'retired'::character varying])::text[])))
- `ck_applications_trust_tier`: CHECK (((trust_tier)::text = ANY ((ARRAY['platform'::character varying, 'trusted'::character varying, 'external'::character varying])::text[])))

## Indexes

- `applications_pkey`
  ```sql
  CREATE UNIQUE INDEX applications_pkey ON public.applications USING btree (id)
  ```
- `idx_applications_status`
  ```sql
  CREATE INDEX idx_applications_status ON public.applications USING btree (status)
  ```
- `uq_applications_name_lower`
  ```sql
  CREATE UNIQUE INDEX uq_applications_name_lower ON public.applications USING btree (lower((name)::text)) WHERE (deleted_at IS NULL)
  ```
- `uq_applications_normalized_name`
  ```sql
  CREATE UNIQUE INDEX uq_applications_normalized_name ON public.applications USING btree (normalized_name) WHERE (deleted_at IS NULL)
  ```

## Triggers

### trg_applications_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_updated_at_applications()`

---

[← Back to Schema Overview](../database-schema-overview.md)
