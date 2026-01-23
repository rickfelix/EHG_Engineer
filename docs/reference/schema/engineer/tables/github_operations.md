# github_operations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T20:53:11.137Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(255)` | YES | - | - |
| prd_id | `character varying(255)` | YES | - | - |
| operation_type | `character varying(50)` | **NO** | - | Type of GitHub operation: pr_create, pr_merge, release, deploy, review |
| pr_number | `integer(32)` | YES | - | - |
| pr_url | `text` | YES | - | - |
| pr_title | `text` | YES | - | - |
| pr_status | `character varying(50)` | YES | - | - |
| release_tag | `character varying(100)` | YES | - | - |
| release_url | `text` | YES | - | - |
| release_notes | `text` | YES | - | - |
| commit_hash | `character varying(255)` | YES | - | - |
| branch_name | `character varying(255)` | YES | - | - |
| base_branch | `character varying(255)` | YES | `'main'::character varying` | - |
| review_requested_from | `ARRAY` | YES | - | - |
| review_status | `character varying(50)` | YES | - | - |
| review_comments | `integer(32)` | YES | `0` | - |
| deployment_id | `character varying(255)` | YES | - | - |
| deployment_status | `character varying(50)` | YES | - | Status of deployment: pending, in_progress, success, failed |
| deployment_environment | `character varying(50)` | YES | - | - |
| deployment_url | `text` | YES | - | - |
| leo_phase | `character varying(50)` | YES | - | LEO Protocol phase that triggered this operation |
| triggered_by | `character varying(50)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `github_operations_pkey`: PRIMARY KEY (id)

## Indexes

- `github_operations_pkey`
  ```sql
  CREATE UNIQUE INDEX github_operations_pkey ON public.github_operations USING btree (id)
  ```
- `idx_github_ops_created_at`
  ```sql
  CREATE INDEX idx_github_ops_created_at ON public.github_operations USING btree (created_at DESC)
  ```
- `idx_github_ops_operation_type`
  ```sql
  CREATE INDEX idx_github_ops_operation_type ON public.github_operations USING btree (operation_type)
  ```
- `idx_github_ops_pr_number`
  ```sql
  CREATE INDEX idx_github_ops_pr_number ON public.github_operations USING btree (pr_number)
  ```
- `idx_github_ops_prd_id`
  ```sql
  CREATE INDEX idx_github_ops_prd_id ON public.github_operations USING btree (prd_id)
  ```
- `idx_github_ops_sd_id`
  ```sql
  CREATE INDEX idx_github_ops_sd_id ON public.github_operations USING btree (sd_id)
  ```

## RLS Policies

### 1. Allow authenticated users to delete github_operations (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated users to update github_operations (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. Allow insert GitHub operations (INSERT)

- **Roles**: {public}
- **With Check**: `((sd_id IS NOT NULL) OR (prd_id IS NOT NULL))`

### 4. Allow read access to GitHub operations (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
