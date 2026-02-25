# eva_ventures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-25T20:22:28.434Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| name | `text` | **NO** | - | - |
| status | `text` | YES | `'active'::text` | - |
| health_status | `text` | YES | `'yellow'::text` | - |
| mrr | `numeric(12,2)` | YES | `0` | - |
| mrr_growth_rate | `numeric(5,2)` | YES | `0` | - |
| churn_rate | `numeric(5,2)` | YES | `0` | - |
| burn_rate | `numeric(12,2)` | YES | `0` | - |
| runway_months | `integer(32)` | YES | `0` | - |
| decision_class | `text` | YES | `'C'::text` | - |
| last_decision_at | `timestamp with time zone` | YES | - | - |
| pending_decisions | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| orchestrator_state | `text` | YES | `'idle'::text` | Current execution state: idle, processing, blocked, failed |
| orchestrator_lock_id | `uuid` | YES | - | UUID of the processing lock holder (null when idle) |
| orchestrator_lock_acquired_at | `timestamp with time zone` | YES | - | When the processing lock was acquired |
| autonomy_level | `USER-DEFINED` | **NO** | `'L0'::eva_autonomy_level` | EVA autonomy level: L0=Manual, L1=Assisted, L2=Partial, L3=Conditional, L4=Full |

## Constraints

### Primary Key
- `eva_ventures_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_ventures_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `eva_ventures_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `eva_ventures_decision_class_check`: CHECK ((decision_class = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
- `eva_ventures_health_status_check`: CHECK ((health_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])))
- `eva_ventures_orchestrator_state_check`: CHECK ((orchestrator_state = ANY (ARRAY['idle'::text, 'processing'::text, 'blocked'::text, 'failed'::text])))
- `eva_ventures_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'killed'::text, 'graduated'::text])))

## Indexes

- `eva_ventures_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_ventures_pkey ON public.eva_ventures USING btree (id)
  ```
- `eva_ventures_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX eva_ventures_venture_id_key ON public.eva_ventures USING btree (venture_id)
  ```
- `idx_eva_ventures_health`
  ```sql
  CREATE INDEX idx_eva_ventures_health ON public.eva_ventures USING btree (health_status)
  ```
- `idx_eva_ventures_orchestrator_lock`
  ```sql
  CREATE UNIQUE INDEX idx_eva_ventures_orchestrator_lock ON public.eva_ventures USING btree (id) WHERE (orchestrator_lock_id IS NOT NULL)
  ```
- `idx_eva_ventures_orchestrator_state`
  ```sql
  CREATE INDEX idx_eva_ventures_orchestrator_state ON public.eva_ventures USING btree (orchestrator_state) WHERE (orchestrator_state = 'processing'::text)
  ```
- `idx_eva_ventures_status`
  ```sql
  CREATE INDEX idx_eva_ventures_status ON public.eva_ventures USING btree (status)
  ```

## RLS Policies

### 1. eva_ventures_select_own (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. eva_ventures_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_auto_enqueue_venture

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION fn_auto_enqueue_venture()`

---

[← Back to Schema Overview](../database-schema-overview.md)
