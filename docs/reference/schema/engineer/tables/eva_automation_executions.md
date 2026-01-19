# eva_automation_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T00:41:19.984Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| decision_id | `uuid` | YES | - | - |
| trigger_event | `jsonb` | **NO** | - | - |
| action_taken | `jsonb` | **NO** | - | - |
| status | `character varying(50)` | **NO** | - | - |
| blocked_reason | `text` | YES | - | - |
| result | `jsonb` | YES | - | - |
| executed_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `eva_automation_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_automation_executions_decision_id_fkey`: decision_id → eva_decisions(id)
- `eva_automation_executions_rule_id_fkey`: rule_id → eva_automation_rules(id)
- `eva_automation_executions_venture_id_fkey`: venture_id → eva_ventures(id)

### Check Constraints
- `eva_automation_executions_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'executing'::character varying, 'success'::character varying, 'failed'::character varying, 'blocked'::character varying, 'rolled_back'::character varying])::text[])))

## Indexes

- `eva_automation_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_automation_executions_pkey ON public.eva_automation_executions USING btree (id)
  ```
- `idx_eva_automation_executions_date`
  ```sql
  CREATE INDEX idx_eva_automation_executions_date ON public.eva_automation_executions USING btree (executed_at)
  ```
- `idx_eva_automation_executions_rule`
  ```sql
  CREATE INDEX idx_eva_automation_executions_rule ON public.eva_automation_executions USING btree (rule_id)
  ```
- `idx_eva_automation_executions_status`
  ```sql
  CREATE INDEX idx_eva_automation_executions_status ON public.eva_automation_executions USING btree (status)
  ```

## RLS Policies

### 1. Service role full access to automation executions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
