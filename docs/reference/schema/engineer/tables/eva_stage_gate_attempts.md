# eva_stage_gate_attempts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 1,964
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| attempt_id | `uuid` | **NO** | `gen_random_uuid()` | Fresh UUID per evaluation call. NOT a cross-stage run identity -- see table comment. |
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| gate_type | `text` | **NO** | - | - |
| attempt_number | `integer(32)` | **NO** | - | - |
| resolved_outcome | `text` | YES | - | NULL = in-flight/interrupted. One of 7 canonical evaluation-disposition terms once finalized. Distinct from eva_stage_gate_results.resolved_outcome (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001), which is a different, orthogonal venture-outcome-calibration enum on a different table. |
| passed | `boolean` | YES | - | - |
| reasoning | `text` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| gate_criteria | `jsonb` | YES | - | - |
| evaluator | `text` | YES | - | - |
| opened_at | `timestamp with time zone` | **NO** | `now()` | - |
| finalized_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_stage_gate_attempts_pkey`: PRIMARY KEY (attempt_id)

### Foreign Keys
- `eva_stage_gate_attempts_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `esga_unique_attempt`: UNIQUE (venture_id, stage_number, gate_type, attempt_number)

### Check Constraints
- `esga_finalized_at_matches_outcome`: CHECK ((((resolved_outcome IS NULL) AND (finalized_at IS NULL)) OR ((resolved_outcome IS NOT NULL) AND (finalized_at IS NOT NULL))))
- `esga_gate_criteria_is_object`: CHECK (((gate_criteria IS NULL) OR (jsonb_typeof(gate_criteria) = 'object'::text)))
- `esga_metadata_is_object`: CHECK (((metadata IS NULL) OR (jsonb_typeof(metadata) = 'object'::text)))
- `esga_passed_matches_outcome`: CHECK ((((resolved_outcome = 'machine_pass'::text) AND (passed = true)) OR ((resolved_outcome = 'machine_fail'::text) AND (passed = false)) OR ((resolved_outcome <> ALL (ARRAY['machine_pass'::text, 'machine_fail'::text])) AND (passed IS NULL)) OR (resolved_outcome IS NULL)))
- `eva_stage_gate_attempts_attempt_number_check`: CHECK ((attempt_number >= 1))
- `eva_stage_gate_attempts_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['entry'::text, 'exit'::text, 'kill'::text])))
- `eva_stage_gate_attempts_resolved_outcome_check`: CHECK (((resolved_outcome IS NULL) OR (resolved_outcome = ANY (ARRAY['machine_pass'::text, 'machine_fail'::text, 'override'::text, 'chairman_adjudicated'::text, 'skip'::text, 'cannot_evaluate'::text, 'not_exercised'::text]))))
- `eva_stage_gate_attempts_stage_number_check`: CHECK ((stage_number > 0))

## Indexes

- `esga_unique_attempt`
  ```sql
  CREATE UNIQUE INDEX esga_unique_attempt ON public.eva_stage_gate_attempts USING btree (venture_id, stage_number, gate_type, attempt_number)
  ```
- `eva_stage_gate_attempts_finalized_idx`
  ```sql
  CREATE INDEX eva_stage_gate_attempts_finalized_idx ON public.eva_stage_gate_attempts USING btree (venture_id, stage_number, gate_type, finalized_at DESC) WHERE (resolved_outcome IS NOT NULL)
  ```
- `eva_stage_gate_attempts_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_stage_gate_attempts_pkey ON public.eva_stage_gate_attempts USING btree (attempt_id)
  ```
- `eva_stage_gate_attempts_venture_stage_idx`
  ```sql
  CREATE INDEX eva_stage_gate_attempts_venture_stage_idx ON public.eva_stage_gate_attempts USING btree (venture_id, stage_number, gate_type, attempt_number DESC)
  ```

## RLS Policies

### 1. eva_stage_gate_attempts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### eva_stage_gate_attempts_no_update_after_final

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION eva_stage_gate_attempts_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
