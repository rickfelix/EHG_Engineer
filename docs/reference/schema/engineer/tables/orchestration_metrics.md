# orchestration_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:29:22.689Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| metric_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| stage_id | `integer(32)` | YES | - | - |
| stage_duration | `interval` | YES | - | Time spent in specific stage |
| handoff_efficiency | `numeric(5,2)` | YES | - | Percentage of successful agent-to-agent handoffs without errors or retries |
| error_rate | `numeric(5,4)` | YES | - | Errors per action (0-1) |
| action_count | `integer(32)` | YES | `0` | - |
| success_count | `integer(32)` | YES | `0` | - |
| failure_count | `integer(32)` | YES | `0` | - |
| agent_response_time | `interval` | YES | - | Average agent response time |
| agent_utilization | `numeric(5,2)` | YES | - | Percentage of time agents were active (0-100) |
| agents_involved | `ARRAY` | YES | - | - |
| chairman_interventions | `integer(32)` | YES | `0` | Number of manual Chairman overrides |
| chairman_approvals | `integer(32)` | YES | `0` | - |
| chairman_rejections | `integer(32)` | YES | `0` | - |
| compute_cost | `numeric(10,2)` | YES | - | - |
| api_calls_made | `integer(32)` | YES | `0` | - |
| data_quality_score | `numeric(5,2)` | YES | - | Quality of data produced (0-100) |
| confidence_score | `numeric(5,2)` | YES | - | AI confidence in decisions (0-100) |
| recorded_at | `timestamp with time zone` | YES | `now()` | - |
| metric_period_start | `timestamp with time zone` | YES | - | - |
| metric_period_end | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `orchestration_metrics_pkey`: PRIMARY KEY (metric_id)

### Foreign Keys
- `orchestration_metrics_company_id_fkey`: company_id → companies(id)
- `orchestration_metrics_session_id_fkey`: session_id → eva_orchestration_sessions(session_id)
- `orchestration_metrics_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `orchestration_metrics_stage_id_check`: CHECK (((stage_id >= 1) AND (stage_id <= 40)))

## Indexes

- `idx_orch_metrics_company`
  ```sql
  CREATE INDEX idx_orch_metrics_company ON public.orchestration_metrics USING btree (company_id)
  ```
- `idx_orch_metrics_recorded`
  ```sql
  CREATE INDEX idx_orch_metrics_recorded ON public.orchestration_metrics USING btree (recorded_at DESC)
  ```
- `idx_orch_metrics_session`
  ```sql
  CREATE INDEX idx_orch_metrics_session ON public.orchestration_metrics USING btree (session_id)
  ```
- `idx_orch_metrics_venture`
  ```sql
  CREATE INDEX idx_orch_metrics_venture ON public.orchestration_metrics USING btree (venture_id)
  ```
- `orchestration_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX orchestration_metrics_pkey ON public.orchestration_metrics USING btree (metric_id)
  ```

## RLS Policies

### 1. Allow insert for authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. eva_metrics_company_access (SELECT)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))`

### 4. orchestration_metrics_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
