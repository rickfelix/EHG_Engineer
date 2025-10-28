# agentic_reviews Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 12
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pr_number | `integer(32)` | **NO** | - | - |
| pr_title | `text` | **NO** | - | - |
| branch | `text` | **NO** | - | - |
| author | `text` | **NO** | - | - |
| github_url | `text` | YES | - | - |
| status | `text` | YES | `'pending'::text` | - |
| summary | `text` | YES | - | - |
| issues | `jsonb` | YES | `'[]'::jsonb` | - |
| sub_agent_reviews | `jsonb` | YES | `'[]'::jsonb` | - |
| sd_link | `text` | YES | - | - |
| prd_link | `text` | YES | - | - |
| leo_phase | `text` | YES | - | - |
| commit_sha | `text` | YES | - | - |
| review_time_ms | `integer(32)` | YES | - | - |
| is_false_positive | `boolean` | YES | `false` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `agentic_reviews_pkey`: PRIMARY KEY (id)

### Check Constraints
- `agentic_reviews_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'warning'::text])))

## Indexes

- `agentic_reviews_pkey`
  ```sql
  CREATE UNIQUE INDEX agentic_reviews_pkey ON public.agentic_reviews USING btree (id)
  ```
- `idx_agentic_reviews_created_at`
  ```sql
  CREATE INDEX idx_agentic_reviews_created_at ON public.agentic_reviews USING btree (created_at DESC)
  ```
- `idx_agentic_reviews_pr_number`
  ```sql
  CREATE INDEX idx_agentic_reviews_pr_number ON public.agentic_reviews USING btree (pr_number)
  ```
- `idx_agentic_reviews_status`
  ```sql
  CREATE INDEX idx_agentic_reviews_status ON public.agentic_reviews USING btree (status)
  ```

## RLS Policies

### 1. Enable insert for authenticated users (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Enable read access for all users (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Enable update for authenticated users (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### update_agentic_reviews_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
