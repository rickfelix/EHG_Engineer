# ops_health_alerts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T18:30:46.422Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| layer | `text` | **NO** | - | Which monitoring layer: product or agent |
| metric_type | `text` | **NO** | - | Which health metric triggered the alert |
| actual_value | `numeric(12,4)` | **NO** | - | - |
| threshold_value | `numeric(12,4)` | **NO** | - | - |
| severity | `text` | **NO** | - | Alert severity: warning, critical, emergency |
| status | `text` | **NO** | `'open'::text` | Alert lifecycle: open -> acknowledged -> resolved/dismissed |
| agent_id | `uuid` | YES | - | For agent-layer alerts, the specific agent that triggered it |
| alert_date | `date` | **NO** | `CURRENT_DATE` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_health_alerts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_health_alerts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `ops_health_alerts_layer_check`: CHECK ((layer = ANY (ARRAY['product'::text, 'agent'::text])))
- `ops_health_alerts_metric_type_check`: CHECK ((metric_type = ANY (ARRAY['uptime'::text, 'p95_latency'::text, 'error_rate'::text, 'infra_cost'::text, 'response_quality'::text, 'decision_accuracy'::text, 'cost_per_action'::text, 'quota_utilization'::text, 'budget_remaining'::text])))
- `ops_health_alerts_severity_check`: CHECK ((severity = ANY (ARRAY['warning'::text, 'critical'::text, 'emergency'::text])))
- `ops_health_alerts_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])))

## Indexes

- `idx_ops_health_alerts_date`
  ```sql
  CREATE INDEX idx_ops_health_alerts_date ON public.ops_health_alerts USING btree (alert_date DESC)
  ```
- `idx_ops_health_alerts_venture_status`
  ```sql
  CREATE INDEX idx_ops_health_alerts_venture_status ON public.ops_health_alerts USING btree (venture_id, status) WHERE (status = ANY (ARRAY['open'::text, 'acknowledged'::text]))
  ```
- `ops_health_alerts_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_health_alerts_pkey ON public.ops_health_alerts USING btree (id)
  ```

## RLS Policies

### 1. ops_health_alerts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_health_alerts_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_health_alerts_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_health_alerts_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
