# leo_feedback Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:29:22.689Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| source_type | `text` | **NO** | - | - |
| source_id | `uuid` | YES | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| category | `text` | YES | - | - |
| priority | `integer(32)` | YES | `5` | - |
| status | `text` | **NO** | `'pending'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| sd_id | `character varying(50)` | YES | - | - |
| resolved_by_sd_id | `character varying(50)` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_feedback_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_feedback_priority_check`: CHECK (((priority >= 1) AND (priority <= 10)))
- `leo_feedback_source_type_check`: CHECK ((source_type = ANY (ARRAY['retrospective'::text, 'user_report'::text, 'automated'::text, 'manual'::text])))
- `leo_feedback_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'vetted'::text, 'rejected'::text, 'implemented'::text, 'duplicate'::text, 'resolved'::text])))

## Indexes

- `idx_feedback_source`
  ```sql
  CREATE INDEX idx_feedback_source ON public.leo_feedback USING btree (source_type, source_id)
  ```
- `idx_leo_feedback_resolved_by_status_created`
  ```sql
  CREATE INDEX idx_leo_feedback_resolved_by_status_created ON public.leo_feedback USING btree (resolved_by_sd_id, status, created_at)
  ```
- `idx_leo_feedback_sd_id`
  ```sql
  CREATE INDEX idx_leo_feedback_sd_id ON public.leo_feedback USING btree (sd_id)
  ```
- `leo_feedback_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feedback_pkey ON public.leo_feedback USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated to insert feedback (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow read access to feedback (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
