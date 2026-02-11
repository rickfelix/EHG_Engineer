# leo_feature_flag_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T13:23:36.495Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_id | `uuid` | **NO** | - | - |
| rollout_percentage | `integer(32)` | **NO** | `0` | Percentage of users to enable (0-100). 100 = all users |
| user_targeting | `jsonb` | **NO** | `'{}'::jsonb` | JSON with allowlist/blocklist subject_ids for targeting |
| environment | `text` | **NO** | `'production'::text` | Target environment (production, staging, development) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_feature_flag_policies_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_feature_flag_policies_flag_id_fkey`: flag_id → leo_feature_flags(id)

### Unique Constraints
- `leo_feature_flag_policies_flag_id_environment_key`: UNIQUE (flag_id, environment)

### Check Constraints
- `leo_feature_flag_policies_rollout_percentage_check`: CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))

## Indexes

- `idx_leo_feature_flag_policies_flag_env`
  ```sql
  CREATE INDEX idx_leo_feature_flag_policies_flag_env ON public.leo_feature_flag_policies USING btree (flag_id, environment)
  ```
- `leo_feature_flag_policies_flag_id_environment_key`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flag_policies_flag_id_environment_key ON public.leo_feature_flag_policies USING btree (flag_id, environment)
  ```
- `leo_feature_flag_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flag_policies_pkey ON public.leo_feature_flag_policies USING btree (id)
  ```

## RLS Policies

### 1. leo_feature_flag_policies_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_feature_flag_policies_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_updated_at_leo_feature_flag_policies

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
