# learning_configurations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:34:01.578Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| config_scope | `character varying(50)` | **NO** | - | - |
| scope_id | `character varying(100)` | YES | - | - |
| auto_threshold | `numeric(3,2)` | **NO** | `0.8` | - |
| prompt_threshold | `numeric(3,2)` | **NO** | `0.6` | - |
| max_agents | `integer(32)` | **NO** | `3` | - |
| confidence_boost | `numeric(3,2)` | **NO** | `0.0` | - |
| agent_weights | `jsonb` | YES | - | - |
| context_multipliers | `jsonb` | YES | - | - |
| learning_rate | `numeric(4,3)` | **NO** | `0.1` | - |
| adaptation_window | `integer(32)` | **NO** | `50` | - |
| min_interactions_for_learning | `integer(32)` | **NO** | `10` | - |
| target_success_rate | `numeric(3,2)` | **NO** | `0.85` | - |
| target_response_time | `integer(32)` | **NO** | `3000` | - |
| target_user_satisfaction | `numeric(3,2)` | **NO** | `0.8` | - |
| total_adaptations | `integer(32)` | **NO** | `0` | - |
| last_adaptation | `timestamp with time zone` | YES | - | - |
| adaptation_direction | `character varying(20)` | YES | - | - |
| current_success_rate | `numeric(3,2)` | YES | - | - |
| current_avg_response_time | `integer(32)` | YES | - | - |
| current_user_satisfaction | `numeric(3,2)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `learning_configurations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `learning_configurations_config_scope_scope_id_key`: UNIQUE (config_scope, scope_id)

## Indexes

- `idx_config_scope`
  ```sql
  CREATE INDEX idx_config_scope ON public.learning_configurations USING btree (config_scope, scope_id)
  ```
- `idx_learning_performance`
  ```sql
  CREATE INDEX idx_learning_performance ON public.learning_configurations USING btree (current_success_rate DESC, current_user_satisfaction DESC)
  ```
- `learning_configurations_config_scope_scope_id_key`
  ```sql
  CREATE UNIQUE INDEX learning_configurations_config_scope_scope_id_key ON public.learning_configurations USING btree (config_scope, scope_id)
  ```
- `learning_configurations_pkey`
  ```sql
  CREATE UNIQUE INDEX learning_configurations_pkey ON public.learning_configurations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_learning_configurations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_learning_configurations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_learning_configurations_modtime

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_modified_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
