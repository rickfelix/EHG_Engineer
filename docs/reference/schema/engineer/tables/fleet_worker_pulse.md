# fleet_worker_pulse Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 4
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| captured_at | `timestamp with time zone` | **NO** | `now()` | - |
| active_count | `integer(32)` | **NO** | - | - |
| total_count | `integer(32)` | **NO** | - | - |
| idle_count | `integer(32)` | **NO** | `0` | - |

## Constraints

### Primary Key
- `fleet_worker_pulse_pkey`: PRIMARY KEY (id)

### Check Constraints
- `fleet_worker_pulse_active_count_check`: CHECK ((active_count >= 0))
- `fleet_worker_pulse_idle_count_check`: CHECK ((idle_count >= 0))
- `fleet_worker_pulse_total_count_check`: CHECK ((total_count >= 0))

## Indexes

- `fleet_worker_pulse_pkey`
  ```sql
  CREATE UNIQUE INDEX fleet_worker_pulse_pkey ON public.fleet_worker_pulse USING btree (id)
  ```
- `idx_fleet_worker_pulse_captured_at`
  ```sql
  CREATE INDEX idx_fleet_worker_pulse_captured_at ON public.fleet_worker_pulse USING btree (captured_at DESC)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
