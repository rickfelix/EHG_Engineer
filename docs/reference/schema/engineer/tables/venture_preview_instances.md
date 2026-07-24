# venture_preview_instances Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| sha | `text` | **NO** | - | - |
| fixture_id | `text` | YES | - | - |
| status | `text` | **NO** | `'planned'::text` | - |
| url | `text` | YES | - | - |
| expires_at | `timestamp with time zone` | **NO** | - | - |
| created_by | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_preview_instances_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_preview_instances_status_check`: CHECK ((status = ANY (ARRAY['planned'::text, 'live'::text, 'reaped'::text, 'failed'::text])))

## Indexes

- `idx_venture_preview_instances_reap`
  ```sql
  CREATE INDEX idx_venture_preview_instances_reap ON public.venture_preview_instances USING btree (status, expires_at)
  ```
- `venture_preview_instances_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_preview_instances_pkey ON public.venture_preview_instances USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
