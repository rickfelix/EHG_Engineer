# ops_agent_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T17:22:56.600Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| agent_id | `uuid` | **NO** | - | Tool/agent UUID from venture_tool_quotas.tool_id |
| metric_date | `date` | **NO** | - | - |
| response_quality_score | `numeric(5,2)` | YES | - | Quality score 0-100 derived from outcome success rate |
| decision_accuracy_pct | `numeric(5,2)` | YES | - | Percentage of successful decisions/outcomes |
| cost_per_action_usd | `numeric(10,4)` | YES | - | Average cost per action (cost / usage) |
| quota_utilization_pct | `numeric(5,2)` | YES | - | Percentage of monthly quota used |
| total_actions | `integer(32)` | YES | `0` | - |
| successful_actions | `integer(32)` | YES | `0` | - |
| budget_remaining_pct | `numeric(5,2)` | YES | - | Percentage of token budget remaining |
| computed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_agent_health_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_agent_health_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_agent_health_venture_id_agent_id_metric_date_key`: UNIQUE (venture_id, agent_id, metric_date)

## Indexes

- `idx_ops_agent_health_venture_date`
  ```sql
  CREATE INDEX idx_ops_agent_health_venture_date ON public.ops_agent_health USING btree (venture_id, agent_id, metric_date DESC)
  ```
- `ops_agent_health_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_agent_health_pkey ON public.ops_agent_health USING btree (id)
  ```
- `ops_agent_health_venture_id_agent_id_metric_date_key`
  ```sql
  CREATE UNIQUE INDEX ops_agent_health_venture_id_agent_id_metric_date_key ON public.ops_agent_health USING btree (venture_id, agent_id, metric_date)
  ```

## RLS Policies

### 1. ops_agent_health_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_agent_health_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_agent_health_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_agent_health_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
