# ventures_kill_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-27T19:49:10.334Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| killed_by_user_id | `uuid` | YES | - | - |
| rationale | `text` | **NO** | - | - |
| killed_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `ventures_kill_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ventures_kill_log_killed_by_user_id_fkey`: killed_by_user_id → users(id)
- `ventures_kill_log_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `ventures_kill_log_rationale_check`: CHECK ((length(rationale) >= 20))

## Indexes

- `idx_ventures_kill_log_killed_at`
  ```sql
  CREATE INDEX idx_ventures_kill_log_killed_at ON public.ventures_kill_log USING btree (killed_at DESC)
  ```
- `idx_ventures_kill_log_venture`
  ```sql
  CREATE INDEX idx_ventures_kill_log_venture ON public.ventures_kill_log USING btree (venture_id)
  ```
- `ventures_kill_log_pkey`
  ```sql
  CREATE UNIQUE INDEX ventures_kill_log_pkey ON public.ventures_kill_log USING btree (id)
  ```

## RLS Policies

### 1. ventures_kill_log_select (SELECT)

- **Roles**: {public}
- **Using**: `(fn_is_chairman() OR (killed_by_user_id = auth.uid()))`

---

[← Back to Schema Overview](../database-schema-overview.md)
