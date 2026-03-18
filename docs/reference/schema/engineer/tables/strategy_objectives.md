# strategy_objectives Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-18T21:27:24.934Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| time_horizon | `text` | YES | - | - |
| status | `text` | YES | `'active'::text` | - |
| target_capabilities | `jsonb` | YES | `'[]'::jsonb` | - |
| success_criteria | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| killed_at | `timestamp with time zone` | YES | - | - |
| kill_reason | `text` | YES | - | - |
| linked_okr_ids | `ARRAY` | YES | `ARRAY[]::uuid[]` | - |
| health_indicator | `text` | YES | `'green'::text` | - |

## Constraints

### Primary Key
- `strategy_objectives_pkey`: PRIMARY KEY (id)

### Check Constraints
- `strategy_objectives_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'killed'::text])))
- `strategy_objectives_time_horizon_check`: CHECK ((time_horizon = ANY (ARRAY['now'::text, 'next'::text, 'later'::text, 'eventually'::text])))

## Indexes

- `idx_strategy_objectives_status`
  ```sql
  CREATE INDEX idx_strategy_objectives_status ON public.strategy_objectives USING btree (status)
  ```
- `idx_strategy_objectives_time_horizon`
  ```sql
  CREATE INDEX idx_strategy_objectives_time_horizon ON public.strategy_objectives USING btree (time_horizon)
  ```
- `strategy_objectives_pkey`
  ```sql
  CREATE UNIQUE INDEX strategy_objectives_pkey ON public.strategy_objectives USING btree (id)
  ```

## RLS Policies

### 1. anon_read (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
