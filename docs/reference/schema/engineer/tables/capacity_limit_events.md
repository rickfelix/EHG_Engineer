# capacity_limit_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| account | `text` | **NO** | - | Which Claude account hit the limit, e.g. rickfelix2000, codestreetlabs. |
| event_type | `text` | **NO** | - | session_window_exhausted: the rolling multi-hour session window ran out under concurrent fleet load. weekly_cap_hit: the account's weekly usage cap was hit. |
| fleet_size | `integer(32)` | YES | - | Approximate concurrent session count at the time of exhaustion, when known. NULL for event types where this wasn't observed (e.g. a weekly cap hit by a single/few sessions over days, not a concurrent-fleet burn). |
| window_started_at | `timestamp with time zone` | YES | - | When the burn window began, when known -- lets session_hours_burned be cross-checked against limit_hit_at - window_started_at. |
| limit_hit_at | `timestamp with time zone` | **NO** | - | Wall-clock time the limit was actually hit. Required for every row. |
| session_hours_burned | `numeric(6,2)` | YES | - | Total session-hours (fleet_size x hours-elapsed) consumed by the time the limit hit, when known. This is the governor's calibrated budget input. |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `capacity_limit_events_pkey`: PRIMARY KEY (id)

### Check Constraints
- `capacity_limit_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['session_window_exhausted'::text, 'weekly_cap_hit'::text])))
- `capacity_limit_events_fleet_size_nonneg`: CHECK (((fleet_size IS NULL) OR (fleet_size >= 0)))
- `capacity_limit_events_hours_nonneg`: CHECK (((session_hours_burned IS NULL) OR (session_hours_burned >= (0)::numeric)))

## Indexes

- `capacity_limit_events_pkey`
  ```sql
  CREATE UNIQUE INDEX capacity_limit_events_pkey ON public.capacity_limit_events USING btree (id)
  ```
- `idx_capacity_limit_events_account_hit`
  ```sql
  CREATE INDEX idx_capacity_limit_events_account_hit ON public.capacity_limit_events USING btree (account, limit_hit_at DESC)
  ```
- `idx_capacity_limit_events_type`
  ```sql
  CREATE INDEX idx_capacity_limit_events_type ON public.capacity_limit_events USING btree (event_type, limit_hit_at DESC)
  ```

## RLS Policies

### 1. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
