# agent_performance_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T20:43:36.015Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_code | `character varying(50)` | **NO** | - | - |
| agent_version | `character varying(20)` | **NO** | `'1.0.0'::character varying` | - |
| measurement_date | `date` | **NO** | `CURRENT_DATE` | - |
| measurement_window | `character varying(20)` | **NO** | `'daily'::character varying` | - |
| total_executions | `integer(32)` | **NO** | `0` | - |
| successful_executions | `integer(32)` | **NO** | `0` | - |
| failed_executions | `integer(32)` | **NO** | `0` | - |
| avg_execution_time | `numeric(8,2)` | **NO** | `0.0` | - |
| max_execution_time | `integer(32)` | **NO** | `0` | - |
| times_selected | `integer(32)` | **NO** | `0` | - |
| avg_selection_confidence | `numeric(3,2)` | **NO** | `0.0` | - |
| confidence_distribution | `jsonb` | YES | - | - |
| positive_feedback | `integer(32)` | **NO** | `0` | - |
| negative_feedback | `integer(32)` | **NO** | `0` | - |
| user_dismissals | `integer(32)` | **NO** | `0` | - |
| top_trigger_patterns | `jsonb` | YES | - | - |
| context_effectiveness | `jsonb` | YES | - | - |
| works_well_with | `jsonb` | YES | - | - |
| coordination_success_rate | `numeric(3,2)` | YES | - | - |
| recommended_min_confidence | `numeric(3,2)` | YES | - | - |
| recommended_max_agents | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_performance_metrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agent_performance_metrics_agent_code_measurement_date_measu_key`: UNIQUE (agent_code, measurement_date, measurement_window)

## Indexes

- `agent_performance_metrics_agent_code_measurement_date_measu_key`
  ```sql
  CREATE UNIQUE INDEX agent_performance_metrics_agent_code_measurement_date_measu_key ON public.agent_performance_metrics USING btree (agent_code, measurement_date, measurement_window)
  ```
- `agent_performance_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_performance_metrics_pkey ON public.agent_performance_metrics USING btree (id)
  ```
- `idx_agent_performance`
  ```sql
  CREATE INDEX idx_agent_performance ON public.agent_performance_metrics USING btree (agent_code, measurement_date DESC)
  ```
- `idx_agent_success_rate`
  ```sql
  CREATE INDEX idx_agent_success_rate ON public.agent_performance_metrics USING btree (successful_executions DESC, total_executions DESC)
  ```
- `idx_coordination_success`
  ```sql
  CREATE INDEX idx_coordination_success ON public.agent_performance_metrics USING btree (coordination_success_rate DESC)
  ```

## RLS Policies

### 1. authenticated_read_agent_performance_metrics (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_performance_metrics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_agent_performance_metrics_modtime

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_modified_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
