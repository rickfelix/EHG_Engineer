# experiment_outcomes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-23T20:56:03.959Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| assignment_id | `uuid` | **NO** | - | - |
| variant_key | `text` | **NO** | - | - |
| scores | `jsonb` | **NO** | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| evaluated_at | `timestamp with time zone` | **NO** | `now()` | - |
| data_origin | `text` | **NO** | `'organic'::text` | - |
| experiment_id | `uuid` | YES | - | Denormalized experiment reference for partial unique index on gate outcomes |
| kill_gate_stage | `integer(32)` | YES | - | Kill gate stage number (3, 5, or 13) where survival was evaluated |
| gate_passed | `boolean` | YES | - | Whether the venture survived this kill gate |
| gate_score | `numeric` | YES | - | Numeric score at the kill gate (e.g., composite gate score) |
| chairman_override | `boolean` | YES | - | Whether the chairman overrode the gate decision |
| time_to_gate_hours | `numeric` | YES | - | Elapsed hours from experiment assignment to gate evaluation |
| outcome_type | `text` | YES | `'synthesis'::text` | Discriminator: synthesis (Stage 0 eval) vs gate_survival (kill gate result) |

## Constraints

### Primary Key
- `experiment_outcomes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `experiment_outcomes_assignment_id_fkey`: assignment_id → experiment_assignments(id)
- `experiment_outcomes_experiment_id_fkey`: experiment_id → experiments(id)

### Check Constraints
- `experiment_outcomes_data_origin_check`: CHECK ((data_origin = ANY (ARRAY['organic'::text, 'synthetic'::text, 'imported'::text, 'retrospective'::text])))
- `experiment_outcomes_kill_gate_stage_check`: CHECK ((kill_gate_stage = ANY (ARRAY[3, 5, 13])))
- `experiment_outcomes_outcome_type_check`: CHECK ((outcome_type = ANY (ARRAY['synthesis'::text, 'gate_survival'::text])))

## Indexes

- `experiment_outcomes_pkey`
  ```sql
  CREATE UNIQUE INDEX experiment_outcomes_pkey ON public.experiment_outcomes USING btree (id)
  ```
- `idx_exp_outcomes_assignment_id`
  ```sql
  CREATE INDEX idx_exp_outcomes_assignment_id ON public.experiment_outcomes USING btree (assignment_id)
  ```
- `idx_experiment_outcomes_gate_unique`
  ```sql
  CREATE UNIQUE INDEX idx_experiment_outcomes_gate_unique ON public.experiment_outcomes USING btree (experiment_id, assignment_id, kill_gate_stage) WHERE (outcome_type = 'gate_survival'::text)
  ```
- `idx_experiment_outcomes_outcome_type`
  ```sql
  CREATE INDEX idx_experiment_outcomes_outcome_type ON public.experiment_outcomes USING btree (outcome_type)
  ```

## RLS Policies

### 1. service_role_experiment_outcomes (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_experiment_advancement

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION trigger_experiment_advancement()`

---

[← Back to Schema Overview](../database-schema-overview.md)
