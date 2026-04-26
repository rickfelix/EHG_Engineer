# portfolio_allocation_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| policy_version | `integer(32)` | **NO** | - | - |
| policy_key | `text` | **NO** | - | - |
| is_active | `boolean` | **NO** | `false` | - |
| activated_at | `timestamp with time zone` | YES | - | - |
| activated_by | `text` | YES | - | - |
| deactivated_at | `timestamp with time zone` | YES | - | - |
| dimensions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| weights | `jsonb` | **NO** | `'{}'::jsonb` | - |
| phase_definitions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| archetype_unlock_conditions | `jsonb` | **NO** | `'{}'::jsonb` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| board_approved | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `portfolio_allocation_policies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `policy_version_key_unique`: UNIQUE (policy_key, policy_version)

## Indexes

- `idx_one_active_policy_per_key`
  ```sql
  CREATE UNIQUE INDEX idx_one_active_policy_per_key ON public.portfolio_allocation_policies USING btree (policy_key) WHERE (is_active = true)
  ```
- `policy_version_key_unique`
  ```sql
  CREATE UNIQUE INDEX policy_version_key_unique ON public.portfolio_allocation_policies USING btree (policy_key, policy_version)
  ```
- `portfolio_allocation_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX portfolio_allocation_policies_pkey ON public.portfolio_allocation_policies USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_active_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `(is_active = true)`

### 2. service_role_all_policy (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_policy_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_policy_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
