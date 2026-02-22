# portfolio_profile_allocations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:51:20.959Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| profile_id | `uuid` | **NO** | - | - |
| target_pct | `numeric(5,2)` | **NO** | `33.33` | - |
| current_pct | `numeric(5,2)` | **NO** | `0` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `portfolio_profile_allocations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `portfolio_profile_allocations_profile_id_fkey`: profile_id → evaluation_profiles(id)

### Unique Constraints
- `portfolio_profile_allocations_profile_id_key`: UNIQUE (profile_id)

### Check Constraints
- `portfolio_profile_allocations_current_pct_check`: CHECK (((current_pct >= (0)::numeric) AND (current_pct <= (100)::numeric)))
- `portfolio_profile_allocations_target_pct_check`: CHECK (((target_pct >= (0)::numeric) AND (target_pct <= (100)::numeric)))

## Indexes

- `portfolio_profile_allocations_pkey`
  ```sql
  CREATE UNIQUE INDEX portfolio_profile_allocations_pkey ON public.portfolio_profile_allocations USING btree (id)
  ```
- `portfolio_profile_allocations_profile_id_key`
  ```sql
  CREATE UNIQUE INDEX portfolio_profile_allocations_profile_id_key ON public.portfolio_profile_allocations USING btree (profile_id)
  ```

## RLS Policies

### 1. service_role_full_access_portfolio_alloc (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_portfolio_allocation_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_portfolio_allocation_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
