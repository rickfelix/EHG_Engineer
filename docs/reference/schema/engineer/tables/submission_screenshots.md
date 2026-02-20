# submission_screenshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T17:30:30.692Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| submission_id | `character varying(255)` | YES | - | - |
| screenshot_url | `text` | **NO** | - | - |
| screenshot_data | `text` | YES | - | - |
| mime_type | `character varying(50)` | YES | - | - |
| file_size | `integer(32)` | YES | - | - |
| uploaded_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `submission_screenshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `submission_screenshots_submission_id_fkey`: submission_id → directive_submissions(submission_id)

## Indexes

- `idx_screenshots_submission`
  ```sql
  CREATE INDEX idx_screenshots_submission ON public.submission_screenshots USING btree (submission_id)
  ```
- `submission_screenshots_pkey`
  ```sql
  CREATE UNIQUE INDEX submission_screenshots_pkey ON public.submission_screenshots USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_submission_screenshots (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_submission_screenshots (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
