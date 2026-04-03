# venture_milestones Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-03T23:17:43.642Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| milestone_name | `text` | **NO** | - | - |
| start_date | `timestamp with time zone` | YES | - | - |
| end_date | `timestamp with time zone` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| dependencies | `ARRAY` | YES | `'{}'::integer[]` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_milestones_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_milestones_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_milestones_venture_id_stage_number_key`: UNIQUE (venture_id, stage_number)

### Check Constraints
- `venture_milestones_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 40)))
- `venture_milestones_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'blocked'::text])))

## Indexes

- `idx_venture_milestones_status`
  ```sql
  CREATE INDEX idx_venture_milestones_status ON public.venture_milestones USING btree (status)
  ```
- `idx_venture_milestones_venture_id`
  ```sql
  CREATE INDEX idx_venture_milestones_venture_id ON public.venture_milestones USING btree (venture_id)
  ```
- `venture_milestones_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_milestones_pkey ON public.venture_milestones USING btree (id)
  ```
- `venture_milestones_venture_id_stage_number_key`
  ```sql
  CREATE UNIQUE INDEX venture_milestones_venture_id_stage_number_key ON public.venture_milestones USING btree (venture_id, stage_number)
  ```

## RLS Policies

### 1. service_role_all_venture_milestones (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
