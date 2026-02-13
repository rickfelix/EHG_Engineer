# venture_nursery Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T10:51:37.586Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| brief_id | `uuid` | YES | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| maturity_level | `text` | **NO** | `'seed'::text` | - |
| trigger_conditions | `jsonb` | YES | `'[]'::jsonb` | - |
| current_score | `numeric(5,2)` | YES | - | - |
| score_history | `jsonb` | YES | `'[]'::jsonb` | - |
| last_evaluated_at | `timestamp with time zone` | YES | - | - |
| next_evaluation_at | `timestamp with time zone` | YES | - | - |
| evaluation_interval_days | `integer(32)` | YES | `30` | - |
| promoted_to_venture_id | `uuid` | YES | - | - |
| promoted_at | `timestamp with time zone` | YES | - | - |
| source_type | `text` | YES | - | - |
| source_ref | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_nursery_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_nursery_brief_id_fkey`: brief_id → venture_briefs(id)
- `venture_nursery_promoted_to_venture_id_fkey`: promoted_to_venture_id → ventures(id)

### Check Constraints
- `venture_nursery_maturity_level_check`: CHECK ((maturity_level = ANY (ARRAY['seed'::text, 'sprout'::text, 'ready'::text])))
- `venture_nursery_source_type_check`: CHECK ((source_type = ANY (ARRAY['brainstorm'::text, 'todoist'::text, 'youtube'::text, 'competitor_analysis'::text, 'discovery_mode'::text, 'manual'::text])))

## Indexes

- `idx_venture_nursery_brief`
  ```sql
  CREATE INDEX idx_venture_nursery_brief ON public.venture_nursery USING btree (brief_id)
  ```
- `idx_venture_nursery_maturity`
  ```sql
  CREATE INDEX idx_venture_nursery_maturity ON public.venture_nursery USING btree (maturity_level)
  ```
- `idx_venture_nursery_next_eval`
  ```sql
  CREATE INDEX idx_venture_nursery_next_eval ON public.venture_nursery USING btree (next_evaluation_at) WHERE (promoted_to_venture_id IS NULL)
  ```
- `venture_nursery_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_nursery_pkey ON public.venture_nursery USING btree (id)
  ```

## RLS Policies

### 1. venture_nursery_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
