# eva_translation_gates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-12T18:57:55.663Z
**Rows**: 463
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate_type | `text` | **NO** | - | Type of translation gate: brainstorm_to_vision, vision_to_architecture, or architecture_to_sd |
| source_refs | `jsonb` | **NO** | `'[]'::jsonb` | Array of upstream artifact references, each as {type, id, key} |
| target_ref | `jsonb` | **NO** | `'{}'::jsonb` | Single downstream artifact reference as {type, id, key} |
| coverage_score | `integer(32)` | **NO** | - | Percentage (0-100) of upstream items addressed in the downstream artifact |
| gaps | `jsonb` | **NO** | `'[]'::jsonb` | Array of unaddressed items, each as {item, source, severity} |
| passed | `boolean` | **NO** | - | Whether the gate passed (true) or failed (false) based on coverage threshold |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional context: LLM reasoning, model used, execution duration, etc. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_translation_gates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_translation_gates_coverage_score_check`: CHECK (((coverage_score >= 0) AND (coverage_score <= 100)))
- `eva_translation_gates_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['brainstorm_to_vision'::text, 'vision_to_architecture'::text, 'architecture_to_sd'::text])))

## Indexes

- `eva_translation_gates_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_translation_gates_pkey ON public.eva_translation_gates USING btree (id)
  ```
- `idx_translation_gates_created_at`
  ```sql
  CREATE INDEX idx_translation_gates_created_at ON public.eva_translation_gates USING btree (created_at DESC)
  ```
- `idx_translation_gates_gate_type`
  ```sql
  CREATE INDEX idx_translation_gates_gate_type ON public.eva_translation_gates USING btree (gate_type)
  ```
- `idx_translation_gates_target_ref`
  ```sql
  CREATE INDEX idx_translation_gates_target_ref ON public.eva_translation_gates USING gin (target_ref)
  ```

## RLS Policies

### 1. anon_select_eva_translation_gates (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_select_eva_translation_gates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_eva_translation_gates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_eva_translation_gates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_translation_gates_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
