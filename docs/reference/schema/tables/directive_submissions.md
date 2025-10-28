# directive_submissions Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| submission_id | `character varying(255)` | **NO** | - | - |
| chairman_input | `text` | YES | - | - |
| screenshot_url | `text` | YES | - | - |
| intent_summary | `text` | YES | - | - |
| strategic_tactical_classification | `jsonb` | YES | - | - |
| synthesis_data | `jsonb` | YES | - | - |
| questions | `jsonb` | YES | - | - |
| final_summary | `text` | YES | - | - |
| status | `character varying(50)` | YES | `'draft'::character varying` | - |
| current_step | `integer(32)` | YES | `1` | - |
| completed_steps | `jsonb` | YES | `'[]'::jsonb` | - |
| gate_status | `jsonb` | YES | `'{}'::jsonb` | - |
| created_by | `character varying(255)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `directive_submissions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `directive_submissions_submission_id_key`: UNIQUE (submission_id)

## Indexes

- `directive_submissions_pkey`
  ```sql
  CREATE UNIQUE INDEX directive_submissions_pkey ON public.directive_submissions USING btree (id)
  ```
- `directive_submissions_submission_id_key`
  ```sql
  CREATE UNIQUE INDEX directive_submissions_submission_id_key ON public.directive_submissions USING btree (submission_id)
  ```
- `idx_submissions_created`
  ```sql
  CREATE INDEX idx_submissions_created ON public.directive_submissions USING btree (created_at DESC)
  ```
- `idx_submissions_status`
  ```sql
  CREATE INDEX idx_submissions_status ON public.directive_submissions USING btree (status)
  ```
- `idx_submissions_user`
  ```sql
  CREATE INDEX idx_submissions_user ON public.directive_submissions USING btree (created_by)
  ```

## RLS Policies

### 1. authenticated_read_directive_submissions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_directive_submissions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
