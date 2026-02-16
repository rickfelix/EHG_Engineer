# eva_stage_gate_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| gate_type | `text` | **NO** | - | entry = pre-stage check, exit = post-stage check, kill = critical threshold gate |
| overall_score | `numeric(5,2)` | YES | - | - |
| passed | `boolean` | **NO** | `false` | - |
| evaluated_at | `timestamp with time zone` | YES | `now()` | - |
| evaluated_by | `text` | YES | - | - |
| gate_criteria | `jsonb` | YES | `'{}'::jsonb` | JSONB storing individual criterion scores (e.g., {"market_validation": 85, "team_readiness": 65}) |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_stage_gate_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_stage_gate_results_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `eva_stage_gate_results_venture_id_stage_number_gate_type_ev_key`: UNIQUE (venture_id, stage_number, gate_type, evaluated_at)

### Check Constraints
- `eva_stage_gate_results_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['entry'::text, 'exit'::text, 'kill'::text])))
- `eva_stage_gate_results_overall_score_check`: CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)))
- `eva_stage_gate_results_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 25)))

## Indexes

- `eva_stage_gate_results_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_stage_gate_results_pkey ON public.eva_stage_gate_results USING btree (id)
  ```
- `eva_stage_gate_results_venture_id_stage_number_gate_type_ev_key`
  ```sql
  CREATE UNIQUE INDEX eva_stage_gate_results_venture_id_stage_number_gate_type_ev_key ON public.eva_stage_gate_results USING btree (venture_id, stage_number, gate_type, evaluated_at)
  ```
- `idx_eva_gate_results_stage_type`
  ```sql
  CREATE INDEX idx_eva_gate_results_stage_type ON public.eva_stage_gate_results USING btree (stage_number, gate_type)
  ```
- `idx_eva_gate_results_venture`
  ```sql
  CREATE INDEX idx_eva_gate_results_venture ON public.eva_stage_gate_results USING btree (venture_id, stage_number)
  ```

## RLS Policies

### 1. authenticated_read_own_gate_results (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. service_role_all_eva_gate_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_enforce_kill_gate_threshold

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_kill_gate_threshold()`

### trigger_enforce_kill_gate_threshold

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_kill_gate_threshold()`

---

[← Back to Schema Overview](../database-schema-overview.md)
