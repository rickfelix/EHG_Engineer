# eva_automation_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T00:55:02.600Z
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_name | `character varying(255)` | **NO** | - | - |
| rule_type | `character varying(50)` | **NO** | - | - |
| decision_class | `character(1)` | **NO** | - | - |
| trigger_condition | `jsonb` | **NO** | - | - |
| action_template | `jsonb` | **NO** | - | - |
| guardrails | `jsonb` | **NO** | `'{"cool_down_hours": 24, "requires_approval": false, "max_daily_executions": 10}'::jsonb` | - |
| enabled | `boolean` | **NO** | `true` | - |
| priority | `integer(32)` | **NO** | `100` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |
| last_executed_at | `timestamp with time zone` | YES | - | - |
| execution_count | `integer(32)` | **NO** | `0` | - |
| success_count | `integer(32)` | **NO** | `0` | - |
| failure_count | `integer(32)` | **NO** | `0` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `eva_automation_rules_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_automation_rules_created_by_fkey`: created_by → users(id)

### Check Constraints
- `eva_automation_rules_decision_class_check`: CHECK ((decision_class = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar])))
- `eva_automation_rules_rule_type_check`: CHECK (((rule_type)::text = ANY ((ARRAY['auto_fix'::character varying, 'auto_draft'::character varying, 'alert'::character varying, 'escalation'::character varying])::text[])))

## Indexes

- `eva_automation_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_automation_rules_pkey ON public.eva_automation_rules USING btree (id)
  ```
- `idx_eva_automation_rules_class`
  ```sql
  CREATE INDEX idx_eva_automation_rules_class ON public.eva_automation_rules USING btree (decision_class)
  ```
- `idx_eva_automation_rules_enabled`
  ```sql
  CREATE INDEX idx_eva_automation_rules_enabled ON public.eva_automation_rules USING btree (enabled)
  ```
- `idx_eva_automation_rules_type`
  ```sql
  CREATE INDEX idx_eva_automation_rules_type ON public.eva_automation_rules USING btree (rule_type)
  ```

## RLS Policies

### 1. Service role full access to automation rules (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
