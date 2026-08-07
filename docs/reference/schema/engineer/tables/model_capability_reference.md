# model_capability_reference Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| problem_shape | `text` | **NO** | - | - |
| model_id | `text` | **NO** | - | - |
| effort | `text` | **NO** | - | - |
| task_id | `text` | **NO** | - | - |
| clears_bar | `boolean` | YES | - | - |
| quality_score | `numeric` | YES | - | - |
| tokens | `integer(32)` | YES | - | - |
| wall_clock_ms | `integer(32)` | YES | - | - |
| cost_norm | `numeric` | YES | - | - |
| graded_at | `timestamp with time zone` | YES | - | - |
| grader | `text` | YES | - | - |
| run_at | `timestamp with time zone` | YES | - | - |
| content_hash | `text` | **NO** | - | - |
| source_ref | `text` | **NO** | - | - |
| trusted_for_routing | `boolean` | **NO** | `false` | Fail-closed trust gate. DEFAULT false. Flipped true only by scripts/eval/ground-truth-gate.mjs after reproducing >=1 adjudicated result (incl. an adversarial negative). |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| bound_at | `timestamp with time zone` | YES | - | When the ground-truth binding gate (lib/eval/ground-truth-gate.mjs, EVAL-002-C) flipped trusted_for_routing=true. NULL until a grader verdict reproduces an independently-adjudicated verdict. |
| binding_id | `uuid` | YES | - | Provenance id of the binding run that flipped trusted_for_routing. Set ONLY by the sole-writer gate/regression path; NULL otherwise (incl. after a stale-bind clear). |

## Constraints

### Primary Key
- `model_capability_reference_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `model_capability_reference_task_id_model_id_effort_content__key`: UNIQUE (task_id, model_id, effort, content_hash)

### Check Constraints
- `model_capability_reference_effort_check`: CHECK ((effort = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'xhigh'::text])))
- `model_capability_reference_problem_shape_check`: CHECK ((problem_shape = ANY (ARRAY['R1-compounding'::text, 'R2-negative-space'::text, 'R3-taste'::text, 'R4-coupling'::text, 'R5-reversal'::text, 'mechanical-baseline'::text])))

## Indexes

- `model_capability_reference_pkey`
  ```sql
  CREATE UNIQUE INDEX model_capability_reference_pkey ON public.model_capability_reference USING btree (id)
  ```
- `model_capability_reference_task_id_model_id_effort_content__key`
  ```sql
  CREATE UNIQUE INDEX model_capability_reference_task_id_model_id_effort_content__key ON public.model_capability_reference USING btree (task_id, model_id, effort, content_hash)
  ```

## RLS Policies

### 1. model_capability_reference_service_write (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_model_capability_reference_binding_provenance

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION model_capability_reference_enforce_binding_provenance()`

### trg_model_capability_reference_binding_provenance

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION model_capability_reference_enforce_binding_provenance()`

---

[← Back to Schema Overview](../database-schema-overview.md)
