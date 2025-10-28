# pr_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| date | `date` | YES | `CURRENT_DATE` | - |
| total_reviews | `integer(32)` | YES | `0` | - |
| passed_reviews | `integer(32)` | YES | `0` | - |
| failed_reviews | `integer(32)` | YES | `0` | - |
| warning_reviews | `integer(32)` | YES | `0` | - |
| avg_review_time_ms | `integer(32)` | YES | `0` | - |
| false_positive_count | `integer(32)` | YES | `0` | - |
| compliance_count | `integer(32)` | YES | `0` | - |
| sub_agent_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pr_metrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `pr_metrics_date_key`: UNIQUE (date)

## Indexes

- `idx_pr_metrics_date`
  ```sql
  CREATE INDEX idx_pr_metrics_date ON public.pr_metrics USING btree (date DESC)
  ```
- `pr_metrics_date_key`
  ```sql
  CREATE UNIQUE INDEX pr_metrics_date_key ON public.pr_metrics USING btree (date)
  ```
- `pr_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX pr_metrics_pkey ON public.pr_metrics USING btree (id)
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

### update_pr_metrics_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
