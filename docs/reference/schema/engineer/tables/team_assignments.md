# team_assignments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T22:06:07.798Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| stage_number | `integer(32)` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| assignee | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `team_assignments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `team_assignments_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `team_assignments_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))

## Indexes

- `idx_team_assignments_status`
  ```sql
  CREATE INDEX idx_team_assignments_status ON public.team_assignments USING btree (status)
  ```
- `team_assignments_pkey`
  ```sql
  CREATE UNIQUE INDEX team_assignments_pkey ON public.team_assignments USING btree (id)
  ```

## RLS Policies

### 1. team_assignments_read (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
